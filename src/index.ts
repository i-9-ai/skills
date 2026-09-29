// SPDX-License-Identifier: Apache-2.0
import { execute, settings } from '@oclif/core';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** Start the single CLI. Help and argument errors are owned by oclif. */
export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
    const manifest = createRequire(import.meta.url)('../package.json');
    const commands = import.meta.url.endsWith('.ts') ? './src/command' : './dist/command';
    settings.enableAutoTranspile = false;
    await execute({
        args,
        loadOptions: {
            root: fileURLToPath(new URL('../', import.meta.url)),
            pjson: { ...manifest, oclif: { ...manifest.oclif, commands } },
            devPlugins: false,
            userPlugins: false,
            jitPlugins: false,
        },
    });
}
