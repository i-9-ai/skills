// SPDX-License-Identifier: Apache-2.0
import { SkillMcpService } from '../service/SkillMcpService.ts';

/** Dependency-free protocol entrypoint for an installed local plugin. */
export class PluginMcpServer {
    async run(): Promise<void> {
        const [flag, host, ...extra] = process.argv.slice(2);
        if (
            flag !== '--host' ||
            !['codex', 'claude', 'copilot'].includes(host) ||
            extra.length > 0
        ) {
            throw new Error('Select one supported plugin host');
        }
        await new SkillMcpService({ host: host as 'codex' | 'claude' | 'copilot' }).serve();
    }
}

try {
    await new PluginMcpServer().run();
} catch {
    process.stderr.write('I-9 Skills MCP unavailable; verify the runtime and host selector.\n');
    process.exitCode = 1;
}
