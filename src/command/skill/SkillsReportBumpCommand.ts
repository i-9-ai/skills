// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillBumpReportService } from '../../service/SkillBumpReportService.ts';
import { SkillBumpInputRepository } from '../../repository/SkillBumpInputRepository.ts';
import { SkillBumpReportError } from '../../validator/SkillBumpReportError.ts';

export default class SkillsReportBumpCommand extends Command {
    static description =
        'Compare two pinned observations and explicit contract review; recommend only with sufficient evidence, without version or release edits.';
    static examples = ['<%= config.bin %> skills report bump --file comparison.json --limit 20'];
    static flags = {
        file: Flags.string({
            required: true,
            description: 'Closed comparison JSON file, or - for stdin; at most 768 KiB.',
        }),
        limit: Flags.integer({
            min: 1,
            max: 100,
            description:
                'Maximum displayed changes; classification always uses complete bounded evidence.',
        }),
        offset: Flags.integer({
            min: 0,
            max: 4096,
            description: 'Stable offset into the selected immutable comparison.',
        }),
    };
    async run(): Promise<void> {
        const { flags } = await this.parse(SkillsReportBumpCommand);
        const input = await new SkillBumpInputRepository().read(flags.file);
        if (!input || typeof input !== 'object' || Array.isArray(input))
            throw new SkillBumpReportError('invalid_input');
        this.log(
            JSON.stringify(
                new SkillBumpReportService().report({
                    ...input,
                    ...(flags.limit === undefined ? {} : { limit: flags.limit }),
                    ...(flags.offset === undefined ? {} : { offset: flags.offset }),
                }),
            ),
        );
    }
}
