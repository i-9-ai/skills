// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillCatalogService } from '../../service/SkillCatalogService.ts';

export default class CatalogOverviewCommand extends Command {
    static description = 'Show a bounded overview of the installed collection as JSON.';
    static examples = ['<%= config.bin %> catalog overview --max-entries 10'];
    static flags = {
        'max-entries': Flags.integer({
            description: 'Maximum entries before the 4096-character context bound.',
            default: 24,
            min: 1,
            max: 24,
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(CatalogOverviewCommand);
        this.log(
            JSON.stringify(
                new SkillCatalogService().overview({ max_entries: flags['max-entries'] }),
            ),
        );
    }
}
