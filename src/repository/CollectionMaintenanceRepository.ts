// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { validateSkill } from '../../.agents/skills/skill-authoring/scripts/skill_tools.mjs';
import {
    deriveCatalog,
    strictJson,
    syncCatalog,
    checkCatalog,
    validateCatalogData,
} from '../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';
import { CollectionRemediationValidator } from '../validator/CollectionRemediationValidator.ts';
import type {
    CollectionAudit,
    CollectionFinding,
    CollectionSelection,
} from '../validator/CollectionRemediationValidator.ts';

type InventoryEntry = { path: string; type: string; mode: number; sha256?: string };
export type CatalogPreimage = { bytes: Buffer | null; mode: number | null };
export type CollectionObservation = {
    root: string;
    audit: CollectionAudit;
    before: CatalogPreimage;
    expected: Buffer | null;
};

/** Owns bounded collection evidence and the sole supported write: its derived catalog. */
export class CollectionMaintenanceRepository {
    private readonly validator = new CollectionRemediationValidator();

    readDocument(filename: string): unknown {
        const selected = resolve(filename);
        const root = new SafeRoot(dirname(selected));
        try {
            return strictJson(root.readBytes(basename(selected), 1_048_576));
        } finally {
            root.close();
        }
    }

    observe(selection: CollectionSelection): CollectionObservation {
        const input = this.validator.selection(selection);
        const root = new SafeRoot(input.collection);
        try {
            return this.inspect(root, input);
        } finally {
            root.close();
        }
    }

