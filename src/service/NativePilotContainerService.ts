// SPDX-License-Identifier: Apache-2.0
import type { NativePilotPreparation } from '../repository/NativePilotPreparationRepository.ts';
import { NativePilotContainerRepository } from '../repository/NativePilotContainerRepository.ts';
import { NativePilotDockerRepository } from '../repository/NativePilotDockerRepository.ts';
import type { NativePilotDockerExecutor } from '../repository/NativePilotDockerRepository.ts';
import {
    NativePilotContainerValidator,
    containerRecord,
    requireContainer,
    containerPath,
} from '../validator/NativePilotContainerValidator.ts';
import type {
    NativePilotContainerPin,
    NativePilotContainerIdentity,
} from '../validator/NativePilotContainerValidator.ts';
import type { NativePilotSelection, NativePilotStep } from '../config/NativePilotConfiguration.ts';
import { NativePilotPlanService } from './NativePilotPlanService.ts';
import { NativePilotProcessAuditRepository } from '../repository/NativePilotProcessAuditRepository.ts';

export interface NativePilotControllerFacts {
    schema_version: 1;
    phase: string;
    selection: NativePilotSelection;
    native_acceptance: false;
    container_id: string | null;
    commands: Array<{ process: unknown; stdout: string; stderr: string }>;
    evidence: Array<{
        path: string;
        sha256: string;
        bytes: number;
        kind: 'confinement' | 'process' | 'retention';
    }>;
}

export interface NativePilotInitialCapture {
    schema_version: 1;
    kind: 'raw-initial-native-capture';
    status: 'captured' | 'completed-nonzero' | 'blocked';
    selection: NativePilotSelection;
    native_acceptance: false;
    lifecycle_phase_approval: false;
    observed_recipe_process_records: number;
    boundary: NativePilotControllerFacts | null;
    phases: NativePilotControllerFacts[];
    cleanup: NativePilotControllerFacts | null;
    failure: {
        phase: string;
        index: number | null;
        reason: 'completed-nonzero' | 'control-or-process-state-unverified';
    } | null;
    skipped_native_calls: Array<{ phase: string; index: number }>;
    unrun: string[];
}

/** Concrete bounded OS controller. Native semantic acceptance remains with the host observer. */
export class NativePilotContainerService {
    readonly validator = new NativePilotContainerValidator();
    readonly files: NativePilotContainerRepository;
    readonly docker: NativePilotDockerRepository;
    readonly pin: NativePilotContainerPin;
    readonly plan: NativePilotStep[];
    private id: string | null = null;
    private created = new Set<keyof NativePilotContainerIdentity['volumes']>();
    private sequence = 0;
    private ready = false;
    private aborted = false;
    private removed = false;
    private boundaryFacts: NativePilotControllerFacts | null = null;
    private captureOnly = false;

    constructor(
        prepared: NativePilotPreparation,
        selection: NativePilotSelection,
        input: unknown,
        execute: NativePilotDockerExecutor,
        verifyHost?: () => void,
    ) {
        this.pin = this.validator.pin(input, prepared.contract);
        this.files = new NativePilotContainerRepository(prepared, selection, this.pin);
        this.docker = new NativePilotDockerRepository(
            this.pin,
            this.files.root,
            execute,
            verifyHost,
            (request, output) => this.files.trace(request, output),
        );
        this.plan = new NativePilotPlanService().plan(
            prepared,
            selection,
            'disposable-container-v1',
        );
    }

    private capture(
        facts: NativePilotControllerFacts,
        label: string,
        kind: NativePilotControllerFacts['evidence'][number]['kind'],
        value: unknown,
    ) {
        const receipt = this.files.evidence(label, value);
        facts.evidence.push({ ...receipt, kind });
        return value;
    }

    private async inspected(running: boolean) {
        requireContainer(this.id, 'No selected container ID.');
        return this.validator.inspect(
            await this.docker.inspect(this.id!),
            this.pin,
            this.files.owned,
            this.id!,
            running,
        );
    }

    private async audit(facts?: NativePilotControllerFacts) {
        await this.inspected(true);
        const value = containerRecord(
            JSON.parse(await this.docker.worker(this.id!, { name: 'audit' })),
        );
        requireContainer(
            value.schema_version === 1 &&
                value.operation === 'audit' &&
                value.nonce === this.files.owned.nonce &&
                JSON.stringify(value.selection) === JSON.stringify(this.files.selection) &&
                NativePilotProcessAuditRepository.quiescent(value),
            'Owned live-process/listener absence was not measured.',
        );
        if (facts) this.capture(facts, 'process-audit', 'process', value);
        return value;
    }

