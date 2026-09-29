// SPDX-License-Identifier: Apache-2.0
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PluginDataConfiguration } from './PluginDataConfiguration.ts';
import type { CollectionSource } from '../repository/SkillDiscoveryRepository.ts';

export type PluginHookHost = 'codex' | 'claude';

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
        if (host !== 'codex' && host !== 'claude') throw new Error('Unsupported plugin hook host');
        this.host = host;
        this.environment = environment;
        this.pluginRoot = resolve(pluginRoot);
    }

    static hostArgument(arguments_: string[]): PluginHookHost {
        if (arguments_.length !== 2 || arguments_[0] !== '--host') {
            throw new Error('Select one plugin hook host');
        }
        const host = arguments_[1];
        if (host !== 'codex' && host !== 'claude') throw new Error('Unsupported plugin hook host');
        return host;
    }

    sources(callerRoot: string): CollectionSource[] {
        const home = this.environment.HOME ?? this.environment.USERPROFILE ?? homedir();
        if (!isAbsolute(home) || home.includes('\0') || !home.isWellFormed()) {
            throw new Error('Global skill collection requires an absolute home directory');
        }

        return [
            { directory: join(callerRoot, '.agents', 'skills'), label: 'project' },
            { directory: join(home, '.agents', 'skills'), label: 'global' },
            { directory: join(this.pluginRoot, '.agents', 'skills'), label: 'plugin' },
        ];
    }

    usageDatabase(): string {
        return new PluginDataConfiguration(this.environment).usageDatabase(this.host);
    }
}
