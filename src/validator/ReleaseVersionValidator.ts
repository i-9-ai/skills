// SPDX-License-Identifier: Apache-2.0
import { isDeepStrictEqual } from 'node:util';

export type ReleaseDocument = Record<string, unknown>;
export type ReleaseDocuments = {
    package: ReleaseDocument;
    lock: ReleaseDocument;
    plugins: Record<string, ReleaseDocument>;
};

/** Checks the single-package version contract without filesystem or process access. */
export class ReleaseVersionValidator {
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
        if (config.commit !== false || config.changelog !== '@changesets/cli/changelog') {
            throw new Error(
                'Release preparation requires the standard Changesets changelog and disabled automatic commits.',
            );
        }
        if (typeof pkg.name !== 'string' || !pkg.name) throw new Error('Package name is required.');
        this.version(pkg);
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
        expectedVersion: string,
        changelog: string,
    ): void {
        const version = this.alignment(current);
        if (version === this.version(base.package) || version !== expectedVersion) {
            throw new Error('Prepared version does not match the base Changesets release intent.');
        }
        if (!isDeepStrictEqual(current, this.synchronize(base, version))) {
            throw new Error('Prepared manifests contain changes beyond version metadata.');
        }
        if (!changelog.split(/\r?\n/u).some((line) => line.trim() === `## ${version}`)) {
            throw new Error('Prepared changelog lacks the exact version heading.');
        }
    }
}