    private async measured(facts: NativePilotControllerFacts, fresh: boolean) {
        const inspection = await this.inspected(true);
        const probe = this.validator.probe(
            JSON.parse(await this.docker.worker(this.id!, { name: 'probe', fresh })),
            this.pin,
            this.files.owned,
            this.files.request.expected,
            fresh,
        );
        this.capture(facts, 'confinement', 'confinement', { inspection, probe });
    }

    private async start(facts: NativePilotControllerFacts) {
        this.files.stage();
        this.docker.boundUntil(Date.now() + 1_800_000);
        const image = await this.docker.image();
        this.validator.image(image, this.pin);
        this.capture(facts, 'image-inspection', 'confinement', image);
        for (const role of Object.keys(this.files.owned.volumes) as Array<
            keyof NativePilotContainerIdentity['volumes']
        >) {
            requireContainer(
                !(await this.docker.volumeExists(this.files.owned.volumes[role])),
                'Selected volume already exists; no reuse allowed.',
            );
            requireContainer(
                (await this.docker.volumeCreate(this.files.owned, role)).trim() ===
                    this.files.owned.volumes[role],
                'Volume creation identity differs.',
            );
            this.created.add(role);
            const inspection = await this.docker.volumeInspect(this.files.owned.volumes[role]);
            this.validator.volume(inspection, this.files.owned, role);
            this.capture(facts, 'volume-inspection', 'confinement', inspection);
        }
        this.id = (await this.docker.create(this.files.owned)).trim();
        requireContainer(
            /^[a-f0-9]{64}$/.test(this.id) && this.files.partialContainerId() === this.id,
            'Create result and owned cidfile differ.',
        );
        await this.inspected(false);
        await this.docker.start(this.id);
        await this.measured(facts, true);
        await this.audit(facts);
        this.ready = true;
    }

    async inspectBoundary(): Promise<NativePilotControllerFacts> {
        requireContainer(
            this.sequence === 0 &&
                !this.ready &&
                !this.aborted &&
                !this.removed &&
                !this.captureOnly,
            'Boundary probe must start a fresh lane.',
        );
        const facts: NativePilotControllerFacts = {
            schema_version: 1,
            phase: 'preflight',
            selection: this.files.selection,
            native_acceptance: false,
            container_id: null,
            commands: [],
            evidence: [],
        };
        try {
            await this.start(facts);
            facts.container_id = this.id;
            this.boundaryFacts = structuredClone(facts);
            return facts;
        } catch (error) {
            await this.abort();
            throw error;
        }
    }

    async closeBoundaryInspection(): Promise<NativePilotControllerFacts> {
        requireContainer(
            this.sequence === 0 &&
                this.ready &&
                this.boundaryFacts &&
                !this.aborted &&
                !this.removed &&
                !this.captureOnly,
            'Only an open probe-only lane can use this close operation.',
        );
        return await this.retainAndCleanup('boundary-cleanup');
    }

    private async retainAndCleanup(phase: 'boundary-cleanup' | 'capture-cleanup') {
        const facts: NativePilotControllerFacts = {
            schema_version: 1,
            phase,
            selection: this.files.selection,
            native_acceptance: false,
            container_id: this.id,
            commands: [],
            evidence: [],
        };
        try {
            this.files.assertStage();
            await this.audit(facts);
            facts.evidence.push({
                ...this.files.retain(await this.docker.worker(this.id!, { name: 'export' })),
                kind: 'retention',
            });
            facts.commands.push({
                process: { status: 'completed', exit_code: 0, signal: null },
                stdout: '',
                stderr: '',
            });
            await this.cleanup(facts);
            this.ready = false;
            return facts;
        } catch (error) {
            await this.abort();
            throw error;
        }
    }

