// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { isAbsolute, resolve } from 'node:path';
import { SkillMcpService } from '../../service/SkillMcpService.ts';

export default class ServeMcpCommand extends Command {
    static examples = [
        '<%= config.bin %> mcp serve',
        '<%= config.bin %> mcp serve --db /absolute/local-data/skill-usage.db',
    ];
    static description =
        'Serve the installed catalog and optional explicit read metrics through one stdio MCP.';

    static flags = {
        db: Flags.string({
            description:
                'Absolute dedicated usage database; defaults to shared agent state. Queries never initialize storage.',
        }),
    };

    async run() {
        const { flags } = await this.parse(ServeMcpCommand);
        if (flags.db !== undefined && !isAbsolute(flags.db)) {
            this.error('The usage database path must be absolute.');
        }

        await new SkillMcpService({
            database: flags.db === undefined ? undefined : resolve(flags.db),
        }).serve();
    }
}
