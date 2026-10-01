// SPDX-License-Identifier: Apache-2.0
import { join, resolve } from 'node:path';
import { AgentStateConfiguration } from './AgentStateConfiguration.ts';
import { fileURLToPath } from 'node:url';
import { PluginDataConfiguration } from './PluginDataConfiguration.ts';
import type { CollectionSource } from '../repository/SkillDiscoveryRepository.ts';

export type PluginHookHost = 'codex' | 'claude' | 'gemini' | 'copilot';

/** Resolves installed resources separately from caller and host-owned data. */
export class PluginHookConfiguration {
    readonly host: PluginHookHost;
    readonly pluginRoot: string;
    readonly maxEntries = 24;
    readonly maxContextCharacters = 4096;
    readonly maxOutputBytes = 16_384;
    private readonly environment: NodeJS.ProcessEnv;

    constructor(
        host: PluginHookHost,
        environment: NodeJS.ProcessEnv = process.env,
        pluginRoot = fileURLToPath(new URL('../../', import.meta.url)),
    ) {
        if (!['codex', 'claude', 'gemini', 'copilot'].includes(host))
            throw new Error('Unsupported plugin hook host');
        this.host = host;
        this.environment = environment;
        this.pluginRoot = resolve(pluginRoot);
    }

    static hostArgument(arguments_: string[]): PluginHookHost {
        if (![2, 4].includes(arguments_.length) || arguments_[0] !== '--host') {
            throw new Error('Select one plugin hook host');
        }
        const host = arguments_[1];
        if (!host || !['codex', 'claude', 'gemini', 'copilot'].includes(host))
            throw new Error('Unsupported plugin hook host');
        if (
            arguments_.length === 4 &&
            (host !== 'copilot' ||
                arguments_[2] !== '--event' ||
                !['sessionStart', 'preToolUse', 'postToolUse'].includes(arguments_[3]!))
        )
            throw new Error('Unsupported native hook event selector');
        return host as PluginHookHost;
    }

    sources(callerRoot: string): CollectionSource[] {
        return [
            { directory: join(callerRoot, '.agents', 'skills'), label: 'project' },
            { directory: new AgentStateConfiguration(this.environment).skills(), label: 'global' },
            { directory: join(this.pluginRoot, '.agents', 'skills'), label: 'plugin' },
        ];
    }

    usageDatabase(): string {
        return new PluginDataConfiguration(this.environment).usageDatabase(this.host);
    }
}
