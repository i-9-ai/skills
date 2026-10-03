// SPDX-License-Identifier: Apache-2.0
import { isDeepStrictEqual } from 'node:util';

export type ReleaseDocument = Record<string, unknown>;
export type ReleaseDocuments = {
    package: ReleaseDocument;
    lock: ReleaseDocument;
    plugins: Record<string, ReleaseDocument>;
};
export type ReleaseExpectation = { version: string; changelog: string };
export type ReleaseGenerator =
    | { module: '@changesets/cli/changelog' }
    | { module: '@changesets/changelog-github'; repo: string };

/** Checks the single-package version contract without filesystem or process access. */
export class ReleaseVersionValidator {
    /** Match the pinned Changesets reader's Markdown exclusions. */
    isNote(name: string): boolean {
        return (
            name.endsWith('.md') &&
            !name.startsWith('.') &&
            !/^README\.md$/iu.test(name) &&
            !['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'].includes(name)
        );
    }

    document(value: unknown): ReleaseDocument {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('Release metadata must be a JSON object.');
        }
        return value as ReleaseDocument;
    }

    version(document: ReleaseDocument): string {
        const version = document.version;
        if (
            typeof version !== 'string' ||
            !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(
                version,
            )
        ) {
            throw new Error('Release metadata requires an explicit semantic version.');
        }
        return version;
    }

    configuration(pkg: ReleaseDocument, config: ReleaseDocument): void {
        if (Object.hasOwn(pkg, 'workspaces'))
            throw new Error('Release preparation supports one root package.');
        if (config.commit !== false) {
            throw new Error(
                'Release preparation requires the standard Changesets changelog and disabled automatic commits.',
            );
        }
        this.generator(config);
        if (config.format !== false) {
            throw new Error(
                'Release preparation requires format: false for deterministic changelog generation without formatter execution.',
            );
        }
        if (typeof pkg.name !== 'string' || !pkg.name) throw new Error('Package name is required.');
        this.version(pkg);
    }

    generator(config: ReleaseDocument): ReleaseGenerator {
        if (config.changelog === '@changesets/cli/changelog')
            return { module: '@changesets/cli/changelog' };
        const changelog = config.changelog;
        if (
            Array.isArray(changelog) &&
            changelog.length === 2 &&
            changelog[0] === '@changesets/changelog-github'
        ) {
            const options = this.document(changelog[1]);
            if (
                Object.keys(options).length === 1 &&
                typeof options.repo === 'string' &&
                options.repo.length <= 200 &&
                /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(options.repo)
            )
                return { module: '@changesets/changelog-github', repo: options.repo };
        }
        throw new Error(
            'Release preparation requires the standard Changesets changelog or the pinned GitHub generator with only an explicit repo.',
        );
    }

    synchronize(
        documents: ReleaseDocuments,
        version = this.version(documents.package),
    ): ReleaseDocuments {
        const root = this.document(this.document(documents.lock.packages)['']);
        if (
            documents.lock.lockfileVersion !== 3 ||
            documents.lock.name !== documents.package.name ||
            root.name !== documents.package.name
        ) {
            throw new Error("Release preparation requires this package's npm v3 lockfile.");
        }
        return {
            package: { ...documents.package, version },
            lock: {
                ...documents.lock,
                version,
                packages: { ...this.document(documents.lock.packages), '': { ...root, version } },
            },
            plugins: Object.fromEntries(
                Object.entries(documents.plugins).map(([file, plugin]) => [
                    file,
                    { ...plugin, version },
                ]),
            ),
        };
    }

    alignment(documents: ReleaseDocuments): string {
        if (!isDeepStrictEqual(documents, this.synchronize(documents))) {
            throw new Error('Package, lockfile and plugin versions must agree.');
        }
        return this.version(documents.package);
    }

    prepared(
        base: ReleaseDocuments,
        current: ReleaseDocuments,
        expected: ReleaseExpectation,
        changelog: string,
    ): void {
        const version = this.alignment(current);
        if (version === this.version(base.package) || version !== expected.version) {
            throw new Error('Prepared version does not match the base Changesets release intent.');
        }
        if (!isDeepStrictEqual(current, this.synchronize(base, version))) {
            throw new Error('Prepared manifests contain changes beyond version metadata.');
        }
        if (!changelog.split(/\r?\n/u).some((line) => line.trim() === `## ${version}`)) {
            throw new Error('Prepared changelog lacks the exact version heading.');
        }
        if (changelog !== expected.changelog) {
            throw new Error(
                'Prepared changelog must equal the complete output generated from the base notes and history.',
            );
        }
    }
}
