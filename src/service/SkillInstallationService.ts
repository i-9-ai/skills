// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, sep } from 'node:path';
import { realpathSync } from 'node:fs';
import type { InstallationOperation } from '../config/SkillInstallationConfiguration.ts';
import { SkillInstallationConfiguration } from '../config/SkillInstallationConfiguration.ts';
import { SkillBundleRepository } from '../repository/SkillBundleRepository.ts';
import { SkillInstallationRepository } from '../repository/SkillInstallationRepository.ts';
import type {
    SkillInstallationJournal,
    SkillInstallationReceipt,
} from '../validator/SkillInstallationValidator.ts';

/** Plans the whole owned collection before the repository can publish any package. */
export class SkillInstallationService {
    readonly configuration: SkillInstallationConfiguration;
    readonly bundle: SkillBundleRepository;
    readonly repository: SkillInstallationRepository;
    constructor(
        configuration = new SkillInstallationConfiguration(),
        bundle = new SkillBundleRepository(),
        repository = new SkillInstallationRepository(configuration),
    ) {
        this.configuration = configuration;
        this.bundle = bundle;
        this.repository = repository;
    }

    run(operation: InstallationOperation, write = false) {
        if (operation === 'recover') return this.recover(write);
        const selection = operation === 'uninstall' ? null : this.bundle.bundle();
        const before = this.repository.receipt();
        const pending = this.repository.pending();
        const after: SkillInstallationReceipt | null = selection
            ? {
                  schema_version: 1,
                  collection: 'i9-skills',
                  root: this.configuration.root,
                  scope: this.configuration.scope,
                  version: selection.version,
                  catalog_sha256: selection.catalog_sha256,
                  source_git_sha: selection.source_git_sha ?? null,
                  packages: selection.packages,
              }
            : null;
        const conflicts: { name: string; reason: string }[] = [];
        const operations: SkillInstallationJournal['operations'] = [];
        const unchanged: string[] = [];
        const previous = new Map(before?.packages.map((item) => [item.name, item]) ?? []);
        const wanted = new Map(after?.packages.map((item) => [item.name, item]) ?? []);
        for (const name of [...new Set([...previous.keys(), ...wanted.keys()])].sort()) {
            const owned = previous.get(name) ?? null;
            const desired = wanted.get(name) ?? null;
            let actual;
            try {
                actual = this.repository.actual(name);
            } catch {
                conflicts.push({ name, reason: 'unsafe-installed-path' });
                continue;
            }
            if (!owned && actual) {
                conflicts.push({ name, reason: 'unmanaged-collision' });
                continue;
            }
            if (owned && actual?.sha256 !== owned.sha256) {
                conflicts.push({ name, reason: 'owned-content-changed-or-missing' });
                continue;
            }
            if (owned?.sha256 === desired?.sha256) {
                unchanged.push(name);
                continue;
            }
            operations.push({ name, before: owned, after: desired });
        }
        const changing = JSON.stringify(before) !== JSON.stringify(after);
        const result = {
            schema_version: 1,
            operation,
            scope: this.configuration.scope,
            root: this.configuration.root,
            version: selection?.version ?? null,
            installed_version: before?.version ?? null,
            installed: Boolean(before),
            written: false,
            changing,
            additions: operations.filter((item) => !item.before).map((item) => item.name),
            replacements: operations
                .filter((item) => item.before && item.after)
                .map((item) => item.name),
            removals: operations.filter((item) => !item.after).map((item) => item.name),
            unchanged,
            conflicts,
            pending_transaction: pending?.id ?? null,
            receipt: before ? `${this.configuration.state}/receipt.json` : null,
            official_validation: 'not-observed-by-installer',
            setup: 'not-run',
            host_discovery: 'not-verified',
        };
        if (!write || operation === 'status') return result;
        if (operation === 'install' || operation === 'upgrade') this.assertNoNative();
        if (pending) throw new Error('An interrupted installation needs skills recover --write.');
        if (conflicts.length)
            throw new Error(
                `Installation conflicts: ${conflicts.map((item) => `${item.name}:${item.reason}`).join(', ')}.`,
            );
        if (operation === 'upgrade' && !before)
            throw new Error('No owned installation; use skills install first.');
        if (operation === 'install' && before && changing)
            throw new Error('An owned installation exists; use skills upgrade.');
        if (!changing || (operation === 'uninstall' && !before)) return result;
        const source = realpathSync(this.bundle.configuration.root());
        for (const [left, right] of [
            [source, this.configuration.root],
            [this.configuration.root, source],
        ]) {
            const path = relative(left, right);
            if (!path || !(path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)))
                throw new Error('Installation source and destination must not overlap.');
        }
        const journal: SkillInstallationJournal = {
            schema_version: 1,
            id: randomUUID(),
            before,
            after,
            operations,
        };
        this.repository.validator.serialize(journal);
        const recovery = this.repository.locked(() => {
            if (operation === 'install' || operation === 'upgrade') this.assertNoNative();
            if (selection && JSON.stringify(selection) !== JSON.stringify(this.bundle.bundle()))
                throw new Error('Bundled source changed before installation.');
            return this.repository.apply(journal, this.bundle);
        });
        return {
            ...result,
            written: true,
            installed: Boolean(after),
            receipt: after ? `${this.configuration.state}/receipt.json` : null,
            recovery,
        };
    }

    private assertNoNative() {
        if (
            this.repository.nativeState('codex') ||
            this.repository.nativeState('claude') ||
            this.repository.nativeState('codex', true) ||
            this.repository.nativeState('claude', true)
        )
            throw new Error('Resolve the owned native plugin route before creating loose copies.');
    }

    private recover(write: boolean) {
        const pending = this.repository.pending();
        const result = {
            schema_version: 1,
            operation: 'recover',
            pending_transaction: pending?.id ?? null,
            written: false,
        };
        if (!write) return result;
        if (!pending) {
            if (!this.repository.hasLock()) return result;
            return this.repository.locked(
                () => ({ ...result, written: true, recovered_lock: true }),
                true,
            );
        }
        const recovery = this.repository.locked(() => {
            if (JSON.stringify(this.repository.pending()) !== JSON.stringify(pending))
                throw new Error('Recovery journal changed.');
            return this.repository.recover(pending);
        }, true);
        return { ...result, written: true, recovery };
    }
}
