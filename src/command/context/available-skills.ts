// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ProjectConfiguration } from '../../config/ProjectConfiguration.ts';
import { AvailableSkillsService } from '../../service/AvailableSkillsService.ts';

export default class AvailableSkillsCommand extends Command {
    static description =
        'Discover installed project and global skills without activating or installing them.';

    static examples = [
        '<%= config.bin %> context available-skills',
        '<%= config.bin %> context available-skills --project ./example-project --no-global',
    ];

    static flags = {
        project: Flags.string({ description: 'Project root containing .agents/skills.' }),
        global: Flags.boolean({
            description: 'Include the global .agents/skills collection.',
            default: true,
            allowNo: true,
        }),
        'global-root': Flags.string({
            description: 'Explicit global skill directory; replaces the home default.',
        }),
        'max-entries': Flags.integer({
            description: 'Maximum displayed skills; omissions are disclosed.',
            default: 20,
            min: 1,
            max: 100,
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(AvailableSkillsCommand);
        this.log(this.renderContext(flags).trimEnd());
    }

    protected renderContext(flags: {
        project?: string;
        global: boolean;
        'global-root'?: string;
        'max-entries': number;
    }): string {
        const globalRoot = flags.global
            ? (flags['global-root'] ?? join(homedir(), '.agents', 'skills'))
            : undefined;

        return new AvailableSkillsService().renderAvailableSkills({
            project: new ProjectConfiguration({ root: flags.project }),
            globalRoot,
            maxEntries: flags['max-entries'],
        });
    }
}
