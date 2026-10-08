// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import {
    closeSync,
    existsSync,
    lstatSync,
    mkdirSync,
    openSync,
    renameSync,
    unlinkSync,
    writeFileSync,
    writeSync,
} from 'node:fs';
import { dirname, join, parse, relative, resolve, sep } from 'node:path';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { strictJson } from '../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';
import { SkillInstallationConfiguration } from '../config/SkillInstallationConfiguration.ts';
import { SkillInstallationValidator } from '../validator/SkillInstallationValidator.ts';
import type {
    SkillInstallationJournal,
    SkillInstallationReceipt,
} from '../validator/SkillInstallationValidator.ts';
import { SkillBundleRepository, installationDigest } from './SkillBundleRepository.ts';

/** Owns only receipted package directories and its private recovery state. */
export class SkillInstallationRepository {
    readonly validator = new SkillInstallationValidator();
    readonly configuration: SkillInstallationConfiguration;
    readonly inventory: SkillBundleRepository;
    private readonly checkpoint: (phase: string) => void;
    constructor(
        configuration: SkillInstallationConfiguration,
        inventory = new SkillBundleRepository(),
        checkpoint: (phase: string) => void = () => {},
    ) {
        this.configuration = configuration;
        this.inventory = inventory;
        this.checkpoint = checkpoint;
    }

    directory(path: string, create = false): boolean {
        const absolute = resolve(path);
        const parts = relative(parse(absolute).root, absolute).split(sep);
        let cursor = parse(absolute).root;
        for (const part of parts) {
            cursor = join(cursor, part);
            let info;
            try {
                info = lstatSync(cursor);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                if (!create) return false;
                mkdirSync(cursor, { mode: 0o700 });
                info = lstatSync(cursor);
            }
            if (!info.isDirectory() || info.isSymbolicLink())
                throw new Error('Installation paths require ordinary directories.');
        }
        const selected = lstatSync(path);
        if (process.getuid && selected.uid !== process.getuid())
            throw new Error('Installation directory is not caller-owned.');
        return true;
    }

    private json(name: string): unknown | null {
        if (!this.directory(this.configuration.state)) return null;
        const root = new SafeRoot(this.configuration.state);
        try {
            const info = root.inspect(name, { allowMissingLeaf: true });
            return info.info
                ? strictJson(root.readBytes(name, SkillInstallationValidator.metadataBytes), {
                      maxBytes: SkillInstallationValidator.metadataBytes,
                  })
                : null;
        } finally {
            root.close();
        }
    }

    receipt(): SkillInstallationReceipt | null {
        const value = this.json('receipt.json');
        return value === null
            ? null
            : this.validator.receipt(value, this.configuration.root, this.configuration.scope);
    }

    pending(): SkillInstallationJournal | null {
        const value = this.json('pending.json');
        return value === null
            ? null
            : this.validator.journal(value, this.configuration.root, this.configuration.scope);
    }

    hasLock(): boolean {
        return this.json('lock.json') !== null;
    }

    nativeState(host: 'codex' | 'claude', pending = false): unknown | null {
        return this.json(`native-${host}${pending ? '-pending' : ''}.json`);
    }

    marketplaceState(host: 'codex' | 'claude'): unknown | null {
        return this.json(`native-${host}-marketplace.json`);
    }

    publishMarketplace(host: 'codex' | 'claude', value: unknown) {
        this.publish(`native-${host}-marketplace.json`, value);
    }

    publishNative(host: 'codex' | 'claude', value: unknown, pending = false) {
        this.publish(`native-${host}${pending ? '-pending' : ''}.json`, value);
    }

    clearNative(host: 'codex' | 'claude', pending = false) {
        this.clear(`native-${host}${pending ? '-pending' : ''}.json`);
    }

    actual(name: string) {
        this.validator.name(name);
        if (!this.directory(this.configuration.skills)) return null;
        const root = new SafeRoot(this.configuration.skills);
        try {
            const leaf = root.inspect(name, { allowMissingLeaf: true });
            if (!leaf.info) return null;
            return this.inventory.inventory(leaf.absolute, name);
        } finally {
            root.close();
        }
    }

    private publish(name: string, value: unknown) {
        const temporary = join(this.configuration.state, `.${randomUUID()}.json`);
        writeFileSync(temporary, this.validator.serialize(value), {
            flag: 'wx',
            mode: 0o600,
        });
        const root = new SafeRoot(this.configuration.state);
        try {
            root.inspect(name, { allowMissingLeaf: true });
            renameSync(temporary, join(root.path, name));
        } finally {
            root.close();
        }
    }

