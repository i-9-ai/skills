// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import { Flags } from '@oclif/core';
import { ProjectConfiguration } from '../config/ProjectConfiguration.ts';
import { OfficialValidationService } from '../service/OfficialValidationService.ts';

export default class CiOfficialCommand extends Command {
    static flags = { project: Flags.string({ description: 'Collection repository root.' }) };
    static description = 'Run repository checks and the pinned official skill validator.';

    async run() {
        const { flags } = await this.parse(CiOfficialCommand);
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
