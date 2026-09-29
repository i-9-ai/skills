// SPDX-License-Identifier: Apache-2.0
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Selects bundled resources independently of the caller's workspace or home. */
export class InstalledCollectionConfiguration {
    private readonly directory: string;

    constructor(directory = fileURLToPath(new URL('../../', import.meta.url))) {
        if (!directory.trim() || !directory.isWellFormed() || directory.includes('\0')) {
            throw new Error('Installed collection requires a valid directory');
        }
        this.directory = resolve(directory);
    }

    root(): string {
        return this.directory;
    }
}