    private clear(name: string) {
        const root = new SafeRoot(this.configuration.state);
        try {
            const item = root.inspect(name, { allowMissingLeaf: true });
            if (item.info) {
                root.readBytes(name, 4_194_304);
                unlinkSync(item.absolute);
            }
        } finally {
            root.close();
        }
    }

    locked<T>(callback: () => T, recovery = false): T {
        if (
            this.configuration.scope === 'project' &&
            !this.directory(dirname(this.configuration.root))
        )
            throw new Error(
                'The selected project must already exist as an ordinary caller-owned directory.',
            );
        this.directory(this.configuration.root, true);
        this.directory(this.configuration.state, true);
        const lock = join(this.configuration.state, 'lock.json');
        if (existsSync(lock) && recovery) {
            const owner = this.json('lock.json') as { pid?: unknown; nonce?: unknown };
            if (
                !owner ||
                !Number.isSafeInteger(owner.pid) ||
                Number(owner.pid) <= 0 ||
                typeof owner.nonce !== 'string'
            )
                throw new Error('Invalid installation lock; inspect it manually.');
            let alive = true;
            try {
                process.kill(Number(owner.pid), 0);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false;
            }
            if (alive) throw new Error('An installation owner may still be running.');
            this.clear('lock.json');
        }
        const value = JSON.stringify({ pid: process.pid, nonce: randomUUID() }) + '\n';
        let fd: number;
        try {
            fd = openSync(lock, 'wx', 0o600);
        } catch {
            throw new Error('Installation is locked; use status or recover after its owner stops.');
        }
        try {
            writeSync(fd, value);
        } finally {
            closeSync(fd);
        }
        try {
            return callback();
        } finally {
            const owner = this.json('lock.json');
            if (JSON.stringify(owner) === value.trim()) this.clear('lock.json');
        }
    }

    apply(journal: SkillInstallationJournal, source: SkillBundleRepository) {
        this.validator.journal(journal, this.configuration.root, this.configuration.scope);
        if (this.pending()) throw new Error('Recover the unfinished installation first.');
        if (JSON.stringify(this.receipt()) !== JSON.stringify(journal.before))
            throw new Error('Installation receipt changed.');
        for (const item of journal.before?.packages ?? []) {
            if (this.actual(item.name)?.sha256 !== item.sha256)
                throw new Error('Owned installation changed before staging.');
        }
        const transaction = join(this.configuration.state, 'transaction', journal.id);
        this.directory(transaction, true);
        for (const part of ['candidate', 'previous', 'withdrawn'])
            this.directory(join(transaction, part), true);
        writeFileSync(join(transaction, 'journal.json'), this.validator.serialize(journal), {
            flag: 'wx',
            mode: 0o600,
        });
        for (const operation of journal.operations) {
            if (!operation.after) continue;
            const target = join(transaction, 'candidate', operation.name);
            mkdirSync(target, { mode: 0o700 });
            for (const entry of operation.after.entries) {
                const path = join(target, entry.path);
                if (entry.kind === 'directory') {
                    mkdirSync(path, { mode: 0o700 });
                    continue;
                }
                const bytes = source.bytes(operation.name, entry.path);
                if (bytes.length !== entry.bytes || installationDigest(bytes) !== entry.sha256)
                    throw new Error('Bundled package changed during staging.');
                writeFileSync(path, bytes, { flag: 'wx', mode: entry.executable ? 0o700 : 0o600 });
                this.checkpoint('candidate-file');
            }
            if (this.inventory.inventory(target, operation.name).sha256 !== operation.after.sha256)
                throw new Error('Staged installation inventory differs.');
        }
        this.publish('pending.json', journal);
        this.checkpoint('staged');
        this.directory(this.configuration.skills, true);
        for (const operation of journal.operations) {
            const current = this.actual(operation.name);
            if ((current?.sha256 ?? null) !== (operation.before?.sha256 ?? null))
                throw new Error('Installed bytes changed before replacement.');
            if (current)
                renameSync(
                    join(this.configuration.skills, operation.name),
                    join(transaction, 'previous', operation.name),
                );
            this.checkpoint('withdrawn');
            if (operation.after) {
                if (this.actual(operation.name))
                    throw new Error('Installation destination appeared.');
                renameSync(
                    join(transaction, 'candidate', operation.name),
                    join(this.configuration.skills, operation.name),
                );
            }
            this.checkpoint('published');
        }
        for (const item of journal.after?.packages ?? []) {
            if (this.actual(item.name)?.sha256 !== item.sha256)
                throw new Error('Published installation changed before its receipt.');
        }
        for (const item of journal.operations.filter((operation) => !operation.after)) {
            if (this.actual(item.name)) throw new Error('Withdrawn installation reappeared.');
        }
        if (journal.after) this.publish('receipt.json', journal.after);
        else this.clear('receipt.json');
        this.checkpoint('receipt');
        this.clear('pending.json');
        return transaction;
    }

