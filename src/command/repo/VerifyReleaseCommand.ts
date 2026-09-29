// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { ProjectConfiguration } from '../../config/ProjectConfiguration.ts';
import { ReleaseVersionRepository } from '../../repository/ReleaseVersionRepository.ts';
import { ReleaseVersionService } from '../../service/ReleaseVersionService.ts';

export default class VerifyReleaseCommand extends Command {
    static description =
        'Check package/plugin version alignment; with --base, verify an exclusive prepared-release diff.';
    static flags = {
        project: Flags.string({
            required: true,
            description: 'Single-package repository root; reads only.',
        }),
        base: Flags.string({
            description:
                'Full base commit SHA; recompute its Changesets intent in a disposable directory.',
        }),
    };
    static examples = ['<%= config.bin %> repo verify-release --project .'];

    async run(): Promise<void> {
        const { flags } = await this.parse(VerifyReleaseCommand);
        const root = new ProjectConfiguration({ root: flags.project }).root();
        this.log(
            JSON.stringify(
                new ReleaseVersionService(new ReleaseVersionRepository(root)).verify(flags.base),
            ),
        );
    }
}
