// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillObservationService } from '../../service/SkillObservationService.ts';
import { SkillBumpInputRepository } from '../../repository/SkillBumpInputRepository.ts';
import { SkillBumpReportError } from '../../validator/SkillBumpReportError.ts';

export default class SkillsObserveCommand extends Command {
    static description =
        'Export a digest-pinned skill/collection observation from an existing verified snapshot; no capture, restore or version edits.';
    static examples = [
        '<%= config.bin %> skills observe --snapshot /data/snapshots/before --subject subject.json > before.json',
    ];
    static flags = {
        snapshot: Flags.string({
            required: true,
            description:
                'Explicit existing schema-2 snapshot; objects are verified within fixed bounds.',
        }),
        subject: Flags.string({
            required: true,
            description: 'Closed logical subject/public provenance JSON file.',
        }),
        evidence: Flags.string({
            description: 'Optional exact-content contract and validation assertions JSON file.',
        }),
    };
    async run(): Promise<void> {
        const { flags } = await this.parse(SkillsObserveCommand);
        if (flags.subject === '-' && flags.evidence === '-')
            throw new SkillBumpReportError('invalid_input');
        const input = new SkillBumpInputRepository();
        const subject = await input.read(flags.subject, process.stdin, 8192);
        const evidence =
            flags.evidence === undefined
                ? undefined
                : await input.read(flags.evidence, process.stdin, 128 * 1024);
        this.log(
            JSON.stringify(
                new SkillObservationService().observe(flags.snapshot, subject, evidence),
            ),
        );
    }
}