    inspectRecovery(journal: SkillInstallationJournal) {
        this.validator.journal(journal, this.configuration.root, this.configuration.scope);
        const transaction = join(this.configuration.state, 'transaction', journal.id);
        if (!this.directory(transaction)) throw new Error('Recovery transaction is missing.');
        const root = new SafeRoot(transaction);
        try {
            if (
                JSON.stringify(
                    strictJson(
                        root.readBytes('journal.json', SkillInstallationValidator.metadataBytes),
                        { maxBytes: SkillInstallationValidator.metadataBytes },
                    ),
                ) !== JSON.stringify(journal)
            )
                throw new Error('Recovery journal differs from its retained record.');
        } finally {
            root.close();
        }
        const receipt = this.receipt();
        if (
            ![JSON.stringify(journal.before), JSON.stringify(journal.after)].includes(
                JSON.stringify(receipt),
            )
        )
            throw new Error('Receipt changed after the interrupted installation.');
        const changed = new Set(journal.operations.map((operation) => operation.name));
        for (const item of journal.before?.packages ?? []) {
            if (!changed.has(item.name) && this.actual(item.name)?.sha256 !== item.sha256)
                throw new Error('Consumer edits to an unchanged owned package block recovery.');
        }
        const states = journal.operations.map((operation) => {
            const current = this.actual(operation.name);
            const previousPath = join(transaction, 'previous', operation.name);
            const previous = this.directory(previousPath)
                ? this.inventory.inventory(previousPath, operation.name)
                : null;
            if (previous && previous.sha256 !== operation.before?.sha256)
                throw new Error('Retained preimage changed.');
            if (
                current &&
                current.sha256 !== operation.before?.sha256 &&
                current.sha256 !== operation.after?.sha256
            )
                throw new Error('Consumer edits block recovery.');
            if (operation.before && !previous && current?.sha256 !== operation.before.sha256)
                throw new Error('Recovery preimage is missing.');
            if (previous && current?.sha256 === operation.before?.sha256)
                throw new Error('Ambiguous duplicate recovery preimages.');
            const withdrawn = join(transaction, 'withdrawn', operation.name);
            const hasWithdrawn = this.directory(withdrawn);
            if (hasWithdrawn) {
                if (
                    this.inventory.inventory(withdrawn, operation.name).sha256 !==
                    operation.after?.sha256
                )
                    throw new Error('Withdrawn recovery bytes changed.');
                if (current?.sha256 === operation.after?.sha256)
                    throw new Error('Ambiguous duplicate withdrawn bytes.');
            }
            const candidatePath = join(transaction, 'candidate', operation.name);
            const candidate = this.directory(candidatePath)
                ? this.inventory.inventory(candidatePath, operation.name)
                : null;
            if (candidate && candidate.sha256 !== operation.after?.sha256)
                throw new Error('Retained candidate changed.');
            if (!current && operation.after && !candidate && !hasWithdrawn)
                throw new Error(
                    'Missing published package or ambiguous consumer deletion blocks recovery.',
                );
            return { operation, current, previous, previousPath, withdrawn };
        });
        return { transaction, states };
    }

    recover(journal: SkillInstallationJournal) {
        const { transaction, states } = this.inspectRecovery(journal);
        for (const row of states.reverse()) {
            if (row.current && row.current.sha256 !== row.operation.before?.sha256)
                renameSync(join(this.configuration.skills, row.operation.name), row.withdrawn);
            this.checkpoint('recover-withdrawn');
            if (row.previous)
                renameSync(row.previousPath, join(this.configuration.skills, row.operation.name));
            this.checkpoint('recover-restored');
        }
        if (journal.before) this.publish('receipt.json', journal.before);
        else this.clear('receipt.json');
        this.clear('pending.json');
        return transaction;
    }
}
