// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
export interface SkillInstallationEntry {
    path: string;
    kind: 'file' | 'directory';
    bytes: number;
    sha256: string | null;
    executable: boolean;
}
export interface SkillInstallationPackage {
    name: string;
    sha256: string;
    entries: SkillInstallationEntry[];
}
export interface SkillInstallationReceipt {
    schema_version: 1;
    collection: 'i9-skills';
    root: string;
    scope: 'project' | 'global';
    version: string;
    catalog_sha256: string;
    source_git_sha: string | null;
    packages: SkillInstallationPackage[];
}
export interface SkillInstallationJournal {
    schema_version: 1;
    id: string;
    before: SkillInstallationReceipt | null;
    after: SkillInstallationReceipt | null;
    operations: {
        name: string;
        before: SkillInstallationPackage | null;
        after: SkillInstallationPackage | null;
    }[];
}

/** Closed ownership records contain only bounded package-relative paths. */
export class SkillInstallationValidator {
    static readonly metadataBytes = 4_194_304;

    serialize(value: unknown): Buffer {
        const chunks: string[] = [];
        let bytes = 1;
        for (const chunk of this.parts(value)) {
            bytes += Buffer.byteLength(chunk);
            if (bytes > SkillInstallationValidator.metadataBytes)
                throw new Error('Installation metadata exceeds its 4 MiB bound.');
            chunks.push(chunk);
        }
        return Buffer.from(chunks.join('') + '\n');
    }

