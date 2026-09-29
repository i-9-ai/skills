// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillCatalogService } from '../../service/SkillCatalogService.ts';

export default class CatalogSearchCommand extends Command {
    static description =
        'Search bundled skill metadata as JSON without reading caller collections.';
    static examples = [
        '<%= config.bin %> catalog search --query routing',
        '<%= config.bin %> catalog search --limit 10 --offset 10',
    ];
    static flags = {
        query: Flags.string({
            description: 'Literal name, description or tag query; at most 200 characters.',
            default: '',
        }),
        limit: Flags.integer({
            description: 'Maximum returned matches.',
            default: 20,
            min: 1,
            max: 50,
        }),
        offset: Flags.integer({
            description: 'Number of matching entries to skip.',
            default: 0,
            min: 0,
            max: 256,
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(CatalogSearchCommand);
        this.log(JSON.stringify(new SkillCatalogService().search(flags)));
    }
}
