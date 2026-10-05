// SPDX-License-Identifier: Apache-2.0
import { basename } from 'node:path';
import { NativeClaudeRawConfiguration } from '../config/NativeClaudeRawConfiguration.ts';
import { NativeClaudeRawArtifactRepository } from '../repository/NativeClaudeRawArtifactRepository.ts';
import type { NativeClaudeRawArtifact } from '../repository/NativeClaudeRawArtifactRepository.ts';
import { NativeClaudeRawProcessRepository } from '../repository/NativeClaudeRawProcessRepository.ts';
import type { NativeClaudeRawTransport } from '../repository/NativeClaudeRawProcessRepository.ts';
import type { NativeClaudeSourceSnapshot } from '../repository/NativeClaudeRawProcessRepository.ts';
import { NativeClaudeObservationValidator } from '../validator/NativeClaudeObservationValidator.ts';
import type { NativeClaudeObservationRecord } from '../validator/NativeClaudeObservationValidator.ts';
import { NativePilotStateSnapshotRepository } from '../repository/NativePilotStateSnapshotRepository.ts';
import type { NativePilotStateSnapshot } from '../repository/NativePilotStateSnapshotRepository.ts';

type NativeClaudeStateReader = Pick<
    NativePilotStateSnapshotRepository,
    'snapshot' | 'artifacts' | 'readOnlyPreservation'
>;

export interface NativeClaudeMcpStateObservation {
    schema_version: 1;
    scope: 'native-mcp-health-reads-before-init';
    status: 'not-run' | 'captured' | 'blocked';
    reason: string;
    preservation: 'absence_preserved' | 'existing_unchanged' | 'blocked' | null;
    snapshots: Array<
        NativeClaudeRawArtifact & {
            role: 'state-before-mcp' | 'state-after-mcp' | 'state-bytes';
        }
    >;
}

/** Fixed bounded native capture and separately qualified supported-fact projection. */
export class NativeClaudeRawObserverDispatcher {
    private readonly transport: NativeClaudeRawTransport;
    private readonly files: NativeClaudeRawArtifactRepository;
    private readonly now: () => number;
    private readonly state: (home: string, root: string) => NativeClaudeStateReader;

    constructor(
        transport: NativeClaudeRawTransport = new NativeClaudeRawProcessRepository(),
        files = new NativeClaudeRawArtifactRepository(),
        now = () => Date.now(),
        state = (home: string, root: string): NativeClaudeStateReader =>
            new NativePilotStateSnapshotRepository({ home, outputRoot: root }),
    ) {
        this.transport = transport;
        this.files = files;
        this.now = now;
        this.state = state;
    }

