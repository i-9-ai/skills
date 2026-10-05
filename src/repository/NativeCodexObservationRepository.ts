// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import {
    constants,
    closeSync,
    fstatSync,
    lstatSync,
    mkdirSync,
    openSync,
    readFileSync,
    realpathSync,
    writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { CodexJsonlCodec } from '../transport/CodexJsonlCodec.ts';

/** Bounded control-file reads and exclusive private evidence writes; no ambient effects. */
export class NativeCodexObservationRepository {
    createOutput(parent: string, name: string): string {
        if (
            realpathSync(parent) !== resolve(parent) ||
            !lstatSync(parent).isDirectory() ||
            !/^[a-zA-Z0-9-]{1,128}$/.test(name)
        )
            throw new Error('dispatcher_output_parent');
        const root = join(parent, name);
        mkdirSync(root, { mode: 0o700 });
        return root;
    }
    json(filename: string): any {
        if (resolve(filename) !== filename || realpathSync(filename) !== filename)
            throw new Error('dispatcher_input_path');
        const before = lstatSync(filename);
        if (!before.isFile() || before.nlink !== 1 || before.size > CodexJsonlCodec.frameBytes)
            throw new Error('dispatcher_input_file');
        const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            const initial = fstatSync(fd),
                bytes = readFileSync(fd),
                after = fstatSync(fd),
                current = lstatSync(filename);
            if (
                initial.ino !== before.ino ||
                initial.dev !== before.dev ||
                bytes.length !== initial.size ||
                initial.size !== after.size ||
                initial.mtimeMs !== after.mtimeMs ||
                initial.ctimeMs !== after.ctimeMs ||
                current.ino !== after.ino ||
                current.dev !== after.dev ||
                current.nlink !== 1 ||
                current.mtimeMs !== after.mtimeMs ||
                current.ctimeMs !== after.ctimeMs
            )
                throw new Error('dispatcher_input_changed');
            return CodexJsonlCodec.json(bytes);
        } finally {
            closeSync(fd);
        }
    }
    retain(
        root: string,
        name: string,
        bytes: Uint8Array,
    ): { path: string; sha256: string; bytes: number } {
        if (
            !/^[a-z]+(?:-[a-z]+)?\.(?:json|jsonl|sse|log)$/.test(name) ||
            bytes.length > 8_388_608 ||
            realpathSync(root) !== root ||
            !lstatSync(root).isDirectory()
        )
            throw new Error('dispatcher_artifact');
        const filename = join(root, name);
        writeFileSync(filename, bytes, { flag: 'wx', mode: 0o600 });
        const stat = lstatSync(filename),
            retained = readFileSync(filename);
        if (!stat.isFile() || stat.nlink !== 1 || !Buffer.from(bytes).equals(retained))
            throw new Error('dispatcher_artifact_changed');
        return {
            path: name,
            sha256: createHash('sha256').update(retained).digest('hex'),
            bytes: retained.length,
        };
    }
}