    private inspect(root: SafeRoot, input: CollectionSelection): CollectionObservation {
        const prefix = input.layout === 'repository' ? '.agents/skills' : 'skills';
        const records: InventoryEntry[] = [];
        const findings: CollectionFinding[] = [];
        const directories: string[] = [];
        let complete = true;
        let examined = 0;
        let totalBytes = 0;
        let exhausted = false;
        const addFinding = (finding: CollectionFinding) => {
            if (findings.length >= 512) {
                complete = false;
                return;
            }
            findings.push(finding);
        };
        const unsafe = (path: string, code = 'unsafe_entry') => {
            complete = false;
            addFinding({
                code,
                path,
                message:
                    'Inspect this unsupported, unsafe or bounded-out entry before planning writes.',
                remediation: 'handoff',
                owner: 'skill-security-review',
            });
        };
        const visit = (relative: string, depth = 0) => {
            if (exhausted) return;
            if (depth > 24 || ++examined > 16_384) {
                exhausted = true;
                unsafe(relative, 'scope_limit');
                return;
            }
            try {
                const inspected = root.inspect(relative);
                const info = inspected.info!;
                const mode = info.mode & 0o777;
                if (info.isFile()) {
                    totalBytes += info.size;
                    if (info.size > 4_194_304 || totalBytes > 67_108_864) {
                        exhausted = true;
                        unsafe(relative, 'scope_limit');
                        return;
                    }
                    records.push({
                        path: relative,
                        type: 'file',
                        mode,
                        sha256: this.validator.digest(root.readBytes(relative, 4_194_304)),
                    });
                    return;
                }
                records.push({ path: relative, type: 'directory', mode });
                directories.push(relative);
                const directory = fs.opendirSync(inspected.absolute);
                const names: string[] = [];
                try {
                    let entry;
                    while ((entry = directory.readSync()) !== null) {
                        if (
                            input.layout === 'global' &&
                            relative === prefix &&
                            ['.system', '.DS_Store'].includes(entry.name)
                        )
                            continue;
                        if (names.length + examined >= 16_384) {
                            exhausted = true;
                            unsafe(relative, 'scope_limit');
                            break;
                        }
                        names.push(entry.name);
                    }
                } finally {
                    directory.closeSync();
                }
                root.verifySnapshot(inspected);
                for (const name of names.sort()) visit(`${relative}/${name}`, depth + 1);
            } catch {
                unsafe(/^[\x20-\x7e]{1,1024}$/u.test(relative) ? relative : '<unsupported-entry>');
            }
        };
        visit(prefix);
        const files = new Set(
            records.filter((entry) => entry.type === 'file').map((entry) => entry.path),
        );
        const paths: string[] = [];
        for (const directory of directories.sort()) {
            if (directory === prefix) continue;
            if (input.layout === 'repository' && directory.slice(prefix.length + 1).includes('/'))
                continue;
            if (
                input.layout === 'global' &&
                (!files.has(`${directory}/SKILL.md`) ||
                    paths.some((parent) => directory.startsWith(`${parent}/`)))
            )
                continue;
            if (paths.length >= 256) {
                unsafe(directory, 'package_limit');
                break;
            }
            paths.push(directory);
        }
        const packages: CollectionAudit['packages'] = paths.map((path) => {
            // An incomplete inventory must not trigger a new scanner with its own budget.
            if (!complete) return { name: basename(path), path, validation: 'not_run' };
            try {
                validateSkill(join(root.path, path));
                return { name: basename(path), path, validation: 'passed' };
            } catch (error) {
                addFinding(this.packageFinding(path, error));
                return { name: basename(path), path, validation: 'failed' };
            }
        });
        if (!packages.length)
            addFinding({
                code: 'no_packages',
                path: prefix,
                message:
                    'Select a collection with canonical SKILL.md packages before catalog maintenance.',
                remediation: 'handoff',
                owner: 'skills-catalog',
            });

        const before: CatalogPreimage = { bytes: null, mode: null };
        let status: CollectionAudit['catalog']['status'] = 'missing';
        try {
            const catalog = root.inspect('skills-catalog.json', { allowMissingLeaf: true });
            if (catalog.info) {
                before.bytes = root.readBytes('skills-catalog.json', 1_048_576);
                before.mode = catalog.info.mode & 0o777;
                try {
                    validateCatalogData(strictJson(before.bytes));
                    status = 'current';
                } catch {
                    status = 'malformed';
                }
            }
        } catch {
            complete = false;
            status = 'unavailable';
        }
        let expected: Buffer | null = null;
        try {
            if (!complete) throw new Error('Incomplete inventory prevents catalog derivation.');
            // The helper remains the only authority for canonical layout and metadata bytes.
            expected = this.validator.encode(deriveCatalog(root.path, { layout: input.layout }));
            if (status === 'current' && !before.bytes!.equals(expected)) status = 'stale';
            if (['current', 'missing', 'stale'].includes(status))
                syncCatalog(root.path, { layout: input.layout, dryRun: true });
        } catch {
            expected = null;
            if (status !== 'malformed') status = 'unavailable';
            addFinding({
                code: 'catalog_derivation',
                path: prefix,
                message:
                    'Resolve package metadata, layout or legacy catalog conflicts before synchronization.',
                remediation: 'handoff',
                owner: 'skills-catalog',
            });
        }
        if (status !== 'current') {
            const supported =
                complete && expected !== null && ['missing', 'stale'].includes(status);
            addFinding({
                code: `catalog_${status}`,
                path: 'skills-catalog.json',
                message: supported
                    ? 'Regenerate the derived catalog from current package metadata.'
                    : 'Review the catalog before replacement; malformed or unsafe data is never overwritten automatically.',
                remediation: supported ? 'catalog.sync' : 'handoff',
                owner: 'skills-catalog',
            });
        }
        records.sort((a, b) => a.path.localeCompare(b.path));
        findings.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
        root.assertStable();
        const audit: CollectionAudit = {
            schema_version: 1,
            policy: 'collection-maintenance-v1',
            baseline: {
                root_identity_sha256: this.validator.digest(
                    `${root.path}\0${root.rootInfo.dev}\0${root.rootInfo.ino}`,
                ),
                layout: input.layout,
                inventory_sha256: this.validator.digest(JSON.stringify(records)),
                catalog_sha256: before.bytes ? this.validator.digest(before.bytes) : null,
                catalog_mode: before.mode,
            },
            packages,
            catalog: {
                status,
                expected_after_sha256: expected ? this.validator.digest(expected) : null,
            },
            findings,
            coverage: { complete, examined_entries: examined, omitted: complete ? 0 : null },
            validation: { local: 'structural', official: 'not_run', behavioral: 'not_run' },
        };
        this.validator.encode(audit);
        return { root: root.path, audit, before, expected };
    }

