// SPDX-License-Identifier: Apache-2.0
import { DatabaseSync } from 'node:sqlite';
import { closeSync, constants, lstatSync, openSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { SkillReadMigration } from '../migration/SkillReadMigration.ts';

/** One dedicated evidence connection; never copies, resets or replaces its file. */
export class SkillEvidenceDatabaseRepository {
    readonly database: DatabaseSync;
    private closed = false;

    constructor(filename: string, { readOnly = false } = {}) {
        if (!isAbsolute(filename)) throw new Error('Database path must be absolute');
        if (realpathSync(dirname(filename)) !== dirname(filename))
            throw new Error('Database parent must be canonical');
        if (!readOnly) {
            try {
                closeSync(
                    openSync(
                        filename,
                        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
                        0o600,
                    ),
                );
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            }
        }
        const info = lstatSync(filename);
        if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
            throw new Error('Expected regular database file');
        this.database = new DatabaseSync(filename, { readOnly });
        try {
            this.database.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
            const migration = new SkillReadMigration();
            if (readOnly) migration.verifySkillReads(this.database);
            else migration.migrateSkillReads(this.database);
        } catch (error) {
            this.close();
            throw error;
        }
    }

    transaction<T>(operation: () => T): T {
        this.database.exec('BEGIN IMMEDIATE');
        try {
            const value = operation();
            this.database.exec('COMMIT');
            return value;
        } catch (error) {
            this.database.exec('ROLLBACK');
            throw error;
        }
    }

    snapshot<T>(operation: () => T): T {
        this.database.exec('BEGIN');
        try {
            const value = operation();
            this.database.exec('COMMIT');
            return value;
        } catch (error) {
            this.database.exec('ROLLBACK');
            throw error;
        }
    }

    close(): void {
        if (!this.closed) {
            this.closed = true;
            this.database.close();
        }
    }
}
