// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import {
    constants,
    closeSync,
    fstatSync,
    lstatSync,
    mkdirSync,
    openSync,
    readSync,
    realpathSync,
    writeFileSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir, userInfo } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { NativePilotBaselineMigration } from '../migration/NativePilotBaselineMigration.ts';
import { NativePilotStateSchemaValidator } from '../validator/NativePilotStateSchemaValidator.ts';
import type { NativePilotStateDefinition } from '../validator/NativePilotStateSchemaValidator.ts';

export interface NativePilotStateSnapshot {
    schema_version: 2;
    exists: boolean;
    files: Array<{ name: string; bytes: number; sha256: string }>;
    migrations: Array<{ version: number; checksum: string }>;
    schema: NativePilotStateDefinition[];
    tables: Array<{ name: string; sql_sha256: string; rows: string[] }>;
    state_sha256: string;
    status: 'captured' | 'blocked';
    reason: string;
}
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const same = (a: Stats, b: Stats) =>
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs;
const extensions = ['', '-journal', '-wal', '-shm'];

/** Explicit baseline seed only; snapshots read an exclusive copy and never migrate source state. */
export class NativePilotStateSnapshotRepository {
    private readonly output: string;
    private readonly retained = new Map<
        string,
        Array<{ path: string; bytes: number; sha256: string }>
    >();
    readonly databasePath: string;

    constructor(selection: { home: string; outputRoot: string }) {
        for (const path of [selection.home, selection.outputRoot]) {
            if (
                resolve(path) !== path ||
                realpathSync(path) !== path ||
                !lstatSync(path).isDirectory()
            )
                throw new Error('state_snapshot_root');
        }
        const account = userInfo();
        const native =
            process.platform === 'linux' &&
            account.uid === 1000 &&
            account.gid === 1000 &&
            selection.home === join('/', 'home', 'node') &&
            account.homedir === selection.home &&
            process.env.HOME === account.homedir &&
            !Object.hasOwn(process.env, 'CODEX_HOME') &&
            selection.outputRoot.startsWith('/pilot/native-output/');
        const fixtureRoot = dirname(selection.home);
        const fixture =
            fixtureRoot.startsWith(realpathSync(tmpdir()) + '/') &&
            /^i9-native-state-fixture-[A-Za-z0-9]+$/.test(basename(fixtureRoot)) &&
            selection.home === join(fixtureRoot, 'home') &&
            selection.outputRoot === join(fixtureRoot, 'output') &&
            lstatSync(fixtureRoot).uid === account.uid &&
            (lstatSync(fixtureRoot).mode & 0o777) === 0o700 &&
            !selection.home.startsWith(account.homedir + '/') &&
            !selection.outputRoot.startsWith(account.homedir + '/');
        if (!native && !fixture) throw new Error('state_snapshot_owned_lane');
        this.output = selection.outputRoot;
        this.databasePath = join(selection.home, '.agents', 'skills-usage.db');
    }

    private presence(path: string): boolean {
        try {
            lstatSync(path);
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
            throw error;
        }
    }

