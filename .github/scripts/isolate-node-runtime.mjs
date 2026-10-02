// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import {
    appendFileSync,
    chmodSync,
    constants,
    copyFileSync,
    lstatSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Retain the selected CI foundation without changing the shared tool cache. */
export class IsolatedNodeRuntime {
    retain(directory, source = process.execPath) {
        if (
            !isAbsolute(directory) ||
            /[\x00-\x1f\x7f]/u.test(directory) ||
            realpathSync(directory) !== directory
        ) {
            throw new Error('Select a canonical runner temporary directory.');
        }

        const selected = realpathSync(source);
        const info = lstatSync(selected);
        if (!info.isFile() || info.size > 160 * 1024 * 1024) {
            throw new Error('Select the bounded existing Node binary.');
        }
        const identity = this.digest(selected);

        const retained = mkdtempSync(join(directory, 'i9-node-'));
        chmodSync(retained, 0o700);
        const executable = join(retained, 'node');
        copyFileSync(selected, executable, constants.COPYFILE_EXCL);
        chmodSync(executable, 0o755);

        const copy = lstatSync(executable);
        if (
            !copy.isFile() ||
            copy.nlink !== 1 ||
            (copy.mode & 0o777) !== 0o755 ||
            this.digest(executable) !== identity ||
            this.digest(selected) !== identity
        ) {
            throw new Error('The retained Node foundation changed during preparation.');
        }

        return retained;
    }

    digest(file) {
        return createHash('sha256').update(readFileSync(file)).digest('hex');
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    const { RUNNER_TEMP: directory, GITHUB_PATH: pathFile } = process.env;
    if (!directory || !pathFile) throw new Error('Run this preparation inside GitHub Actions.');
    const retained = new IsolatedNodeRuntime().retain(directory);
    appendFileSync(pathFile, `${retained}\n`);
    console.log('Retained the selected Node binary in a private runner directory.');
}
