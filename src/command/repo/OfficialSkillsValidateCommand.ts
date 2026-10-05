// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import { Flags } from '@oclif/core';
import { ProjectConfiguration } from '../../config/ProjectConfiguration.ts';
import { OfficialValidationService } from '../../service/OfficialValidationService.ts';
import { SkillQualityService } from '../../service/SkillQualityService.ts';

export default class OfficialSkillsValidateCommand extends Command {
    static flags = {
        project: Flags.string({ description: 'Collection repository root.' }),
        'quality-request': Flags.string({
            description:
                'Closed collection/skill/source JSON file; requires quality-db and quality-output.',
        }),
        'quality-db': Flags.string({
            description:
                'Explicit absolute evidence database outside protected roots; parent must exist.',
        }),
        'quality-output': Flags.string({
            description:
                'New absolute metadata artifact directory outside protected roots; parent must exist.',
        }),
    };
    static description =
        'Run local checks and the pinned Agent Skills conformance validator in prepared CI.\n' +
        'Requires Python and the official validator setup; may install its pinned dependencies.\n' +
        'Use repo validate for ordinary local checks without Python or network access.';
    static examples = [
        '<%= config.bin %> repo validate-official --project ./skills-collection',
        '<%= config.bin %> repo validate-official --quality-request ./official-request.json --quality-db /tmp/quality/evidence.db --quality-output /tmp/quality/new-observation',
    ];

    async run() {
        const { flags } = await this.parse(OfficialSkillsValidateCommand);
        const selections = [flags['quality-request'], flags['quality-db'], flags['quality-output']];
        if (
            selections.some((value) => value !== undefined) &&
            !selections.every((value) => value !== undefined)
        )
            this.error('quality-request, quality-db and quality-output must be selected together.');
        const root = new ProjectConfiguration({ root: flags.project }).root();
        const observed =
            flags['quality-request'] === undefined
                ? undefined
                : await new SkillQualityService(
                      undefined,
                      new OfficialValidationService(),
                  ).observeOfficialFile(
                      root,
                      flags['quality-request'],
                      flags['quality-db']!,
                      flags['quality-output']!,
                  );
        const results = observed?.results ?? new OfficialValidationService().validateOfficial(root);
        let passed = true;

        if (observed) {
            this.log(JSON.stringify(observed.observation));
            if (observed.official_failed || observed.observation.artifact.result !== 'pass')
                passed = false;
        }

        for (const result of results) {
            const line = `${result.passed ? 'PASS' : 'FAIL'} ${result.name}`;
            if (observed) this.logToStderr(line);
            else this.log(line);
            if (!result.passed && result.diagnostic) this.warn(result.diagnostic);
            if (!result.passed) passed = false;
        }

        if (!passed) this.exit(1);
    }
}
