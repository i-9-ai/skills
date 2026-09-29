// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { ProjectConfiguration } from '../../config/ProjectConfiguration.ts';
import { PluginPreparationService } from '../../service/PluginPreparationService.ts';

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
    };
    static examples = [
        '<%= config.bin %> plugin prepare --output .work/plugin-preview/i9-skills',
        '<%= config.bin %> plugin prepare --output .work/plugin-preview/i9-skills --write',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(PluginPrepareCommand);
        const result = new PluginPreparationService().prepare(
            new ProjectConfiguration({ root: flags.root }),
            flags.output,
            flags.write,
        );
        this.log(JSON.stringify(result));
    }
}
