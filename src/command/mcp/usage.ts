// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { isAbsolute, resolve } from 'node:path';
import { SkillUsageMcpService } from '../../service/SkillUsageMcpService.ts';

export default class UsageMcpCommand extends Command {
    static examples = ['<%= config.bin %> mcp usage --db /absolute/local-data/skill-usage.db'];
    static description =
        'Start the bounded stdio MCP for explicit skill-read events in a caller-owned database.';

    static flags = {
        db: Flags.string({
            description: 'Absolute path to a caller-owned dedicated usage database.',
            required: true,
        }),
    };

    async run() {
        const { flags } = await this.parse(UsageMcpCommand);

        if (!isAbsolute(flags.db)) this.error('The usage database path must be absolute.');

        await new SkillUsageMcpService().runUsageMcp(resolve(flags.db));
    }
}