    /** Raw capture deliberately does not advance or approve the ordinary lifecycle. */
    async captureInitialInstallation(): Promise<NativePilotInitialCapture> {
        requireContainer(
            this.sequence === 0 &&
                !this.ready &&
                !this.aborted &&
                !this.removed &&
                !this.captureOnly,
            'Initial native capture requires a fresh unused lane.',
        );
        this.captureOnly = true;
        const steps = ['install-a', 'observe-a'].map((id) =>
            this.plan.find((step) => step.id === id)!,
        );
        const report: NativePilotInitialCapture = {
            schema_version: 1,
            kind: 'raw-initial-native-capture',
            status: 'blocked',
            selection: this.files.selection,
            native_acceptance: false,
            lifecycle_phase_approval: false,
            observed_recipe_process_records: 0,
            boundary: null,
            phases: [],
            cleanup: null,
            failure: null,
            skipped_native_calls: steps.flatMap((step) =>
                step.commands.map((_, index) => ({ phase: step.id, index })),
            ),
            unrun: [
                'baseline',
                'update-b',
                'observe-b',
                'rollback-a',
                'observe-restored-a',
                'uninstall',
                'verify-preserved',
                'remove-marketplace',
                'verify-absent',
                'preservation-acceptance',
                'host-semantic-acceptance',
            ],
        };
        let phase = 'boundary';
        let index: number | null = null;
        const facts = (id: string): NativePilotControllerFacts => ({
            schema_version: 1,
            phase: id,
            selection: this.files.selection,
            native_acceptance: false,
            container_id: this.id,
            commands: [],
            evidence: [],
        });
        try {
            report.boundary = facts('preflight');
            await this.start(report.boundary);
            report.boundary.container_id = this.id;
            report.status = 'captured';
            capture: for (const step of steps) {
                phase = step.id;
                const observed = facts(phase);
                report.phases.push(observed);
                for (index = 0; index < step.commands.length; index++) {
                    report.skipped_native_calls.shift();
                    const process = await this.command(observed, step, index, true);
                    if (process.exit_code !== 0) {
                        report.status = 'completed-nonzero';
                        report.failure = { phase, index, reason: 'completed-nonzero' };
                        break capture;
                    }
                }
                phase = `${step.id}-audit`;
                index = null;
                await this.audit(observed);
            }
            phase = 'capture-cleanup';
            index = null;
            report.cleanup = await this.retainAndCleanup('capture-cleanup');
        } catch {
            report.status = 'blocked';
            report.failure = {
                phase,
                index,
                reason: 'control-or-process-state-unverified',
            };
            await this.abort();
        }
        report.observed_recipe_process_records = report.phases.reduce(
            (count, phase) => count + phase.commands.length,
            0,
        );
        return report;
    }

    private async command(
        facts: NativePilotControllerFacts,
        step: NativePilotStep,
        index: number,
        retainNonzero = false,
    ) {
        requireContainer(
            this.ready && this.id,
            'Measured confinement is required before any native command.',
        );
        await this.inspected(true);
        this.files.assertStage();
        const raw = containerRecord(
            JSON.parse(
                await this.docker.worker(
                    this.id!,
                    { name: 'execute', phase: step.id, index },
                    step.commands[index].timeout_ms + 2000,
                ),
            ),
        );
        requireContainer(
            raw.schema_version === 1 &&
                raw.operation === 'execute' &&
                raw.nonce === this.files.owned.nonce &&
                JSON.stringify(raw.selection) === JSON.stringify(this.files.selection) &&
                raw.phase === step.id &&
                raw.index === index &&
                typeof raw.stdout === 'string' &&
                typeof raw.stderr === 'string' &&
                Buffer.byteLength(raw.stdout) + Buffer.byteLength(raw.stderr) <= 1_048_576,
            'Worker command identity differs.',
        );
        const actual = new NativePilotPlanService()
            .plan(
                { root: containerPath.root, contract: this.files.prepared.contract },
                this.files.selection,
            )
            .find((planned) => planned.id === step.id)!.commands[index];
        requireContainer(
            JSON.stringify(raw.command) === JSON.stringify(actual),
            'Actual worker command differs from fixed container recipe.',
        );
        this.capture(facts, 'native-process', 'process', {
            planned_command: step.commands[index],
            actual_command: actual,
            observation: raw,
        });
        const observed = containerRecord(raw.process);
        facts.commands.push({
            process: observed,
            stdout: raw.stdout,
            stderr: raw.stderr,
        });
        requireContainer(
            observed.status === 'completed' &&
                Number.isSafeInteger(observed.exit_code) &&
                observed.exit_code >= 0 &&
                (retainNonzero || observed.exit_code === 0) &&
                observed.signal === null,
            'Selected process did not complete successfully.',
        );
        return observed;
    }

    async perform(step: NativePilotStep): Promise<NativePilotControllerFacts> {
        requireContainer(
            !this.aborted &&
                !this.removed &&
                !this.captureOnly &&
                JSON.stringify(step) === JSON.stringify(this.plan[this.sequence]),
            'Closed phase order or command recipe differs.',
        );
        const facts: NativePilotControllerFacts = {
            schema_version: 1,
            phase: step.id,
            selection: this.files.selection,
            native_acceptance: false,
            container_id: this.id,
            commands: [],
            evidence: [],
        };
        try {
            if (step.id === 'preflight') {
                if (!this.ready) await this.start(facts);
                else
                    requireContainer(
                        this.boundaryFacts,
                        'Existing container has no retained probe.',
                    );
                if (this.boundaryFacts) facts.evidence.push(...this.boundaryFacts.evidence);
            }
            requireContainer(this.ready, 'Confinement preflight has not completed.');
            if (step.operation === 'switch') {
                await this.audit(facts);
                this.files.select(step.pin === 'b' ? 'b' : 'a');
                await this.measured(facts, false);
            } else if (step.id === 'retain') {
                this.files.assertStage();
                await this.audit(facts);
                const raw = await this.docker.worker(this.id!, { name: 'export' });
                facts.evidence.push({ ...this.files.retain(raw), kind: 'retention' });
                facts.commands.push({
                    process: { status: 'completed', exit_code: 0, signal: null },
                    stdout: '',
                    stderr: '',
                });
            } else if (step.id === 'cleanup-owned') {
                await this.cleanup(facts);
            } else {
                for (const index of step.commands.keys()) {
                    const process = await this.command(facts, step, index, true);
                    if (process.exit_code !== 0) break;
                }
                if (['stop-a', 'stop-b', 'stop-restored-a', 'cleanup-processes'].includes(step.id))
                    await this.audit(facts);
            }
            if (!['retain', 'cleanup-owned'].includes(step.id)) {
                await this.audit(facts);
                const raw = await this.docker.worker(this.id!, { name: 'export' });
                facts.evidence.push({ ...this.files.retain(raw, step.id), kind: 'retention' });
            }
            this.sequence++;
            facts.container_id = this.id;
            return facts;
        } catch (error) {
            await this.abort();
            throw error;
        }
    }

