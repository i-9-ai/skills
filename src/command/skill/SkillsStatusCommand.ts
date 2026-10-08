// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import { SkillInstallationCommandConfiguration } from '../../config/SkillInstallationCommandConfiguration.ts';
import { ManagedSkillInstallationService } from '../../service/ManagedSkillInstallationService.ts';

export default class SkillsStatusCommand extends Command {
    static description =
        'Inspect the owned installation, bundle differences, local conflicts and pending recovery without writing.';
    static flags = SkillInstallationCommandConfiguration.flags;
    static examples = ['<%= config.bin %> skills status --global'];
    async run() {
        const { flags } = await this.parse(SkillsStatusCommand);
        if (flags.write) this.error('Status never writes; omit --write.');
        this.log(JSON.stringify(new ManagedSkillInstallationService().run('status', flags)));
    }
}
