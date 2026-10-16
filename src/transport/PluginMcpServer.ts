// SPDX-License-Identifier: Apache-2.0
import { SkillMcpService } from '../service/SkillMcpService.ts';

/** Dependency-free protocol entrypoint for an installed local plugin. */
export class PluginMcpServer {
    async run(): Promise<void> {
        const [flag, host, ...extra] = process.argv.slice(2);
        const panel =
            (extra.length === 4 ||
                (extra.length === 6 && extra[4] === '--panel-global-collection')) &&
            extra[0] === '--panel-collection' &&
            extra[2] === '--panel-state'
                ? { collection: extra[1], state: extra[3], globalCollection: extra[5] }
                : undefined;
        if (
            flag !== '--host' ||
            !['codex', 'claude', 'copilot'].includes(host) ||
            (extra.length > 0 && panel === undefined)
        ) {
            throw new Error('Select one supported plugin host');
        }
        await new SkillMcpService({ host: host as 'codex' | 'claude' | 'copilot', panel }).serve();
    }
}

try {
    await new PluginMcpServer().run();
} catch {
    process.stderr.write('I-9 Skills MCP unavailable; verify the runtime and host selector.\n');
    process.exitCode = 1;
}
