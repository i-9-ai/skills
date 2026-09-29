// SPDX-License-Identifier: Apache-2.0
import {
    SkillBumpReportValidator,
    bumpDigest,
    compareText,
} from '../validator/SkillBumpReportValidator.ts';
import type {
    BumpRequest,
    ObservationContract,
    ObservationEntry,
    ReviewReason,
} from '../validator/SkillBumpReportValidator.ts';
import { SkillBumpReportError } from '../validator/SkillBumpReportError.ts';

type Change<T> = {
    kind: 'file' | 'contract';
    key: string;
    change: 'added' | 'removed' | 'modified';
    before: T | null;
    after: T | null;
};
type FileChange = Change<ObservationEntry>;
type ContractChange = Change<ObservationContract>;
const impact: Record<ReviewReason, number> = {
    documentation_only: 1,
    compatible_correction: 1,
    compatible_addition: 2,
    optional_integration: 2,
    contract_removed: 3,
    incompatible_contract: 3,
    required_input_added: 3,
    required_migration: 3,
    undetermined: 0,
};
const contractShape = (value: ObservationContract) => ({
    kind: value.kind,
    required: value.required,
    signature_sha256: value.signature_sha256,
    files: value.files.map((file) => file.path),
});

/** Pure complete comparison; recommendation reflects explicit review, never hash semantics. */
export class SkillBumpReportService {
    report(value: unknown) {
        const request = new SkillBumpReportValidator().request(value);
        const before = request.before.observation,
            after = request.after.observation;
        const files = this.differences(
            before.inventory.entries,
            after.inventory.entries,
            (entry) => entry.path,
            (entry) => entry,
            'file',
        );
        if (before.inventory.root_mode !== after.inventory.root_mode)
            files.unshift({
                kind: 'file',
                key: '.',
                change: 'modified',
                before: { path: '.', type: 'directory', mode: before.inventory.root_mode },
                after: { path: '.', type: 'directory', mode: after.inventory.root_mode },
            });
        const contracts = this.differences(
            before.contracts.entries,
            after.contracts.entries,
            (entry) => entry.id,
            contractShape,
            'contract',
        );
        const provenanceChanged = JSON.stringify(before.source) !== JSON.stringify(after.source);
        const assessment = this.assess(request, files, contracts, provenanceChanged);
        const changes = [...files, ...contracts];
        const page = changes
            .slice(request.offset, request.offset + request.limit)
            .map((change) => ({
                ...change,
                review:
                    change.kind === 'file'
                        ? (request.assessment?.files.find((item) => item.path === change.key) ??
                          null)
                        : (request.assessment?.contracts.find((item) => item.id === change.key) ??
                          null),
            }));
        const end = request.offset + page.length;
        const result = {
            schema_version: 1,
            policy: 'semver-contract-v1',
            subject: before.subject,
            observations: {
                before: {
                    sha256: request.before.sha256,
                    content_identity: before.content_identity,
                    snapshot_tree_sha256: before.snapshot_tree_sha256,
                    source: before.source,
                    contracts_coverage: before.contracts.coverage,
                    validation: before.validation,
                },
                after: {
                    sha256: request.after.sha256,
                    content_identity: after.content_identity,
                    snapshot_tree_sha256: after.snapshot_tree_sha256,
                    source: after.source,
                    contracts_coverage: after.contracts.coverage,
                    validation: after.validation,
                },
            },
            ...assessment,
            assessment:
                request.assessment === null
                    ? null
                    : {
                          sha256: bumpDigest(request.assessment),
                          coverage: request.assessment.coverage,
                          provenance: request.assessment.provenance,
                      },
            provenance_changed: provenanceChanged,
            counts: {
                files: this.counts(files),
                contracts: this.counts(contracts),
                total_changes: changes.length,
            },
            offset: request.offset,
            limit: request.limit,
            next_offset: end < changes.length ? end : null,
            changes: page,
            evidence_boundary: {
                origin: 'caller_supplied_observations_and_reviews',
                remote_git_verified: false,
                validation_reexecuted: false,
                external_link_targets_compared: false,
                release_authorized: false,
            },
        };
        if (Buffer.byteLength(JSON.stringify(result)) > 480 * 1024)
            throw new SkillBumpReportError('response_too_large');
        return result;
    }

