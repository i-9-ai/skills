// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import type {
    NativePilotMode,
    NativePilotSelection,
    NativePilotStep,
} from '../config/NativePilotConfiguration.ts';
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';
import type { NativePilotPreparation } from '../repository/NativePilotPreparationRepository.ts';
import { NativePilotEvidenceRepository } from '../repository/NativePilotEvidenceRepository.ts';
import {
    NativePilotInventoryRepository,
    pilotDigest,
} from '../repository/NativePilotInventoryRepository.ts';
import { NativePilotContractValidator } from '../validator/NativePilotContractValidator.ts';
import { NativePilotObservationValidator } from '../validator/NativePilotObservationValidator.ts';
import { NativePilotLoadedInventoryValidator } from '../validator/NativePilotLoadedInventoryValidator.ts';
import { NativePilotPlanService } from './NativePilotPlanService.ts';

export interface NativePilotBoundaryAdapter {
    readonly boundary?: 'disposable-container-v1';
    readonly mode: NativePilotMode;
    readonly driver_tree_sha256: string;
    readonly observer_tree_sha256: string;
    /** Must execute only supplied commands in the already measured disposable boundary. */
    perform(step: NativePilotStep, selection: NativePilotSelection): Promise<unknown>;
    /** Stop owned workers and retain partial evidence, never delete data or retry unconfined. */
    abort(selection: NativePilotSelection): Promise<void>;
}

export interface NativePilotLaneResult {
    schema_version: 1;
    selection: NativePilotSelection;
    mode: NativePilotMode;
    contract_sha256: string;
    status:
        | 'synthetic-only'
        | 'evidence-ready-for-independent-review'
        | 'data-compatibility-blocked'
        | 'failed'
        | 'blocked';
    native_acceptance: false;
    data_compatibility: 'not-observed' | 'compatible' | 'blocked-newer-schema';
    environment: { instance_sha256: string; profile_sha256: string } | null;
    steps: Array<{
        id: string;
        verdict: 'candidate-pass' | 'failed' | 'blocked' | 'not-run';
        reason: string;
    }>;
    abort: 'not-needed' | 'requested-retention-unverified' | 'adapter-error';
}

const freeze = <T>(value: T): T => {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
};

async function bounded<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            operation,
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error('Adapter deadline exceeded.')),
                    milliseconds,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** Fixed lifecycle coordinator; it has no ambient/native executor or provider fallback. */
export class NativePilotDriverService {
    readonly evidence = new NativePilotEvidenceRepository();
    readonly inventory = new NativePilotInventoryRepository();
    readonly validator = new NativePilotObservationValidator();
    readonly loadedInventory = new NativePilotLoadedInventoryValidator();

