// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import { SkillInstallationCommandConfiguration } from '../../config/SkillInstallationCommandConfiguration.ts';
import { ManagedSkillInstallationService } from '../../service/ManagedSkillInstallationService.ts';

export default class SkillsUninstallCommand extends Command {
    static description =
        'Preview or withdraw only unchanged receipted packages while retaining their recovery preimages.';
    static flags = SkillInstallationCommandConfiguration.flags;
    static examples = [
        '<%= config.bin %> skills uninstall --global',
        '<%= config.bin %> skills uninstall --global --write',
    ];
    async run() {
        const { flags } = await this.parse(SkillsUninstallCommand);
        const result = new ManagedSkillInstallationService().run('uninstall', flags);
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
