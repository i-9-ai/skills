// SPDX-License-Identifier: Apache-2.0
import {
    constants,
    closeSync,
    fstatSync,
    lstatSync,
    openSync,
    opendirSync,
    readSync,
    realpathSync,
} from 'node:fs';
import { join, sep } from 'node:path';
import { parseDocument } from 'yaml';

export type SkillSummary = {
    name: string;
    description: string;
    canonicalPath: string;
    sources: string[];
};

export type Discovery = { skills: SkillSummary[]; warnings: string[] };
export type CollectionSource = { directory: string; label: string };

const MAX_FILE_BYTES = 131_072;
const MAX_ENTRIES = 4096;
const MAX_PACKAGES = 1024;
const MAX_DEPTH = 8;

/** Read metadata only. Never run scripts or write catalogs during discovery. */
export class SkillDiscoveryRepository {
    read(sources: CollectionSource[]): Discovery {
        const skills = new Map<string, SkillSummary>();
        const warnings: string[] = [];

        for (const source of sources) {
            try {
                this.readSource(source, skills, warnings);
            } catch {
                warnings.push(
                    `${source.label}: discovery incomplete; directory unavailable or limit reached.`,
                );
            }
        }

        return {
            skills: [...skills.values()].sort(
                (left, right) =>
                    left.name.localeCompare(right.name, 'en') ||
                    left.sources[0].localeCompare(right.sources[0], 'en'),
            ),
            warnings,
        };
    }

    private readSource(
        source: CollectionSource,
        skills: Map<string, SkillSummary>,
        warnings: string[],
    ): void {
        let root: string;

        try {
            root = realpathSync(source.directory);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
            throw error;
        }

        const pending = [{ directory: root, depth: 0 }];
        const visited = new Set<string>();
        let entries = 0;

        while (pending.length > 0) {
            const item = pending.pop()!;
            if (visited.has(item.directory)) continue;
            visited.add(item.directory);

            const directory = opendirSync(item.directory);

            try {
                let entry;

                while ((entry = directory.readSync()) !== null) {
                    entries += 1;
                    if (entries > MAX_ENTRIES || skills.size >= MAX_PACKAGES)
                        throw new Error('Discovery limit');
                    if (entry.name.startsWith('.')) continue;
                    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

                    const candidate = join(item.directory, entry.name);
                    let canonical: string;

                    try {
                        canonical = realpathSync(candidate);
                    } catch {
                        warnings.push(`${source.label}: skipped a broken package link.`);
                        continue;
                    }

                    if (!lstatSync(canonical).isDirectory()) continue;
                    if (canonical.split(sep).includes('.system')) continue;

                    const existing = skills.get(canonical);
                    if (existing) {
                        if (!existing.sources.includes(source.label))
                            existing.sources.push(source.label);
                        continue;
                    }

                    const summary = this.readSummary(canonical, source.label, warnings);
                    if (summary) {
                        skills.set(canonical, summary);
                        continue;
                    }

                    // Follow explicit package links, but never traverse a linked namespace.
                    if (!entry.isSymbolicLink() && item.depth < MAX_DEPTH) {
                        pending.push({ directory: canonical, depth: item.depth + 1 });
                    }
                }
            } finally {
                directory.closeSync();
            }
        }
    }

    private readSummary(
        directory: string,
        source: string,
        warnings: string[],
    ): SkillSummary | undefined {
        const filename = join(directory, 'SKILL.md');
        let descriptor: number | undefined;

        try {
            descriptor = openSync(
                filename,
                constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
            );
            const before = fstatSync(descriptor);
            if (!before.isFile() || before.nlink !== 1 || before.size > MAX_FILE_BYTES)
                throw new Error('Unsafe entrypoint');

            const bytes = Buffer.alloc(MAX_FILE_BYTES + 1);
            let length = 0;

            while (length < bytes.length) {
                const count = readSync(descriptor, bytes, length, bytes.length - length, length);
                if (count === 0) break;
                length += count;
            }

            const after = fstatSync(descriptor);
            if (
                length > MAX_FILE_BYTES ||
                before.size !== after.size ||
                before.mtimeMs !== after.mtimeMs ||
                before.ctimeMs !== after.ctimeMs
            )
                throw new Error('Changed entrypoint');

            const text = new TextDecoder('utf-8', { fatal: true }).decode(
                bytes.subarray(0, length),
            );
            const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
            if (!frontmatter) throw new Error('Missing frontmatter');

            const document = parseDocument(frontmatter[1], { uniqueKeys: true, strict: true });
            if (document.errors.length > 0 || document.warnings.length > 0)
                throw new Error('Invalid frontmatter');

            const metadata = document.toJS({ maxAliasCount: 0 }) as Record<string, unknown> | null;
            if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
                throw new Error('Invalid summary');
            if (typeof metadata.name !== 'string' || typeof metadata.description !== 'string')
                throw new Error('Missing summary');
            const name = metadata.name;
            const description = metadata.description;

            if (
                !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) ||
                name.length > 64 ||
                !description.trim() ||
                description.length > 4096
            )
                throw new Error('Invalid summary');

            return { name, description, canonicalPath: directory, sources: [source] };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                warnings.push(`${source}: skipped an unreadable or unsupported SKILL.md.`);
            }
            return undefined;
        } finally {
            if (descriptor !== undefined) closeSync(descriptor);
        }
    }
}
