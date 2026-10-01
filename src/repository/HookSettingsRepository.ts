// SPDX-License-Identifier: Apache-2.0
import { createHash, randomUUID } from 'node:crypto';
import {
    closeSync,
    constants,
    existsSync,
    fchmodSync,
    fstatSync,
    fsyncSync,
    lstatSync,
    openSync,
    readFileSync,
    realpathSync,
    renameSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

export type HookSettingsSnapshot = {
    file: string;
    digest: string | null;
    bytes: Buffer | null;
    value: Record<string, any>;
    mode: number;
};

/** Reads bounded selected settings and replaces only an unchanged regular file. */
export class HookSettingsRepository {
    read(input: string): HookSettingsSnapshot {
        if (!isAbsolute(input) || /[\r\n\0]/.test(input)) {
            throw new Error('Select an absolute settings filename.');
        }
        const file = resolve(input);
        const parent = dirname(file);
        if (realpathSync(parent) !== parent || !lstatSync(parent).isDirectory()) {
            throw new Error('Settings parent must be an existing canonical directory.');
        }
        if (!existsSync(file)) {
            // existsSync also hides dangling links; lstat must reject those.
            try {
                lstatSync(file);
                throw new Error('Settings cannot be a dangling symbolic link.');
            } catch (error: any) {
                if (error.code !== 'ENOENT') throw error;
            }
            return { file, digest: null, bytes: null, value: {}, mode: 0o600 };
        }
        const info = lstatSync(file);
        if (!info.isFile() || info.nlink !== 1 || info.size > 1024 * 1024) {
            throw new Error('Settings must be one bounded regular file without links.');
        }
        const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
        let bytes: Buffer;
        try {
            const opened = fstatSync(descriptor);
            if (opened.dev !== info.dev || opened.ino !== info.ino || opened.nlink !== 1) {
                throw new Error('Settings changed while being opened.');
            }
            bytes = readFileSync(descriptor);
        } finally {
            closeSync(descriptor);
        }
        if (bytes.length > 1024 * 1024) throw new Error('Settings exceed 1 MiB.');
        const value = JSON.parse(bytes.toString('utf8'));
        if (!value || Array.isArray(value) || typeof value !== 'object') {
            throw new Error('Settings must contain a JSON object.');
        }
        return { file, digest: this.digest(bytes), bytes, value, mode: info.mode & 0o777 };
    }

    replace(snapshot: HookSettingsSnapshot, value: Record<string, any>): HookSettingsSnapshot {
        const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
        return this.replaceBytes(snapshot, bytes);
    }

    restore(snapshot: HookSettingsSnapshot, previous: HookSettingsSnapshot): void {
        if (previous.bytes) {
            this.replaceBytes(snapshot, previous.bytes);
            return;
        }
        this.assertUnchanged(snapshot);
        unlinkSync(snapshot.file);
    }

    private replaceBytes(snapshot: HookSettingsSnapshot, bytes: Buffer): HookSettingsSnapshot {
        if (bytes.length > 1024 * 1024) throw new Error('Settings exceed 1 MiB.');
        this.assertUnchanged(snapshot);
        const temporary = snapshot.file + '.i9-' + randomUUID() + '.tmp';
        const descriptor = openSync(temporary, 'wx', snapshot.mode);
        try {
            try {
                writeFileSync(descriptor, bytes);
                fchmodSync(descriptor, snapshot.mode);
                fsyncSync(descriptor);
            } finally {
                closeSync(descriptor);
            }
            this.assertUnchanged(snapshot);
            renameSync(temporary, snapshot.file);
        } finally {
            if (existsSync(temporary)) unlinkSync(temporary);
        }
        return this.read(snapshot.file);
    }

    private assertUnchanged(snapshot: HookSettingsSnapshot): void {
        if (this.read(snapshot.file).digest !== snapshot.digest) {
            throw new Error('Settings changed concurrently; nothing was replaced.');
        }
    }

    private digest(bytes: Buffer): string {
        return createHash('sha256').update(bytes).digest('hex');
    }
}