    private *parts(value: unknown, depth = 0): Generator<string> {
        if (depth > 32) throw new Error('Installation metadata nesting is too deep.');
        if (!value || typeof value !== 'object') {
            const serialized = JSON.stringify(value);
            if (serialized === undefined) throw new Error('Invalid installation JSON value.');
            yield serialized;
            return;
        }
        const array = Array.isArray(value);
        yield array ? '[' : '{';
        let index = 0;
        for (const [key, item] of Object.entries(value)) {
            if (index++) yield ',';
            if (!array) {
                yield JSON.stringify(key);
                yield ':';
            }
            yield* this.parts(item, depth + 1);
        }
        yield array ? ']' : '}';
    }
    name(value: unknown): string {
        if (
            typeof value !== 'string' ||
            value.length > 64 ||
            !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?![\s\S])/.test(value)
        )
            throw new Error('Invalid managed skill name.');
        return value;
    }

    object(value: unknown, keys: string[]) {
        if (
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            Object.keys(value).sort().join('|') !== keys.sort().join('|')
        )
            throw new Error('Invalid closed installation record.');
        return value as Record<string, unknown>;
    }

    sha(value: unknown) {
        if (typeof value !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(value))
            throw new Error('Invalid installation digest.');
    }

    package(value: unknown): SkillInstallationPackage {
        const raw = this.object(value, ['name', 'sha256', 'entries']);
        this.name(raw.name);
        this.sha(raw.sha256);
        if (!Array.isArray(raw.entries) || !raw.entries.length || raw.entries.length > 2048)
            throw new Error('Invalid installation inventory size.');
        let total = 0;
        const paths = new Set<string>();
        for (const item of raw.entries) {
            const entry = this.object(item, ['path', 'kind', 'bytes', 'sha256', 'executable']);
            if (
                typeof entry.path !== 'string' ||
                !entry.path.isWellFormed() ||
                entry.path.length > 1024 ||
                /[\\\x00-\x1f\x7f]/.test(entry.path) ||
                entry.path.split('/').some((part) => !part || part === '.' || part === '..') ||
                paths.has(entry.path)
            )
                throw new Error('Invalid installation inventory path.');
            paths.add(entry.path);
            if (
                !Number.isSafeInteger(entry.bytes) ||
                Number(entry.bytes) < 0 ||
                Number(entry.bytes) > 4_194_304 ||
                typeof entry.executable !== 'boolean'
            )
                throw new Error('Invalid installation file bounds.');
            total += Number(entry.bytes);
            if (entry.kind === 'file') {
                this.sha(entry.sha256);
                continue;
            }
            if (
                entry.kind !== 'directory' ||
                entry.bytes !== 0 ||
                entry.sha256 !== null ||
                entry.executable
            )
                throw new Error('Invalid installation directory.');
        }
        if (total > 33_554_432 || !paths.has('SKILL.md') || !paths.has('LICENSE'))
            throw new Error('Incomplete or oversized installation package.');
        if (createHash('sha256').update(JSON.stringify(raw.entries)).digest('hex') !== raw.sha256)
            throw new Error('Installation inventory digest differs.');
        return value as SkillInstallationPackage;
    }

    receipt(value: unknown, root: string, scope: string): SkillInstallationReceipt {
        const raw = this.object(value, [
            'schema_version',
            'collection',
            'root',
            'scope',
            'version',
            'catalog_sha256',
            'source_git_sha',
            'packages',
        ]);
        if (
            raw.schema_version !== 1 ||
            raw.collection !== 'i9-skills' ||
            raw.root !== root ||
            raw.scope !== scope ||
            typeof raw.version !== 'string' ||
            raw.version.length > 128 ||
            !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?![\s\S])/.test(raw.version) ||
            !Array.isArray(raw.packages) ||
            raw.packages.length > 64
        )
            throw new Error('Invalid selected installation receipt.');
        this.sha(raw.catalog_sha256);
        if (
            raw.source_git_sha !== null &&
            (typeof raw.source_git_sha !== 'string' ||
                !/^[a-f0-9]{40}(?![\s\S])/.test(raw.source_git_sha))
        )
            throw new Error('Invalid asserted bundle revision.');
        const names = new Set();
        for (const item of raw.packages) {
            const entry = this.package(item);
            if (names.has(entry.name)) throw new Error('Duplicate managed skill.');
            names.add(entry.name);
        }
        return value as SkillInstallationReceipt;
    }

    journal(value: unknown, root: string, scope: string): SkillInstallationJournal {
        const raw = this.object(value, ['schema_version', 'id', 'before', 'after', 'operations']);
        if (
            raw.schema_version !== 1 ||
            typeof raw.id !== 'string' ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}(?![\s\S])/.test(
                raw.id,
            ) ||
            !Array.isArray(raw.operations) ||
            raw.operations.length > 128
        )
            throw new Error('Invalid installation transaction.');
        if (raw.before !== null) this.receipt(raw.before, root, scope);
        if (raw.after !== null) this.receipt(raw.after, root, scope);
        const before = new Map(
            (raw.before as SkillInstallationReceipt | null)?.packages.map((item) => [
                item.name,
                item,
            ]) ?? [],
        );
        const after = new Map(
            (raw.after as SkillInstallationReceipt | null)?.packages.map((item) => [
                item.name,
                item,
            ]) ?? [],
        );
        const expected = new Set(
            [...new Set([...before.keys(), ...after.keys()])].filter(
                (name) => before.get(name)?.sha256 !== after.get(name)?.sha256,
            ),
        );
        const names = new Set();
        for (const operation of raw.operations) {
            const row = this.object(operation, ['name', 'before', 'after']);
            this.name(row.name);
            if (names.has(row.name)) throw new Error('Duplicate installation operation.');
            names.add(row.name);
            for (const key of ['before', 'after']) {
                if (row[key] === null) continue;
                if (this.package(row[key]).name !== row.name)
                    throw new Error('Installation operation identity mismatch.');
            }
            if (row.before === null && row.after === null)
                throw new Error('Empty installation operation.');
            if (
                !expected.has(String(row.name)) ||
                JSON.stringify(row.before) !==
                    JSON.stringify(before.get(String(row.name)) ?? null) ||
                JSON.stringify(row.after) !== JSON.stringify(after.get(String(row.name)) ?? null)
            )
                throw new Error('Installation operations differ from the receipt transition.');
        }
        if (names.size !== expected.size)
            throw new Error('Installation transaction omits a receipt transition.');
        return value as SkillInstallationJournal;
    }
}
