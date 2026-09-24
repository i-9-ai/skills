// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join, resolve } from 'node:path';

/** Selects persistent plugin data without writing into the installed package. */
export class PluginDataConfiguration {
    private readonly environment: NodeJS.ProcessEnv;

    constructor(environment: NodeJS.ProcessEnv = process.env) {
        this.environment = environment;
    }

    usageDatabase(): string {
        const directory =
            this.environment.PLUGIN_DATA ??
            this.environment.CLAUDE_PLUGIN_DATA ??
            this.environment.COPILOT_PLUGIN_DATA;

        if (!directory || !isAbsolute(directory) || directory.includes('\0')) {
            throw new Error('A host-provided absolute plugin data directory is required.');
        }

        return join(resolve(directory), 'skill-usage.db');
    }
}
