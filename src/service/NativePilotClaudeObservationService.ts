// SPDX-License-Identifier: Apache-2.0
import { NativeClaudeObservationValidator } from '../validator/NativeClaudeObservationValidator.ts';
import type { NativeClaudeObservationRecord } from '../validator/NativeClaudeObservationValidator.ts';
import type { NativeClaudeRawSelection } from '../config/NativeClaudeRawConfiguration.ts';
import type { NativeClaudeSourceSnapshot } from '../repository/NativeClaudeRawProcessRepository.ts';
import type { NativePilotContract } from '../config/NativePilotConfiguration.ts';
import type { NativePilotInventory } from '../repository/NativePilotInventoryRepository.ts';
import { projectionObject } from '../repository/NativePilotObservationEvidenceRepository.ts';
import { NativePilotNpmEnvironmentRepository } from '../repository/NativePilotNpmEnvironmentRepository.ts';
import { posix } from 'node:path';

export interface NativePilotClaudeRetainedInput {
    selection: NativeClaudeRawSelection;
    contract: NativePilotContract;
    source: NativePilotInventory;
    context: any;
    report: any;
    records: NativeClaudeObservationRecord[];
    diagnostic: Buffer | null;
    before: NativeClaudeSourceSnapshot | null;
    after: NativeClaudeSourceSnapshot | null;
    inputs_unchanged: boolean;
    observer_pid: number;
    observer_start_ticks: string;
    expected_nonce: string;
    expected_inputs: Record<string, string>;
    expected_environment: string[];
}

/** Pure binding of actual retained Claude bytes to the reviewed selected-version codec. */
export class NativePilotClaudeObservationService {
    validate(input: NativePilotClaudeRetainedInput) {
        const context = projectionObject(input.context, [
            'schema_version',
            'mode',
            'contract',
            'nonce',
            'selection',
            'account',
            'environment',
            'platform',
            'observer_pid',
            'observer_start_ticks',
            'no_new_privileges',
            'seccomp',
            'capabilities',
            'routes',
            'inputs',
            'evidence_scope',
        ]);
        if (
            context.schema_version !== 1 ||
            context.mode !== 'native' ||
            context.nonce !== input.expected_nonce ||
            context.observer_pid !== input.observer_pid ||
            context.observer_start_ticks !== input.observer_start_ticks ||
            JSON.stringify(context.selection) !== JSON.stringify(input.selection) ||
            JSON.stringify(context.contract) !== JSON.stringify(input.contract) ||
            context.evidence_scope !== 'context-measurement-only' ||
            context.platform !== 'linux/arm64'
        )
            throw new Error('projection_claude_context');
        projectionObject(context.account, ['name', 'uid', 'gid', 'home']);
        projectionObject(context.capabilities, ['CapEff', 'CapPrm', 'CapBnd']);
        if (
            context.account.name !== 'node' ||
            context.account.uid !== 1000 ||
            context.account.gid !== 1000 ||
            context.account.home !== posix.join('/', 'home', 'node') ||
            context.no_new_privileges !== '1' ||
            context.seccomp !== '2' ||
            Object.values(context.capabilities).some((value) => value !== '0000000000000000') ||
            JSON.stringify(context.routes) !== '[]' ||
            !Array.isArray(input.expected_environment) ||
            !Array.isArray(context.environment)
        )
            throw new Error('projection_claude_confinement');
        const expectedEnvironment = new Map(
            input.expected_environment.map((entry) => [
                entry.slice(0, entry.indexOf('=')),
                entry.slice(entry.indexOf('=') + 1),
            ]),
        );
        for (const [key, value] of Object.entries(NativePilotNpmEnvironmentRepository.additions))
            expectedEnvironment.set(key, value);
        if (
            JSON.stringify(context.environment) !==
            JSON.stringify([...expectedEnvironment].map(([key, value]) => `${key}=${value}`).sort())
        )
            throw new Error('projection_claude_environment');
        projectionObject(context.inputs, Object.keys(input.expected_inputs));
        if (
            Object.entries(input.expected_inputs).some(
                ([name, digest]) => context.inputs[name] !== digest,
            )
        )
            throw new Error('projection_claude_input_identity');
        const report = projectionObject(input.report, [
            'schema_version',
            'selection',
            'mode',
            'status',
            'reason',
            'native_acceptance',
            'diagnostic_status',
            'init_attempted',
            'processes',
            'semantic_checks',
            'mcp_state',
            'lifecycle_checks',
            'unmeasured',
        ]);
        if (
            report.schema_version !== 2 ||
            report.mode !== 'native' ||
            report.status !== 'captured' ||
            report.native_acceptance !== false ||
            JSON.stringify(report.selection) !== JSON.stringify(input.selection) ||
            !Array.isArray(report.processes) ||
            report.processes.length !== input.records.length
        )
            throw new Error('projection_claude_report');
        for (const [index, record] of input.records.entries()) {
            const { stdout, stderr, ...process } = record.process;
            if (
                JSON.stringify(report.processes[index]) !==
                JSON.stringify({ label: record.command.label, ...process })
            )
                throw new Error('projection_claude_process_receipt');
        }
        const absence = ['baseline', 'verify-absent'].includes(input.selection.phase);
        if (
            report.init_attempted !== !absence ||
            (!absence && report.diagnostic_status !== 'retained')
        )
            throw new Error('projection_claude_init_boundary');
        for (const snapshot of [input.before, input.after]) {
            if (
                !absence &&
                (!snapshot ||
                    JSON.stringify(snapshot.actual_inventory) !== JSON.stringify(input.source) ||
                    JSON.stringify(snapshot.selected_inventory) !== JSON.stringify(input.source))
            )
                throw new Error('projection_claude_source_bytes');
        }
        const derived = new NativeClaudeObservationValidator().project({
            selection: input.selection,
            contract: input.contract,
            records: input.records,
            diagnostic: input.diagnostic,
            before: input.before,
            after: input.after,
            inputs_unchanged: input.inputs_unchanged,
            observer_pid: input.observer_pid,
        });
        if (JSON.stringify(derived) !== JSON.stringify(report.semantic_checks))
            throw new Error('projection_claude_semantic_mismatch');
        if (derived.status === 'blocked' || (!absence && derived.status !== 'observed'))
            throw new Error('projection_claude_supported_checks');
        return derived;
    }
}
