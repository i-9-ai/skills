// SPDX-License-Identifier: Apache-2.0
import { AgentStateConfiguration } from './AgentStateConfiguration.ts';

/** Names shared usage state; native plugin-data variables never choose telemetry storage. */
export class PluginDataConfiguration {
    private readonly environment: NodeJS.ProcessEnv;

    constructor(environment: NodeJS.ProcessEnv = process.env) {
        this.environment = environment;
    }

    usageDatabase(host?: 'codex' | 'claude' | 'copilot' | 'gemini'): string {
        if (host !== undefined && !['codex', 'claude', 'copilot', 'gemini'].includes(host)) {
            throw new Error('Unsupported plugin data host');
        }
        if (this.environment.I9_SKILLS_USAGE_DB !== undefined) {
            return AgentStateConfiguration.absolute(this.environment.I9_SKILLS_USAGE_DB);
        }
        return new AgentStateConfiguration(this.environment).usageDatabase();
    }
}
