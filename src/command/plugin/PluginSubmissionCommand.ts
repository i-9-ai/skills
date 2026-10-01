// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { ProjectConfiguration } from '../../config/ProjectConfiguration.ts';
import { PluginSubmissionService } from '../../service/PluginSubmissionService.ts';

export default class PluginSubmissionCommand extends Command {
    static description =
        'Preview or prepare a skills-only plugin folder and ZIP for manual public submission.';
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
            description:
                'Create the folder, sibling ZIP and integrity summary; default is preview.',
        }),
    };
    static examples = [
        '<%= config.bin %> plugin submission --output .work/public-candidate/i9-skills',
        '<%= config.bin %> plugin submission --output .work/public-candidate/i9-skills --write',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(PluginSubmissionCommand);
        this.log(
            JSON.stringify(
                new PluginSubmissionService().prepare(
                    new ProjectConfiguration({ root: flags.root }),
                    flags.output,
                    flags.write,
                ),
            ),
        );
    }
}
