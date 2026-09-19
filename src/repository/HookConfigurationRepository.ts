// SPDX-License-Identifier: Apache-2.0
import { constants, closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { strictJson } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';

/** Reads bounded regular hook configuration files without following links. */
export class HookConfigurationRepository {
    readHookConfiguration(filename: string): unknown {
        const descriptor = openSync(
            filename,
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );

        try {
            const info = fstatSync(descriptor);
            const limit = 1_048_576;
            if (!info.isFile() || info.nlink !== 1 || info.size > limit)
                throw new Error('Expected bounded regular hook configuration');

            const buffer = Buffer.alloc(limit + 1);
            let length = 0;

            while (length < buffer.length) {
                const count = readSync(descriptor, buffer, length, buffer.length - length, length);
                if (count === 0) break;
                length += count;
            }

            const after = fstatSync(descriptor);
            if (
                length > limit ||
                info.size !== after.size ||
                info.mtimeMs !== after.mtimeMs ||
                info.ctimeMs !== after.ctimeMs
            ) {
                throw new Error('Hook configuration changed during reading');
            }

            return strictJson(buffer.subarray(0, length));
        } finally {
            closeSync(descriptor);
        }
    }
}