    private readStable(path: string, stat: Stats): Buffer {
        const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            if (!same(stat, fstatSync(fd))) throw new Error('state_changed');
            const chunks: Buffer[] = [];
            let total = 0;
            for (;;) {
                const chunk = Buffer.alloc(Math.min(65_536, 33_554_433 - total));
                const count = readSync(fd, chunk, 0, chunk.length, null);
                if (!count) break;
                total += count;
                if (total > 33_554_432) throw new Error('state_unsafe_file');
                chunks.push(chunk.subarray(0, count));
            }
            if (total !== stat.size || !same(stat, fstatSync(fd)) || !same(stat, lstatSync(path)))
                throw new Error('state_changed');
            return Buffer.concat(chunks, total);
        } finally {
            closeSync(fd);
        }
    }

    private sourceFiles() {
        const parent = dirname(this.databasePath);
        if (!this.presence(parent)) return [];
        if (realpathSync(parent) !== parent || !lstatSync(parent).isDirectory())
            throw new Error('state_linked_parent');
        const files = extensions.flatMap((suffix) => {
            const path = this.databasePath + suffix;
            if (!this.presence(path)) return [];
            const stat = lstatSync(path);
            if (!stat.isFile() || stat.nlink !== 1 || stat.size > 33_554_432)
                throw new Error('state_unsafe_file');
            return [{ path, suffix, stat }];
        });
        if (!files.some((file) => file.suffix === '') && files.length)
            throw new Error('state_orphan_sidecar');
        if (files.some((file) => file.suffix === '-journal'))
            throw new Error('state_hot_journal_unknown');
        return files;
    }

    seed(runId: string): void {
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId))
            throw new Error('state_seed_identity');
        if (this.sourceFiles().length) throw new Error('state_seed_preexisting');
        const parent = dirname(this.databasePath);
        if (!this.presence(parent)) mkdirSync(parent, { mode: 0o700 });
        if (realpathSync(parent) !== parent) throw new Error('state_linked_parent');
        // Exclusively reserve the main file only after all reserved names have been checked.
        writeFileSync(this.databasePath, '', { flag: 'wx', mode: 0o600 });
        const database = new DatabaseSync(this.databasePath);
        try {
            new NativePilotBaselineMigration().migrateSkillReads(database);
            const payload = JSON.stringify({
                fixture: 'native-pilot-prior-history',
                run_id: runId,
                value: 'preserve-original-payload',
            });
            database
                .prepare(
                    'INSERT INTO usage_events(event_id,event_type,occurred_at,session,envelope) VALUES(?,?,?,?,?)',
                )
                .run(
                    runId,
                    'native-pilot-synthetic-prior',
                    '2026-10-04T00:00:00.000Z',
                    runId,
                    payload,
                );
            database
                .prepare(
                    'INSERT INTO usage_reads(event_id,collection,skill,revision,session,occurred_at) VALUES(?,?,?,?,?,?)',
                )
                .run(
                    runId,
                    'independent-fixture',
                    'prior-synthetic-skill',
                    'baseline-synthetic',
                    runId,
                    '2026-10-04T00:00:00.000Z',
                );
        } finally {
            database.close();
        }
    }

    snapshot(label: string): NativePilotStateSnapshot {
        if (!/^[a-z][a-z0-9-]{0,79}$/.test(label)) throw new Error('state_snapshot_label');
        const original = this.sourceFiles();
        if (!original.length) {
            const value = {
                schema_version: 2 as const,
                exists: false,
                files: [],
                migrations: [],
                schema: [],
                tables: [],
                state_sha256: sha('absent'),
                status: 'captured' as const,
                reason: 'source-state-absent-no-open-no-create',
            };
            this.retain(label, value);
            if (this.sourceFiles().length) throw new Error('state_changed');
            return value;
        }
        const copyRoot = join(this.output, `${label}-sqlite-copy`);
        mkdirSync(copyRoot, { mode: 0o700 });
        const queryRoot = join(this.output, `${label}-sqlite-query`);
        mkdirSync(queryRoot, { mode: 0o700 });
        const files = original.map((file) => {
            const bytes = this.readStable(file.path, file.stat);
            writeFileSync(join(copyRoot, 'skills-usage.db' + file.suffix), bytes, {
                flag: 'wx',
                mode: 0o400,
            });
            writeFileSync(join(queryRoot, 'skills-usage.db' + file.suffix), bytes, {
                flag: 'wx',
                mode: 0o600,
            });
            return {
                name: 'skills-usage.db' + file.suffix,
                bytes: bytes.length,
                sha256: sha(bytes),
            };
        });
        let migrations: NativePilotStateSnapshot['migrations'] = [];
        const tables: NativePilotStateSnapshot['tables'] = [];
        const schema: NativePilotStateDefinition[] = [];
        let status: NativePilotStateSnapshot['status'] = 'captured';
        let reason = 'read-only-copy-no-source-migration';
        let database: DatabaseSync | null = null;
        try {
            database = new DatabaseSync(join(queryRoot, 'skills-usage.db'), {
                readOnly: true,
                allowExtension: false,
            });
            database.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
            const definitions = database
                .prepare(
                    "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 65",
                )
                .all();
            if (definitions.length > 64) throw new Error('state_schema_bound');
            for (const definition of definitions) {
                const name = String(definition.name);
                if (
                    !/^[a-z][a-z0-9_]{0,79}$/.test(name) ||
                    typeof definition.sql !== 'string' ||
                    Buffer.byteLength(definition.sql) > 65_536
                )
                    throw new Error('state_unknown_table');
                schema.push({
                    type: String(definition.type),
                    name,
                    sql_sha256: sha(definition.sql),
                });
            }
            const supported = new NativePilotStateSchemaValidator();
            supported.schemaVersion(schema);
            migrations = database
                .prepare('SELECT version,checksum FROM usage_migrations ORDER BY version LIMIT 33')
                .all()
                .map((row) => ({ version: Number(row.version), checksum: String(row.checksum) }));
            supported.validate(migrations, schema);
            let rowCount = 0;
            for (const definition of definitions) {
                if (definition.type !== 'table') continue;
                const name = String(definition.name);
                const statement = database.prepare(`SELECT * FROM "${name}"`);
                statement.setReadBigInts(true);
                const rows: string[] = [];
                for (const row of statement.iterate()) {
                    if (++rowCount > 100_000) throw new Error('state_row_bound');
                    const payload = JSON.stringify(
                        Object.entries(row).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
                        (_key, value) =>
                            typeof value === 'bigint'
                                ? { sqlite_integer: value.toString() }
                                : value instanceof Uint8Array
                                  ? { sqlite_blob: Buffer.from(value).toString('base64') }
                                  : value,
                    );
                    if (Buffer.byteLength(payload) > 1_048_576) throw new Error('state_row_bytes');
                    rows.push(sha(payload));
                }
                rows.sort();
                tables.push({ name, sql_sha256: sha(String(definition.sql)), rows });
            }
        } catch {
            status = 'blocked';
            reason = 'source-schema-or-copy-query-unsupported';
        } finally {
            database?.close();
        }
        const after = this.sourceFiles();
        if (
            after.length !== original.length ||
            original.some(
                (before, index) =>
                    before.path !== after[index].path || !same(before.stat, after[index].stat),
            )
        )
            throw new Error('state_changed');
        for (const file of original) {
            const bytes = this.readStable(file.path, file.stat);
            if (
                sha(bytes) !==
                    files.find((entry) => entry.name === 'skills-usage.db' + file.suffix)?.sha256 ||
                !same(file.stat, lstatSync(file.path))
            )
                throw new Error('state_changed');
        }
        const value: NativePilotStateSnapshot = {
            schema_version: 2,
            exists: true,
            files,
            migrations,
            schema,
            tables,
            state_sha256: sha(JSON.stringify(files)),
            status,
            reason,
        };
        this.retain(label, value);
        return value;
    }

    private retain(label: string, value: NativePilotStateSnapshot) {
        const bytes = Buffer.from(JSON.stringify(value) + '\n');
        if (bytes.length > 8_388_608) throw new Error('state_snapshot_report_bound');
        writeFileSync(join(this.output, `${label}-state.json`), bytes, { flag: 'wx', mode: 0o600 });
        this.retained.set(
            label,
            [
                { path: `${label}-state.json`, bytes: bytes.length, sha256: sha(bytes) },
                ...value.files.map((file) => ({
                    ...file,
                    path: `${label}-sqlite-copy/${file.name}`,
                })),
            ].map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
        );
    }

    /** Relative to the supplied owned output directory. Rechecks report and original raw copy bytes. */
    artifacts(label: string): Array<{ path: string; bytes: number; sha256: string }> {
        const files = this.retained.get(label);
        if (!files) throw new Error('state_snapshot_not_retained');
        for (const file of files) {
            const path = join(this.output, file.path);
            if (realpathSync(path) !== path) throw new Error('state_snapshot_linked_artifact');
            const stat = lstatSync(path);
            if (
                !stat.isFile() ||
                stat.nlink !== 1 ||
                stat.size !== file.bytes ||
                sha(this.readStable(path, stat)) !== file.sha256
            )
                throw new Error('state_snapshot_artifact_changed');
        }
        return files.map((file) => ({ ...file }));
    }

    preserved(before: NativePilotStateSnapshot, after: NativePilotStateSnapshot): boolean {
        if (
            before.status !== 'captured' ||
            after.status !== 'captured' ||
            (before.exists && !after.exists)
        )
            return false;
        for (const definition of before.schema) {
            const current = after.schema.find((value) => value.name === definition.name);
            if (!current || JSON.stringify(current) !== JSON.stringify(definition)) return false;
        }
        for (const table of before.tables) {
            const current = after.tables.find((value) => value.name === table.name);
            if (!current || current.sql_sha256 !== table.sql_sha256) return false;
            const counts = new Map<string, number>();
            for (const row of current.rows) counts.set(row, (counts.get(row) ?? 0) + 1);
            for (const row of table.rows) {
                const count = counts.get(row) ?? 0;
                if (!count) return false;
                counts.set(row, count - 1);
            }
        }
        return true;
    }

    /** This gate is only for two snapshots around read-only MCP, not writer migration. */
    readOnlyPreservation(
        before: NativePilotStateSnapshot,
        after: NativePilotStateSnapshot,
    ): 'absence_preserved' | 'existing_unchanged' | 'blocked' {
        if (before.status !== 'captured' || after.status !== 'captured') return 'blocked';
        if (!before.exists && !after.exists) return 'absence_preserved';
        if (
            !before.exists ||
            !after.exists ||
            before.state_sha256 !== after.state_sha256 ||
            JSON.stringify(before.files) !== JSON.stringify(after.files) ||
            JSON.stringify(before.migrations) !== JSON.stringify(after.migrations) ||
            JSON.stringify(before.schema) !== JSON.stringify(after.schema) ||
            JSON.stringify(before.tables) !== JSON.stringify(after.tables)
        )
            return 'blocked';
        return 'existing_unchanged';
    }
}
