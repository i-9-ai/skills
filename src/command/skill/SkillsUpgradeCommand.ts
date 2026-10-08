// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import { SkillInstallationCommandConfiguration } from '../../config/SkillInstallationCommandConfiguration.ts';
import { ManagedSkillInstallationService } from '../../service/ManagedSkillInstallationService.ts';

export default class SkillsUpgradeCommand extends Command {
    static description =
        'Preview or reconcile an owned installation with the running bundle, preserving local conflicts.';
    static flags = SkillInstallationCommandConfiguration.flags;
    static examples = [
        '<%= config.bin %> skills upgrade --global',
        '<%= config.bin %> skills upgrade --global --write',
    ];
    async run() {
        const { flags } = await this.parse(SkillsUpgradeCommand);
        const result = new ManagedSkillInstallationService().run('upgrade', flags);
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