    private assess(
        request: BumpRequest,
        files: FileChange[],
        contracts: ContractChange[],
        provenanceChanged: boolean,
    ) {
        const before = request.before.observation,
            after = request.after.observation;
        const reasons = new Set<string>();
        if (!files.length && !contracts.length) reasons.add('no_content_or_contract_changes');
        if (
            [before, after].some(
                (item) => item.contracts.coverage !== 'complete' || !item.contracts.entries.length,
            )
        )
            reasons.add('incomplete_contract_evidence');
        const review = request.assessment;
        if (!review) reasons.add('assessment_missing');
        if (review?.coverage !== 'complete') reasons.add('incomplete_change_review');
        const fileMap = new Map(files.map((file) => [file.key, file]));
        const contractMap = new Map(contracts.map((contract) => [contract.key, contract]));
        const definitions = [...before.contracts.entries, ...after.contracts.entries];
        for (const reviewed of review?.files ?? []) {
            if (!fileMap.has(reviewed.path)) this.invalid();
            for (const id of reviewed.contracts) {
                if (
                    !definitions.some(
                        (contract) =>
                            contract.id === id &&
                            contract.files.some((file) => file.path === reviewed.path),
                    )
                )
                    this.invalid();
            }
            const related = contracts.filter((change) => reviewed.contracts.includes(change.key));
            if (
                related.some((change) => {
                    const contractReview = review?.contracts.find((item) => item.id === change.key);
                    return (
                        contractReview && impact[reviewed.reason] < impact[contractReview.reason]
                    );
                })
            )
                reasons.add('contradictory_file_review');
            if (
                reviewed.reason === 'contract_removed' &&
                !related.some((change) => change.change === 'removed')
            )
                reasons.add('contradictory_file_review');
            if (
                reviewed.reason === 'required_input_added' &&
                !related.some((change) => this.newRequiredInput(change))
            )
                reasons.add('contradictory_file_review');
            if (
                reviewed.reason === 'optional_integration' &&
                !related.some(
                    (change) => change.after?.kind === 'integration' && !change.after.required,
                )
            )
                reasons.add('contradictory_file_review');
            if (
                ['compatible_addition', 'incompatible_contract'].includes(reviewed.reason) &&
                !related.length
            )
                reasons.add('contradictory_file_review');
        }
        for (const reviewed of review?.contracts ?? [])
            if (!contractMap.has(reviewed.id)) this.invalid();
        if (review?.provenance && !provenanceChanged) this.invalid();
        if (
            review &&
            (files.some((file) => !review.files.some((item) => item.path === file.key)) ||
                contracts.some(
                    (contract) => !review.contracts.some((item) => item.id === contract.key),
                ) ||
                (provenanceChanged && !review.provenance))
        )
            reasons.add('uncovered_changes');

        for (const change of contracts) {
            const definingFiles = [...(change.before?.files ?? []), ...(change.after?.files ?? [])];
            if (!definingFiles.some((file) => fileMap.has(file.path)))
                reasons.add('contract_change_without_changed_definition');
            if (
                !review?.files.some(
                    (file) => fileMap.has(file.path) && file.contracts.includes(change.key),
                )
            )
                reasons.add('unlinked_contract_review');
            const selected = review?.contracts.find((item) => item.id === change.key);
            if (!selected) continue;
            const major = impact[selected.reason] === 3;
            if (change.change === 'removed' && !major) reasons.add('contradictory_contract_review');
            if (
                change.change === 'added' &&
                ![
                    'compatible_addition',
                    'optional_integration',
                    'required_input_added',
                    'required_migration',
                    'incompatible_contract',
                    'undetermined',
                ].includes(selected.reason)
            )
                reasons.add('contradictory_contract_review');
            if (this.newRequiredInput(change) && !major)
                reasons.add('contradictory_contract_review');
            if (
                change.after?.kind === 'integration' &&
                change.after.required &&
                (!change.before ||
                    change.before.kind !== 'integration' ||
                    !change.before.required) &&
                !major
            )
                reasons.add('contradictory_contract_review');
            if (change.change !== 'removed' && selected.reason === 'contract_removed')
                reasons.add('contradictory_contract_review');
            if (selected.reason === 'required_input_added' && !this.newRequiredInput(change))
                reasons.add('contradictory_contract_review');
            if (
                selected.reason === 'optional_integration' &&
                !(change.after?.kind === 'integration' && !change.after.required)
            )
                reasons.add('contradictory_contract_review');
            if (selected.reason === 'documentation_only')
                reasons.add('contradictory_contract_review');
            for (const file of definingFiles)
                if (
                    review?.files.some(
                        (item) => item.path === file.path && item.reason === 'documentation_only',
                    )
                )
                    reasons.add('contradictory_contract_review');
        }

        const allReasons = [
            ...(review?.files.map((item) => item.reason) ?? []),
            ...(review?.contracts.map((item) => item.reason) ?? []),
            ...(review?.provenance ? [review.provenance.reason] : []),
        ];
        if (allReasons.includes('undetermined')) reasons.add('unknown_review_impact');
        const required = ['structural', 'official'];
        if (contracts.length || allReasons.some((reason) => reason !== 'documentation_only'))
            required.push('behavioral', 'compatibility');
        for (const kind of required)
            if (
                !after.validation.some(
                    (record) => record.kind === kind && record.status === 'passed',
                )
            )
                reasons.add(`candidate_${kind}_not_passed`);
        const highest = Math.max(0, ...allReasons.map((reason) => impact[reason]));
        if (!highest) reasons.add('no_supported_impact');
        const recommendation = reasons.size
            ? 'undetermined'
            : highest === 3
              ? 'major'
              : highest === 2
                ? 'minor'
                : 'patch';
        return {
            recommendation,
            rationale: [...new Set(allReasons)].sort(compareText),
            insufficiencies: [...reasons].sort(compareText),
            required_candidate_validation: required,
        };
    }

