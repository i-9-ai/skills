// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { ProjectConfiguration } from '../../config/ProjectConfiguration.ts';
import { ReleaseVersionRepository } from '../../repository/ReleaseVersionRepository.ts';
import { ReleaseVersionService } from '../../service/ReleaseVersionService.ts';

export default class PrepareVersionCommand extends Command {
    static description =
        'Prepare Changesets version/changelog and aligned plugin metadata locally; never publish.';
    static flags = {
        project: Flags.string({
            required: true,
            description: 'Owned single-package repository root; writes release artifacts.',
        }),
    };
    static examples = ['<%= config.bin %> repo prepare-version --project .'];

    async run(): Promise<void> {
        const { flags } = await this.parse(PrepareVersionCommand);
        const root = new ProjectConfiguration({ root: flags.project }).root();
        this.log(
            JSON.stringify(new ReleaseVersionService(new ReleaseVersionRepository(root)).prepare()),
        );
    }
}