    async run(
        preparation: NativePilotPreparation,
        input: unknown,
        adapter: NativePilotBoundaryAdapter,
        journalParent: string,
        evidenceRoot: string,
        now: () => number = Date.now,
    ): Promise<NativePilotLaneResult> {
        const prepared = freeze(structuredClone(preparation));
        const selection = freeze(new NativePilotContractValidator().selection(input));
        new NativePilotContractValidator().resolved(prepared.contract);
        if (
            pilotDigest(JSON.stringify(prepared.contract)) !== prepared.contract_sha256 ||
            !['native', 'synthetic'].includes(adapter.mode) ||
            adapter.driver_tree_sha256 !== prepared.contract.driver.tree_sha256 ||
            adapter.observer_tree_sha256 !== prepared.contract.observer.tree_sha256
        ) {
            throw new Error('Driver, observer or contract pin mismatch.');
        }
        this.evidence.preflightOutput(
            prepared.root,
            prepared.contract_sha256,
            journalParent,
            evidenceRoot,
        );
        // Verify prepared bytes before granting the adapter its first step.
        const assertPins = () => {
            this.inventory.verifyPrivateReview(prepared.contract.driver, 'driver');
            this.inventory.verifyPrivateReview(prepared.contract.observer, 'observer');
            for (const key of ['source_a', 'source_b', 'driver', 'observer'] as const) {
                const observed = this.inventory.tree(join(prepared.root, 'input', key));
                if (observed.tree_sha256 !== prepared.contract[key].tree_sha256) {
                    throw new Error('Prepared input changed; no phase was invoked.');
                }
                if (JSON.stringify(observed) !== JSON.stringify(prepared.trees[key])) {
                    throw new Error(
                        'Preparation inventory metadata differs from authoritative physical input bytes.',
                    );
                }
                if (key === 'source_a' || key === 'source_b') {
                    const packages = observed.entries
                        .filter(
                            (entry) =>
                                entry.kind === 'file' &&
                                /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(entry.path),
                        )
                        .map((entry) => entry.path.split('/')[2])
                        .sort();
                    if (
                        JSON.stringify(packages) !==
                        JSON.stringify(prepared.package_names[key === 'source_a' ? 'a' : 'b'])
                    ) {
                        throw new Error(
                            'Preparation package metadata differs from the physical inventory.',
                        );
                    }
                }
            }
            for (const binary of ['node', 'codex', 'claude'] as const) {
                if (
                    this.inventory.file(
                        join(prepared.root, 'runtime-bin', binary),
                        NativePilotConfiguration.limits.binary_bytes,
                    ).sha256 !== prepared.contract.binaries[binary].sha256
                ) {
                    throw new Error('Prepared executable changed; no phase was invoked.');
                }
            }
        };
        assertPins();
        const plan = freeze(
            new NativePilotPlanService().plan(prepared, selection, adapter.boundary),
        );
        if (
            JSON.stringify(plan.map((step) => step.id)) !==
            JSON.stringify(NativePilotConfiguration.phases)
        )
            throw new Error('Phase order changed.');
        const journal = this.evidence.createJournal(
            prepared.root,
            prepared.contract_sha256,
            journalParent,
            evidenceRoot,
            selection.run_id,
        );
        const started = now();
        const instances = new Set<string>();
        const result: NativePilotLaneResult = {
            schema_version: 1,
            selection,
            mode: adapter.mode,
            contract_sha256: prepared.contract_sha256,
            status: 'blocked',
            native_acceptance: false,
            data_compatibility: 'not-observed',
            environment: null,
            steps: [],
            abort: 'not-needed',
        };
        let stopped = false;
        let aborted = false;
        const abort = async () => {
            if (aborted) return;
            aborted = true;
            try {
                await bounded(adapter.abort(selection), NativePilotConfiguration.limits.cleanup_ms);
                result.abort = 'requested-retention-unverified';
            } catch {
                result.abort = 'adapter-error';
            }
        };
        for (const [sequence, step] of plan.entries()) {
            if (stopped) {
                const record = {
                    id: step.id,
                    verdict: 'not-run' as const,
                    reason: 'earlier-stage-did-not-pass',
                };
                this.evidence.append(journal, sequence, record);
                result.steps.push(record);
                continue;
            }
            let reason = 'adapter-timeout-or-error';
            let raw: unknown = null;
            try {
                if (now() - started > NativePilotConfiguration.limits.job_ms) {
                    reason = 'job-bound-exceeded';
                    throw new Error(reason);
                }
                if (['install-a', 'select-b', 'select-a', 'retain'].includes(step.id)) {
                    reason = 'prepared-input-changed';
                    assertPins();
                }
                reason = 'adapter-timeout-or-error';
                const remaining = NativePilotConfiguration.limits.job_ms - (now() - started);
                const phaseLimit = Math.max(
                    30_000,
                    step.commands.reduce((sum, command) => sum + command.timeout_ms, 0),
                );
                raw = await bounded(
                    adapter.perform(step, selection),
                    Math.min(remaining, phaseLimit),
                );
                if (now() - started > NativePilotConfiguration.limits.job_ms) {
                    reason = 'job-bound-exceeded';
                    throw new Error(reason);
                }
                reason = 'invalid-observation';
                const checked = this.validator.validate(
                    raw,
                    step,
                    selection,
                    adapter.mode,
                    prepared,
                    instances,
                );
                reason = 'evidence-integrity-mismatch';
                this.evidence.verify(evidenceRoot, checked.observation.evidence);
                if (checked.observation.loaded) {
                    const captured = this.inventory.readJson(
                        join(evidenceRoot, checked.observation.loaded.inventory_evidence),
                    );
                    const expected =
                        step.pin === 'b' ? prepared.trees.source_b : prepared.trees.source_a;
                    this.loadedInventory.validate(
                        captured,
                        selection.host,
                        step.pin === 'b' ? 'b' : 'a',
                        expected,
                        checked.observation.loaded,
                    );
                    instances.add(checked.observation.loaded.process_instance);
                }
                if (checked.observation.environment)
                    result.environment = checked.observation.environment;
                if (checked.observation.rollback_state)
                    result.data_compatibility =
                        checked.observation.rollback_state.result === 'compatible'
                            ? 'compatible'
                            : 'blocked-newer-schema';
                const record = {
                    id: step.id,
                    verdict: checked.verdict,
                    reason:
                        checked.verdict === 'failed'
                            ? 'process-or-observed-gate-failed'
                            : adapter.mode === 'synthetic'
                              ? 'synthetic-driver-check-only'
                              : 'retained-adapter-assertions-require-independent-review',
                };
                this.evidence.append(journal, sequence, {
                    ...record,
                    observation: checked.observation,
                });
                result.steps.push(record);
                if (checked.verdict === 'failed') {
                    result.status = 'failed';
                    stopped = true;
                }
            } catch {
                // Raw adapter data is not blindly serialized after a validation failure.
                // The adapter retains bounded native logs independently of this journal.
                const record = { id: step.id, verdict: 'blocked' as const, reason };
                stopped = true;
                await abort();
                this.evidence.append(journal, sequence, record);
                result.steps.push(record);
                result.status = 'blocked';
                stopped = true;
            }
            if (stopped) await abort();
        }
        if (!stopped)
            result.status =
                result.data_compatibility === 'blocked-newer-schema'
                    ? 'data-compatibility-blocked'
                    : adapter.mode === 'synthetic'
                      ? 'synthetic-only'
                      : 'evidence-ready-for-independent-review';
        this.inventory.writeJson(join(journal, 'result.json'), result);
        return result;
    }
}