    sync(selection: CollectionSelection): void {
        syncCatalog(selection.collection, { layout: selection.layout });
        checkCatalog(selection.collection, { layout: selection.layout });
    }

    private packageFinding(path: string, error: unknown): CollectionFinding {
        const observed = error instanceof Error ? error.message : '';
        const categories = [
            [
                /LICENSE|license/u,
                'package_license',
                'Review the declared license and bundled full license text; preserve notices and redistribution rights.',
            ],
            [
                /openai\.yaml|interface|icon/u,
                'package_interface',
                'Review the optional host interface and its package-relative asset references.',
            ],
            [
                /link|reference/u,
                'package_reference',
                'Repair broken or unsafe local references using the bundled package validator; do not remove useful guidance merely to pass validation.',
            ],
            [
                /frontmatter|description|metadata|skill name/u,
                'package_metadata',
                'Repair required metadata and package identity using the bundled package validator.',
            ],
        ] as const;
        const matched = categories.find(([pattern]) => pattern.test(observed));
        return {
            code: matched?.[1] ?? 'package_validation',
            path,
            message:
                matched?.[2] ??
                'Run the bundled local package validator and review this package; no content repair is automatic.',
            remediation: 'handoff',
            owner: 'skill-evolution',
        };
    }

    restore(selection: CollectionSelection, before: CatalogPreimage, expectedAfter: string): void {
        const root = new SafeRoot(selection.collection);
        const temporary = `.skills-catalog.rollback-${randomUUID()}`;
        let created = false;
        try {
            const current = root.inspect('skills-catalog.json', { allowMissingLeaf: true });
            const bytes = current.info ? root.readBytes('skills-catalog.json', 1_048_576) : null;
            if (
                bytes?.equals(before.bytes ?? Buffer.alloc(0)) &&
                before.bytes !== null &&
                (current.info!.mode & 0o777) === before.mode
            )
                return;
            if (bytes === null && before.bytes === null) return;
            const currentHash = bytes ? this.validator.digest(bytes) : null;
            const originalHash = before.bytes ? this.validator.digest(before.bytes) : null;
            if (!bytes || (currentHash !== expectedAfter && currentHash !== originalHash))
                throw new Error(
                    'Catalog changed outside this operation; preserve recovery evidence and inspect before restoring.',
                );
            if (before.bytes === null) {
                fs.unlinkSync(current.absolute);
                return;
            }
            const descriptor = fs.openSync(
                join(root.path, temporary),
                fs.constants.O_WRONLY |
                    fs.constants.O_CREAT |
                    fs.constants.O_EXCL |
                    fs.constants.O_NOFOLLOW,
                0o600,
            );
            created = true;
            try {
                fs.writeFileSync(descriptor, before.bytes);
                fs.fchmodSync(descriptor, before.mode!);
                fs.fsyncSync(descriptor);
            } finally {
                fs.closeSync(descriptor);
            }
            root.verifySnapshot(current);
            fs.renameSync(join(root.path, temporary), current.absolute);
            created = false;
            if (
                !root.readBytes('skills-catalog.json', 1_048_576).equals(before.bytes) ||
                (root.info('skills-catalog.json')!.mode & 0o777) !== before.mode
            )
                throw new Error('Catalog rollback verification failed.');
        } finally {
            if (created) fs.unlinkSync(join(root.path, temporary));
            root.close();
        }
    }
}
