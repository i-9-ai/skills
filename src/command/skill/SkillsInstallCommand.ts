// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import { SkillInstallationCommandConfiguration } from '../../config/SkillInstallationCommandConfiguration.ts';
import { ManagedSkillInstallationService } from '../../service/ManagedSkillInstallationService.ts';

export default class SkillsInstallCommand extends Command {
    static description =
        'Preview or install the running bundled skill collection into an explicit owned scope.';
    static flags = SkillInstallationCommandConfiguration.flags;
    static examples = [
        '<%= config.bin %> skills install --global',
        '<%= config.bin %> skills install --project ./consumer --write',
    ];
    async run() {
        const { flags } = await this.parse(SkillsInstallCommand);
        const result = new ManagedSkillInstallationService().run('install', flags);
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