    private async stopped() {
        try {
            await this.docker.stop(this.id!);
        } catch {
            await this.docker.kill(this.id!);
        }
        return await this.inspected(false);
    }

    private async cleanup(facts: NativePilotControllerFacts) {
        const receipt = this.files.verifyRetention();
        await this.audit(facts);
        this.docker.beginCleanup();
        const stopped = await this.stopped();
        this.files.assertStage();
        this.files.verifyRetention();
        // Inspection and successful retention precede every destructive resource removal.
        for (const role of this.created)
            this.validator.volume(
                await this.docker.volumeInspect(this.files.owned.volumes[role]),
                this.files.owned,
                role,
            );
        await this.docker.remove(this.id!);
        requireContainer(
            !(await this.docker.containerExists(this.id!)),
            'Container removal was not observed.',
        );
        this.removed = true;
        const removed = [];
        for (const role of [...this.created]) {
            this.files.verifyRetention();
            this.validator.volume(
                await this.docker.volumeInspect(this.files.owned.volumes[role]),
                this.files.owned,
                role,
            );
            await this.docker.volumeRemove(this.files.owned.volumes[role]);
            requireContainer(
                !(await this.docker.volumeExists(this.files.owned.volumes[role])),
                'Volume removal was not observed.',
            );
            this.created.delete(role);
            removed.push(this.files.owned.volumes[role]);
        }
        this.files.verifyRetention();
        this.capture(facts, 'owned-cleanup', 'retention', {
            schema_version: 1,
            stopped,
            container_id: this.id,
            removed_volumes: removed,
            retained: receipt,
            native_acceptance: false,
        });
    }

    async abort() {
        if (this.aborted) return;
        this.aborted = true;
        this.ready = false;
        this.docker.beginCleanup();
        this.id ??= this.files.partialContainerId();
        let state = 'not-created-or-unknown';
        if (this.id && !this.removed) {
            try {
                // On an abort, stop only a full ID whose ownership still matches.
                // Configuration drift must not prevent stopping a proven owned process.
                const raw = await this.docker.inspect(this.id);
                const current = containerRecord(
                    Array.isArray(raw) && raw.length === 1 ? raw[0] : null,
                );
                requireContainer(
                    current.Id === this.id &&
                        current.Name === `/${this.files.owned.name}` &&
                        current.Image === this.pin.image.id &&
                        Object.entries(this.files.owned.labels).every(
                            ([k, v]) => current.Config?.Labels?.[k] === v,
                        ),
                    'Abort ownership could not be verified.',
                );
                if (current.State?.Running) {
                    try {
                        await this.docker.stop(this.id);
                    } catch {
                        await this.docker.kill(this.id);
                    }
                }
                const after = await this.docker.inspect(this.id);
                const stopped = containerRecord(
                    Array.isArray(after) && after.length === 1 ? after[0] : null,
                );
                requireContainer(
                    stopped.Id === this.id &&
                        stopped.State?.Running === false &&
                        stopped.State?.Pid === 0,
                    'Abort stop is unknown.',
                );
                state = 'owned-container-stopped-volumes-retained';
            } catch {
                state = 'owned-resource-state-unknown';
            }
        }
        try {
            this.files.evidence('abort-retention', {
                schema_version: 1,
                state,
                container_id: this.id,
                container_name: this.files.owned.name,
                created_volumes: [...this.created].map((role) => this.files.owned.volumes[role]),
                possible_volume_names: this.files.owned.volumes,
                removed_container: this.removed,
                filesystem_snapshot_verified: false,
                native_acceptance: false,
            });
        } catch {
            /* An unavailable owned output never authorizes deleting state. */
        }
    }
}
