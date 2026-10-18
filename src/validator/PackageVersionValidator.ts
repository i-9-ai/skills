// SPDX-License-Identifier: Apache-2.0
export type PackageDocument = Record<string, unknown>;

/** Reads package identity for installed provenance and onboarding. */
export class PackageVersionValidator {
    document(value: unknown): PackageDocument {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('Release metadata must be a JSON object.');
        }
        return value as PackageDocument;
    }

    version(document: PackageDocument): string {
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
}
