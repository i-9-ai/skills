// SPDX-License-Identifier: Apache-2.0
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import type { Readable } from 'node:stream';
import { strictJson } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';

/** Reads one small event without following links or retaining input content. */
export class TelemetryInputRepository {
    async read(filename: string, input: Readable = process.stdin): Promise<unknown> {
        const limit = 8192;
        if (filename === '-') {
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of input) {
                const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                size += bytes.length;
                if (size > limit) throw new Error('Telemetry input exceeds its size limit');
                chunks.push(bytes);
            }
            return this.parse(Buffer.concat(chunks));
        }
        const fd = openSync(
            filename,
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        try {
            const before = fstatSync(fd);
            if (!before.isFile() || before.nlink !== 1 || before.size > limit) {
                throw new Error('Telemetry input must be a bounded regular non-linked file');
            }
            const bytes = Buffer.alloc(limit + 1);
            let length = 0;
            while (length < bytes.length) {
                const count = readSync(fd, bytes, length, bytes.length - length, null);
                if (!count) break;
                length += count;
            }
            const after = fstatSync(fd);
            if (
                length > limit ||
                before.size !== after.size ||
                before.mtimeMs !== after.mtimeMs ||
                before.ctimeMs !== after.ctimeMs
            ) {
                throw new Error('Telemetry input changed or exceeded its limit');
            }
            return this.parse(bytes.subarray(0, length));
        } finally {
            closeSync(fd);
        }
    }

    private parse(bytes: Buffer): unknown {
        try {
            return strictJson(bytes);
        } catch {
            throw new Error('Expected one UTF-8 JSON telemetry object');
        }
    }
}
