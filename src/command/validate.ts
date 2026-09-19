// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import { Flags } from '@oclif/core';
import { ProjectConfiguration } from '../config/ProjectConfiguration.ts';
import { CollectionValidationService } from '../service/CollectionValidationService.ts';

export default class ValidateCommand extends Command {
    static flags = { project: Flags.string({ description: 'Collection repository root.' }) };
    static description =
        'ValidateCommand the repository collection without running the external official validator.';

    async run() {
        const { flags } = await this.parse(ValidateCommand);
        const result = new CollectionValidationService().validateRepository(
            new ProjectConfiguration({ root: flags.project }).root(),
        );

        this.log(JSON.stringify(result));
        this.log(
            'Collection checks passed; official CI validation and behavioral evaluation remain separate.',
        );
    }
}
