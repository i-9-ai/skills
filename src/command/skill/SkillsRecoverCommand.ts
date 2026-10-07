// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import { SkillInstallationCommandConfiguration } from '../../config/SkillInstallationCommandConfiguration.ts';
import { ManagedSkillInstallationService } from '../../service/ManagedSkillInstallationService.ts';

export default class SkillsRecoverCommand extends Command {
    static description =
        'Preview or restore a stopped transaction from verified preimages; consumer edits stop recovery.';
    static flags = SkillInstallationCommandConfiguration.flags;
    static examples = ['<%= config.bin %> skills recover --project ./consumer --write'];
    async run() {
        const { flags } = await this.parse(SkillsRecoverCommand);
        const result = new ManagedSkillInstallationService().run('recover', flags);
        this.log(JSON.stringify(result));
        if (
            flags.write &&
            'status' in result &&
            ['select-host', 'select-strategy', 'manual-required', 'unmanaged'].includes(
                result.status ?? '',
            )
        )
            this.exit(1);
    }
}
