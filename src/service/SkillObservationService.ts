// SPDX-License-Identifier: Apache-2.0
import { SkillSnapshotObservationRepository } from '../repository/SkillSnapshotObservationRepository.ts';
import { SkillBumpReportValidator } from '../validator/SkillBumpReportValidator.ts';
import { SkillBumpReportError } from '../validator/SkillBumpReportError.ts';

/** Exports one verified inventory plus explicitly supplied review/provenance assertions. */
export class SkillObservationService {
    private readonly repository: SkillSnapshotObservationRepository;

    constructor(repository = new SkillSnapshotObservationRepository()) {
        this.repository = repository;
    }

    observe(snapshot: string, value: unknown, evidence?: unknown) {
        const validator = new SkillBumpReportValidator();
        validator.bytes(value, 8192);
        if (
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            Object.keys(value).length !== 2 ||
            !Object.hasOwn(value, 'subject') ||
            !Object.hasOwn(value, 'source')
        )
            throw new SkillBumpReportError('invalid_input');
        const input = value as { subject: unknown; source: unknown };
        const subject = validator.subject(input.subject),
            source = validator.source(input.source);
        // All source/subject assertions are checked before touching the selected snapshot.
        const selected = this.repository.observe(snapshot, subject);
        const content_identity = validator.contentIdentity(subject, selected.inventory);
        if (evidence !== undefined) validator.bytes(evidence, 128 * 1024);
        const reviewed =
            evidence === undefined
                ? { contracts: { coverage: 'not_provided', entries: [] }, validation: [] }
                : validator.evidence(evidence, selected.inventory.entries, content_identity.sha256);
        return validator.pin({
            schema_version: 1,
            subject,
            source,
            ...selected,
            content_identity,
            ...reviewed,
        });
    }
}
