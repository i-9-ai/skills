// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillOnboardingService } from '../../service/SkillOnboardingService.ts';

export default class SkillsOnboardingCommand extends Command {
    static description =
        'Read the installed versioned operational guide and complete synthetic examples; never run its commands automatically.';
    static examples = [
        '<%= config.bin %> skills onboarding',
        '<%= config.bin %> skills onboarding --section bump',
    ];
    static flags = {
        section: Flags.string({
            default: 'all',
            options: ['all', 'inspect', 'snapshot', 'audit', 'plan', 'evolve', 'verify', 'bump'],
            description: 'Select the complete guide or one operational stage.',
        }),
    };
    async run(): Promise<void> {
        const { flags } = await this.parse(SkillsOnboardingCommand);
        this.log(JSON.stringify(new SkillOnboardingService().guide({ section: flags.section })));
    }
}
