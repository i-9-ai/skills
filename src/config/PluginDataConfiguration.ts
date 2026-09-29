// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join, resolve } from 'node:path';

/** Selects persistent plugin data without writing into the installed package. */
export class PluginDataConfiguration {
    private readonly environment: NodeJS.ProcessEnv;

    constructor(environment: NodeJS.ProcessEnv = process.env) {
        this.environment = environment;
    }

    usageDatabase(host?: 'codex' | 'claude' | 'copilot'): string {
        const directory = this.dataDirectory(host);

        if (!directory || !isAbsolute(directory) || directory.includes('\0')) {
            throw new Error('A host-provided absolute plugin data directory is required.');
        }

        return join(resolve(directory), 'skill-usage.db');
    }

    private dataDirectory(host?: 'codex' | 'claude' | 'copilot'): string | undefined {
        if (host === 'codex') return this.environment.PLUGIN_DATA;
        if (host === 'claude') return this.environment.CLAUDE_PLUGIN_DATA;
        if (host === 'copilot') return this.environment.COPILOT_PLUGIN_DATA;
        if (host !== undefined) throw new Error('Unsupported plugin data host');
        return this.environment.PLUGIN_DATA ?? this.environment.CLAUDE_PLUGIN_DATA;
    }
}