    private newRequiredInput(change: ContractChange): boolean {
        return (
            change.after?.kind === 'input' &&
            change.after.required &&
            (!change.before || change.before.kind !== 'input' || !change.before.required)
        );
    }

    private differences<T>(
        before: T[],
        after: T[],
        key: (value: T) => string,
        shape: (value: T) => unknown,
        kind: 'file' | 'contract',
    ): Change<T>[] {
        const old = new Map(before.map((value) => [key(value), value])),
            next = new Map(after.map((value) => [key(value), value]));
        return [...new Set([...old.keys(), ...next.keys()])].sort(compareText).flatMap((id) => {
            const previous = old.get(id) ?? null,
                current = next.get(id) ?? null;
            if (
                previous !== null &&
                current !== null &&
                JSON.stringify(shape(previous)) === JSON.stringify(shape(current))
            )
                return [];
            return [
                {
                    kind,
                    key: id,
                    change:
                        previous === null
                            ? ('added' as const)
                            : current === null
                              ? ('removed' as const)
                              : ('modified' as const),
                    before: previous,
                    after: current,
                },
            ];
        });
    }
    private counts(changes: Array<{ change: 'added' | 'removed' | 'modified' }>) {
        return {
            added: changes.filter((item) => item.change === 'added').length,
            removed: changes.filter((item) => item.change === 'removed').length,
            modified: changes.filter((item) => item.change === 'modified').length,
        };
    }
    private invalid(): never {
        throw new SkillBumpReportError('invalid_input');
    }
}
