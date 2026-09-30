// SPDX-License-Identifier: Apache-2.0
import { ReleaseVersionRepository } from '../repository/ReleaseVersionRepository.ts';
import { ReleaseVersionValidator } from '../validator/ReleaseVersionValidator.ts';

/** Prepares local review artifacts; never commits, tags, publishes or installs. */
export class ReleaseVersionService {
    private readonly validator = new ReleaseVersionValidator();
    private readonly repository: ReleaseVersionRepository;

    constructor(repository: ReleaseVersionRepository) {
        this.repository = repository;
    }

    prepare() {
        const current = this.repository.documents();
        const version = this.validator.alignment(current);
        this.validator.configuration(
            current.package,
            this.repository.json('.changeset/config.json'),
        );
        const notes = this.repository.pending();
        if (!notes.length) return { version, changed: false, notes: 0 };
        const snapshot = this.repository.snapshot(notes);

        try {
            this.repository.runVersion();
            const updated = this.validator.synchronize(this.repository.documents());
            this.repository.writeDocuments(updated);
            const nextVersion = this.validator.alignment(updated);
            if (
                nextVersion !== version &&
                !this.repository
                    .read('CHANGELOG.md')
                    .split(/\r?\n/u)
                    .some((line) => line.trim() === `## ${nextVersion}`)
            )
                throw new Error('Changesets did not generate the version changelog heading.');
            if (nextVersion !== version)
                this.repository.normalizeChangelog(snapshot.get('CHANGELOG.md'));
            return { version: nextVersion, changed: true, notes: notes.length };
        } catch (error) {
            this.repository.restore(snapshot);
            throw error;
        }
    }

    verify(base?: string) {
        const current = this.repository.documents();
        const version = this.validator.alignment(current);
        if (!base) return { version, aligned: true, prepared: false };

        const previous = this.repository.baseDocuments(base);
        const notes = this.repository.baseNotes(base);
        this.repository.verifyChangedFiles(base, notes);
        const expected = this.repository.expectedRelease(base, previous.package, notes);
        this.validator.prepared(previous, current, expected, this.repository.committedChangelog());
        return { version, aligned: true, prepared: true, base, consumedNotes: notes.length };
    }
}
