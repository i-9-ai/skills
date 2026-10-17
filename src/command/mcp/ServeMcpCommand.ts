// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { isAbsolute, resolve } from 'node:path';
import { SkillMcpService } from '../../service/SkillMcpService.ts';

export default class ServeMcpCommand extends Command {
    static examples = [
        '<%= config.bin %> mcp serve',
        '<%= config.bin %> mcp serve --db /absolute/local-data/skill-usage.db',
        '<%= config.bin %> mcp serve --panel-collection /absolute/pilot/skills --panel-state /absolute/pilot/proposals',
        '<%= config.bin %> mcp serve --panel-collection /absolute/pilot/skills --panel-state /absolute/pilot/proposals --panel-global-collection /absolute/global/skills',
        '<%= config.bin %> mcp serve --panel-collection /absolute/pilot/skills --panel-state /absolute/pilot/proposals --panel-global-collection /absolute/global/skills --panel-global-write',
    ];
    static description =
        'Serve the installed catalog and optional explicit read metrics through one stdio MCP.';

    static flags = {
        'panel-global-collection': Flags.string({
            description:
                'Additional global skill collection, read only by default; requires both panel paths. No automatic home discovery.',
        }),
        'panel-global-write': Flags.boolean({
            description:
                'Allow eligible ordinary global packages to retain proposals and accept exact approved apply/recovery; requires --panel-global-collection and both panel paths. Never approves a change.',
            default: false,
        }),
        'panel-collection': Flags.string({
            description:
                'Explicit owned collection for the optional local skill-change panel; requires --panel-state.',
        }),
        'panel-state': Flags.string({
            description:
                'Private proposal/recovery directory outside the collection; its parent must exist. Requires --panel-collection.',
        }),
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
        if ((flags['panel-collection'] === undefined) !== (flags['panel-state'] === undefined))
            this.error('Select both --panel-collection and --panel-state.');
        if (
            flags['panel-global-collection'] !== undefined &&
            flags['panel-collection'] === undefined
        )
            this.error('Global panel discovery requires both panel paths.');
        if (flags['panel-global-write'] && flags['panel-global-collection'] === undefined)
            this.error(
                'Global panel evolution requires --panel-global-collection and both panel paths.',
            );

        await new SkillMcpService({
            database: flags.db === undefined ? undefined : resolve(flags.db),
            panel:
                flags['panel-collection'] === undefined
                    ? undefined
                    : {
                          collection: flags['panel-collection'],
                          state: flags['panel-state']!,
                          globalCollection: flags['panel-global-collection'],
                          globalWrite: flags['panel-global-write'],
                      },
        }).serve();
    }
}
