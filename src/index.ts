// SPDX-License-Identifier: Apache-2.0
import { execute, settings } from '@oclif/core';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CommandConfiguration } from './config/CommandConfiguration.ts';

/** Framework adapter for oclif's explicit discovery strategy. */
export const COMMANDS = CommandConfiguration.commands;

/** Start the single CLI. Help and argument errors are owned by oclif. */
export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
    const manifest = createRequire(import.meta.url)('../package.json');
    const commands = { ...manifest.oclif.commands, target: fileURLToPath(import.meta.url) };
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
