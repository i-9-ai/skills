// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import { Flags } from '@oclif/core';
import { ProjectConfiguration } from '../../config/ProjectConfiguration.ts';
import { CollectionValidationService } from '../../service/CollectionValidationService.ts';

export default class RepositoryValidateCommand extends Command {
    static flags = {
        project: Flags.string({ description: 'Collection repository root.', required: true }),
    };
    static description =
        'Validate the repository collection without running the external official validator.';
    static examples = ['<%= config.bin %> repo validate --project ./skills-collection'];

    async run() {
        const { flags } = await this.parse(RepositoryValidateCommand);
        const result = new CollectionValidationService().validateRepository(
            new ProjectConfiguration({ root: flags.project }).root(),
        );

        this.log(JSON.stringify(result));
        this.log(
            'Collection checks passed; official CI validation and behavioral evaluation remain separate.',
        );
    }
}