    async run(argv: string[]) {
        const deadline = this.now() + NativeClaudeRawConfiguration.phaseMs;
        const configuration = new NativeClaudeRawConfiguration();
        const selection = configuration.selection(argv);
        const context = await this.transport.context(selection);
        const diagnostic = configuration.diagnostic(selection);
        const absence = selection.phase === 'baseline' || selection.phase === 'verify-absent';
        if (!absence) this.files.absent(diagnostic);
        const root = this.files.create(
            '/pilot/native-output',
            `${selection.run_id}-claude-r${selection.repetition}-${selection.phase}-raw`,
        );
        const artifacts: NativeClaudeRawArtifact[] = [];
        const retainJson = (name: string, value: unknown) =>
            artifacts.push(
                this.files.retain(root, name, Buffer.from(JSON.stringify(value) + '\n')),
            );
        retainJson('context.json', context);
        const processes: unknown[] = [];
        const records: NativeClaudeObservationRecord[] = [];
        let before: NativeClaudeSourceSnapshot | null = null;
        let after: NativeClaudeSourceSnapshot | null = null;
        let diagnosticBytes: Buffer | null = null;
        let inputsUnchanged = false;
        let status: 'captured' | 'failed' | 'blocked' = 'captured';
        let reason = 'raw_recipe_completed_semantics_ungraded';
        let initAttempted = false;
        let diagnosticStatus: 'not-run' | 'absent' | 'retained' | 'blocked' = 'not-run';
        let stateReader: NativeClaudeStateReader | null = null;
        let stateBefore: NativePilotStateSnapshot | null = null;
        let stateAfter: NativePilotStateSnapshot | null = null;
        let stateAfterAttempted = false;
        const mcpState: NativeClaudeMcpStateObservation = {
            schema_version: 1,
            scope: 'native-mcp-health-reads-before-init',
            status: 'not-run',
            reason: absence ? 'no-init-absence-recipe-state-not-selected' : 'health-reads-not-run',
            preservation: null,
            snapshots: [],
        };
        const stateSnapshot = (label: 'mcp-before' | 'mcp-after') => {
            if (!stateReader) throw new Error('raw_state_reader_unavailable');
            if (label === 'mcp-after') stateAfterAttempted = true;
            const snapshot = stateReader.snapshot(label);
            const receipts = stateReader.artifacts(label);
            artifacts.push(...receipts);
            mcpState.snapshots.push(
                ...receipts.map((receipt) => ({
                    ...receipt,
                    path: `${basename(root)}/${receipt.path}`,
                    role:
                        receipt.path === `${label}-state.json`
                            ? label === 'mcp-before'
                                ? ('state-before-mcp' as const)
                                : ('state-after-mcp' as const)
                            : ('state-bytes' as const),
                })),
            );
            return snapshot;
        };
        const recipe = configuration.commands(
            context.contract.mcp.claude[selection.pin],
            diagnostic,
            selection.phase,
        );
        try {
            for (let index = 0; index < recipe.length; index++) {
                if (deadline - this.now() < 1) {
                    status = 'blocked';
                    reason = 'raw_phase_budget';
                    break;
                }
                if (!absence && recipe[index].label === 'mcp-list') {
                    mcpState.status = 'blocked';
                    mcpState.reason = 'state-snapshot-incomplete';
                    stateReader = this.state(context.account.home, root);
                    stateBefore = stateSnapshot('mcp-before');
                }
                if (recipe[index].label === 'init-only') {
                    before = await this.transport.snapshot(context);
                    retainJson('source-before.json', before);
                }
                // Snapshot time belongs to the phase budget. The retained request is the actual one.
                const remaining = deadline - this.now();
                if (remaining < 1) {
                    status = 'blocked';
                    reason = 'raw_phase_budget';
                    break;
                }
                const command = {
                    ...recipe[index],
                    timeout_ms: Math.min(recipe[index].timeout_ms, remaining),
                };
                const prefix = `${String(index + 1).padStart(2, '0')}-${command.label}`;
                retainJson(`${prefix}-request.json`, command);
                if (command.label === 'init-only') initAttempted = true;
                const result = await this.transport.run(command);
                artifacts.push(this.files.retain(root, `${prefix}.stdout`, result.stdout));
                artifacts.push(this.files.retain(root, `${prefix}.stderr`, result.stderr));
                const { stdout: _stdout, stderr: _stderr, ...process } = result;
                const receipt = { label: command.label, ...process };
                processes.push(receipt);
                records.push({ command, process: result });
                retainJson(`${prefix}-process.json`, receipt);
                if (!absence && command.label === 'mcp-get') {
                    stateAfter = stateSnapshot('mcp-after');
                }
                if (command.label === 'init-only') {
                    try {
                        const raw = this.files.read(
                            diagnostic,
                            NativeClaudeRawConfiguration.diagnosticBytes,
                        );
                        artifacts.push(this.files.retain(root, 'claude-diagnostic.log', raw));
                        diagnosticBytes = raw;
                        diagnosticStatus = 'retained';
                    } catch (error) {
                        diagnosticStatus =
                            (error as NodeJS.ErrnoException).code === 'ENOENT'
                                ? 'absent'
                                : 'blocked';
                    }
                    after = await this.transport.snapshot(context);
                    retainJson('source-after.json', after);
                }
                const authControl = command.label.startsWith('auth-') && result.exit_code === 1;
                const absentControl =
                    absence && command.label === 'mcp-get' && result.exit_code === 1;
                if (
                    result.status !== 'completed' ||
                    result.signal !== null ||
                    (result.exit_code !== 0 && !authControl && !absentControl) ||
                    result.cleanup !== 'group-absent'
                ) {
                    status = 'failed';
                    reason = 'raw_native_call_incomplete_or_nonzero';
                    break;
                }
            }
            inputsUnchanged = await this.transport.recheck(context);
            if (!inputsUnchanged) {
                status = 'failed';
                reason = 'raw_selected_inputs_changed';
            }
        } catch {
            status = 'blocked';
            reason = 'raw_capture_or_recheck_failed';
        } finally {
            // A failed health call still retains a closing snapshot. Init is never in this bracket.
            if (stateBefore && !stateAfterAttempted) {
                try {
                    stateAfter = stateSnapshot('mcp-after');
                } catch {
                    mcpState.reason = 'state-after-unavailable';
                }
            }
        }
        if (stateReader && stateBefore && stateAfter) {
            const completed = ['mcp-list', 'mcp-get'].every((label) => {
                const observed = records.find((record) => record.command.label === label)?.process;
                return (
                    observed?.status === 'completed' &&
                    observed.exit_code === 0 &&
                    observed.signal === null &&
                    observed.cleanup === 'group-absent'
                );
            });
            mcpState.preservation = completed
                ? stateReader.readOnlyPreservation(stateBefore, stateAfter)
                : 'blocked';
            mcpState.status = mcpState.preservation === 'blocked' ? 'blocked' : 'captured';
            mcpState.reason = !completed
                ? 'health-read-call-incomplete-or-nonzero'
                : mcpState.preservation === 'blocked'
                  ? 'state-changed-or-schema-unsupported'
                  : 'two-state-snapshots-around-completed-health-reads-before-init';
        }
        retainJson('mcp-state.json', mcpState);
        const semantics = new NativeClaudeObservationValidator().project({
            selection,
            contract: context.contract,
            records,
            diagnostic: diagnosticBytes,
            before,
            after,
            inputs_unchanged: inputsUnchanged,
            observer_pid: context.observer_pid,
        });
        retainJson('semantics.json', semantics);
        const report = {
            schema_version: 2,
            selection,
            mode: context.mode,
            status,
            reason,
            native_acceptance: false,
            diagnostic_status: diagnosticStatus,
            init_attempted: initAttempted,
            processes,
            semantic_checks: semantics,
            mcp_state: mcpState,
            lifecycle_checks: 'not-run',
            unmeasured: [
                ...semantics.unsupported.filter(
                    (gate) =>
                        gate !== 'read-only-mcp-state-preservation' ||
                        mcpState.status !== 'captured',
                ),
                'unrelated-settings-preservation',
                'prior-state-rows-preservation',
                'database-schema-rollback',
                'A/B/A-lifecycle',
                'official-conformance',
                'independent-native-acceptance',
            ],
        };
        retainJson('observation.json', report);
        return {
            schema_version: 2,
            ...selection,
            status,
            reason,
            native_acceptance: false,
            semantic_status: semantics.status,
            evidence_root: root,
            evidence: artifacts,
        };
    }
}
