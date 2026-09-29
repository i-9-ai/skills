// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillCatalogService } from '../../service/SkillCatalogService.ts';

export default class CatalogReadCommand extends Command {
    static description =
        'Read a bundled SKILL.md or Markdown reference as JSON with its content digest.';
    static examples = [
        '<%= config.bin %> catalog read --skill skill-authoring',
        '<%= config.bin %> catalog read --skill skill-authoring --resource references/authoring.md',
    ];
    static flags = {
        skill: Flags.string({ description: 'Exact cataloged skill name.', required: true }),
        resource: Flags.string({
            description: 'SKILL.md or a Markdown path below references/.',
            default: 'SKILL.md',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(CatalogReadCommand);
        this.log(JSON.stringify(new SkillCatalogService().read(flags)));
    }
}
