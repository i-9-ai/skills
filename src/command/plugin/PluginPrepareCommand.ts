// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { ProjectConfiguration } from '../../config/ProjectConfiguration.ts';
import { PluginPreparationService } from '../../service/PluginPreparationService.ts';
import { SkillPanelConfiguration } from '../../config/SkillPanelConfiguration.ts';

export default class PluginPrepareCommand extends Command {
    static description =
        'Preview or create a new local plugin artifact without installing or registering it.';
    static flags = {
        root: Flags.string({
            description: 'I-9 Skills source root; defaults to the selected project/package.',
        }),
        output: Flags.string({
            required: true,
            description: 'New i9-skills folder under an existing neutral staging directory.',
        }),
        write: Flags.boolean({
            default: false,
            description: 'Create the artifact; preview without writes is the default.',
        }),
        'panel-collection': Flags.string({
            description: 'Explicit editable local skills directory; requires panel-state.',
        }),
        'panel-state': Flags.string({
            description:
                'Explicit retained proposal directory outside skill discovery; requires panel-collection.',
        }),
        'panel-global-collection': Flags.string({
            description: 'Optional absolute global skills directory; read only by default.',
        }),
        'panel-global-write': Flags.boolean({
            default: false,
            description:
                'Enable eligible global proposals and exact approved writes; never approves a change.',
        }),
    };
    static examples = [
        '<%= config.bin %> plugin prepare --output .work/plugin-preview/i9-skills',
        '<%= config.bin %> plugin prepare --output .work/plugin-preview/i9-skills --write',
        '<%= config.bin %> plugin prepare --output .work/panel-preview/i9-skills --panel-collection /absolute/pilot/skills --panel-state /absolute/pilot/proposals --write',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(PluginPrepareCommand);
        const panelSelected =
            flags['panel-collection'] !== undefined ||
            flags['panel-state'] !== undefined ||
            flags['panel-global-collection'] !== undefined ||
            flags['panel-global-write'];
        if (panelSelected && (!flags['panel-collection'] || !flags['panel-state']))
            this.error('Panel preparation requires both panel-collection and panel-state.');
        const panel = panelSelected
            ? new SkillPanelConfiguration(
                  flags['panel-collection']!,
                  flags['panel-state']!,
                  flags['panel-global-collection'],
                  flags['panel-global-write'],
              )
            : undefined;
        const result = new PluginPreparationService().prepare(
            new ProjectConfiguration({ root: flags.root }),
            flags.output,
            flags.write,
            panel,
        );
        this.log(JSON.stringify(result));
    }
}
