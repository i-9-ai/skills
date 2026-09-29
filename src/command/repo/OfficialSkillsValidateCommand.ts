// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import { Flags } from '@oclif/core';
import { ProjectConfiguration } from '../../config/ProjectConfiguration.ts';
import { OfficialValidationService } from '../../service/OfficialValidationService.ts';

export default class OfficialSkillsValidateCommand extends Command {
    static flags = { project: Flags.string({ description: 'Collection repository root.' }) };
    static description =
        'Run local checks and the pinned Agent Skills conformance validator in prepared CI.\n' +
        'Requires Python and the official validator setup; may install its pinned dependencies.\n' +
        'Use repo validate for ordinary local checks without Python or network access.';
    static examples = ['<%= config.bin %> repo validate-official --project ./skills-collection'];

    async run() {
        const { flags } = await this.parse(OfficialSkillsValidateCommand);
        const results = new OfficialValidationService().validateOfficial(
            new ProjectConfiguration({ root: flags.project }).root(),
        );
        let passed = true;

        for (const result of results) {
            this.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}`);
            if (!result.passed && result.diagnostic) this.warn(result.diagnostic);
            if (!result.passed) passed = false;
        }

        if (!passed) this.exit(1);
    }
}
