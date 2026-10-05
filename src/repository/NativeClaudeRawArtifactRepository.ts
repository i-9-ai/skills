// SPDX-License-Identifier: Apache-2.0
import {
    constants,
    closeSync,
    fstatSync,
    lstatSync,
    mkdirSync,
    openSync,
    readFileSync,
    readSync,
    realpathSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Stats } from 'node:fs';
import { pilotDigest } from './NativePilotInventoryRepository.ts';

export interface NativeClaudeRawArtifact {
    path: string;
    sha256: string;
    bytes: number;
}
const stable = (a: Stats, b: Stats) =>
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs;

/** Exact raw bytes stay private. Exclusive retention cannot overwrite an earlier capture. */
export class NativeClaudeRawArtifactRepository {
    directory(path: string): string {
        if (resolve(path) !== path || realpathSync(path) !== path || !lstatSync(path).isDirectory())
            throw new Error('raw_directory');
        return path;
    }

    read(path: string, limit: number): Buffer {
        this.directory(dirname(path));
        const before = lstatSync(path);
        if (!before.isFile() || before.nlink !== 1 || before.size > limit)
            throw new Error('raw_file');
        const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            const initial = fstatSync(fd);
            if (!stable(before, initial)) throw new Error('raw_file_changed');
            const chunks: Buffer[] = [];
            let count = 0;
            for (;;) {
                const chunk = Buffer.alloc(Math.min(65_536, limit + 1 - count));
                const consumed = readSync(fd, chunk);
                if (!consumed) break;
                count += consumed;
                if (count > limit) throw new Error('raw_file_grew');
                chunks.push(chunk.subarray(0, consumed));
            }
            const bytes = Buffer.concat(chunks, count);
            if (
                bytes.length !== before.size ||
                bytes.length > limit ||
                !stable(initial, fstatSync(fd)) ||
                !stable(initial, lstatSync(path))
            )
                throw new Error('raw_file_changed');
            return bytes;
        } finally {
            closeSync(fd);
        }
    }

    json(path: string): unknown {
        const bytes = this.read(path, 1_048_576);
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    }

    absent(path: string): void {
        this.directory(dirname(path));
        try {
            lstatSync(path);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
            throw error;
        }
        throw new Error('raw_diagnostic_preexisting');
    }

    create(parent: string, name: string): string {
        this.directory(parent);
        if (!/^[a-z0-9-]{1,128}$/.test(name)) throw new Error('raw_output_name');
        const root = join(parent, name);
        mkdirSync(root, { mode: 0o700 });
        return root;
    }

    retain(root: string, name: string, content: Uint8Array): NativeClaudeRawArtifact {
        this.directory(root);
        if (
            !/^(?:[0-9]{2}-)?[a-z-]+\.(?:json|stdout|stderr|log)$/.test(name) ||
            content.length > 1_048_576
        )
            throw new Error('raw_artifact');
        const path = join(root, name);
        writeFileSync(path, content, { flag: 'wx', mode: 0o600 });
        const actual = this.read(path, 1_048_576);
        if (!Buffer.from(content).equals(actual)) throw new Error('raw_artifact_changed');
        return { path: name, sha256: pilotDigest(actual), bytes: actual.length };
    }
}
