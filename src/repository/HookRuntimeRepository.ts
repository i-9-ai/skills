// SPDX-License-Identifier: Apache-2.0
import { accessSync, constants, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';

/** Inspects a caller-selected local executable without running or installing it. */
export class HookRuntimeRepository {
    executable(filename: string): string {
        if (
            !isAbsolute(filename) ||
            filename.length > 4096 ||
            /[\x00-\x1f\x7f]/.test(filename) ||
            !filename.isWellFormed()
        ) {
            throw new Error('Select a bounded absolute installed CLI executable.');
        }
        const canonical = realpathSync(filename);
        if (!lstatSync(canonical).isFile()) {
            throw new Error('Installed CLI executable must be a regular file.');
        }
        accessSync(canonical, constants.X_OK);
        return canonical;
    }
}
