// SPDX-License-Identifier: Apache-2.0
import { PluginDataConfiguration } from '../config/PluginDataConfiguration.ts';
import { SkillUsageMcpService } from '../service/SkillUsageMcpService.ts';

/** Dependency-free protocol entrypoint for an installed local plugin. */
export class PluginUsageMcpServer {
    async run(): Promise<void> {
        const database = new PluginDataConfiguration().usageDatabase();
        await new SkillUsageMcpService().runUsageMcp(database);
    }
}

try {
    await new PluginUsageMcpServer().run();
} catch (error) {
    process.stderr.write(`Skill usage MCP startup failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
}
