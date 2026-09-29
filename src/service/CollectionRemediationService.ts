// SPDX-License-Identifier: Apache-2.0
import { CollectionMaintenanceRepository } from '../repository/CollectionMaintenanceRepository.ts';
import { CollectionSnapshotRepository } from '../repository/CollectionSnapshotRepository.ts';
import { CollectionRemediationValidator } from '../validator/CollectionRemediationValidator.ts';
import type {
    CollectionSelection,
    CollectionPlan,
} from '../validator/CollectionRemediationValidator.ts';

export type CollectionEvolutionResult = {
    status: 'preview' | 'unchanged' | 'applied' | 'rolled_back' | 'rollback_failed';
    applied: boolean;
    before_sha256: string | null;
    after_sha256: string | null;
    operations: CollectionPlan['operations'];
    remaining_handoffs: CollectionPlan['handoffs'];
    snapshot: string | null;
    verification: {
        preimage: 'not_run' | 'passed';
        catalog: 'not_run' | 'passed' | 'failed';
        rollback: 'not_run' | 'passed' | 'failed';
    };
};

/** Applies only a regenerated, selected plan and retains recovery evidence for every write. */
export class CollectionRemediationService {
    private readonly repository: CollectionMaintenanceRepository;
    private readonly snapshots: CollectionSnapshotRepository;
    private readonly validator = new CollectionRemediationValidator();

    constructor(
        repository = new CollectionMaintenanceRepository(),
        snapshots = new CollectionSnapshotRepository(),
    ) {
        this.repository = repository;
        this.snapshots = snapshots;
    }

    plan(selection: CollectionSelection, audit: unknown): CollectionPlan {
        const current = this.repository.observe(selection).audit;
        this.validator.auditMatches(audit, current);
        const plan = this.validator.plan(current);
        this.validator.encode(plan);
        return plan;
    }

    evolve(
        selection: CollectionSelection,
        selected: unknown,
        options: { apply?: boolean; snapshotStore?: string } = {},
    ): CollectionEvolutionResult {
        if (
            Object.keys(options).some((key) => !['apply', 'snapshotStore'].includes(key)) ||
            (options.apply !== undefined && typeof options.apply !== 'boolean')
        )
            throw new Error('Unsupported evolution options.');
        const observation = this.repository.observe(selection);
        const plan = this.validator.planMatches(selected, observation.audit);
        const result: CollectionEvolutionResult = {
            status: options.apply ? 'unchanged' : 'preview',
            applied: false,
            before_sha256: plan.baseline.catalog_sha256,
            after_sha256: plan.baseline.catalog_sha256,
            operations: plan.operations,
            remaining_handoffs: plan.handoffs,
            snapshot: null,
            verification: { preimage: 'not_run', catalog: 'not_run', rollback: 'not_run' },
        };
        if (!options.apply) return result;
        if (!plan.operations.length) return result;
        if (!options.snapshotStore)
            throw new Error('Apply requires an explicit external --snapshot-store.');
        // Every preflight above is read-only, including stale-plan and incomplete-coverage rejection.
        this.validator.planMatches(selected, this.repository.observe(selection).audit);
        const recovery = this.snapshots.prepare(
            observation.before,
            options.snapshotStore,
            observation.root,
        );
        result.snapshot = recovery.snapshot;
        result.verification.preimage = 'passed';
        // A slow capture cannot turn an old audit into permission to overwrite newer state.
        this.validator.planMatches(selected, this.repository.observe(selection).audit);
        try {
            this.repository.sync(selection);
            const after = this.repository.observe(selection).audit;
            if (
                !after.coverage.complete ||
                after.catalog.status !== 'current' ||
                after.baseline.catalog_mode !== (observation.before.mode ?? 0o644) ||
                after.baseline.catalog_sha256 !== plan.operations[0]!.expected_after_sha256 ||
                after.baseline.inventory_sha256 !== plan.baseline.inventory_sha256 ||
                after.baseline.root_identity_sha256 !== plan.baseline.root_identity_sha256
            )
                throw new Error('Post-write verification failed.');
            result.status = 'applied';
            result.applied = true;
            result.after_sha256 = after.baseline.catalog_sha256;
            result.verification.catalog = 'passed';
            this.snapshots.record(recovery, result);
            return result;
        } catch {
            result.status = 'rolled_back';
            result.applied = false;
            result.verification.catalog = 'failed';
            try {
                this.repository.restore(
                    selection,
                    this.snapshots.recover(recovery),
                    plan.operations[0]!.expected_after_sha256,
                );
                const restored = this.repository.observe(selection).audit;
                this.validator.auditMatches(observation.audit, restored);
                result.after_sha256 = restored.baseline.catalog_sha256;
                result.verification.rollback = 'passed';
            } catch {
                result.status = 'rollback_failed';
                result.after_sha256 = null;
                result.verification.rollback = 'failed';
            }
            try {
                this.snapshots.record(recovery, result);
            } catch {
                /* The snapshot and stdout receipt remain available. */
            }
            return result;
        }
    }
}
