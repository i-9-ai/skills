// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillEvidenceCommandConfiguration } from '../../config/SkillEvidenceCommandConfiguration.ts';
import { SkillEvidenceService } from '../../service/SkillEvidenceService.ts';
export default class TelemetryCatalogHistoryCommand extends Command {
    static description = 'Page catalog observation summaries or one bounded set of member changes.';
    static examples = [
        '<%= config.bin %> telemetry catalog-history --db /data/usage.db --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z',
    ];
    static flags = {
        ...SkillEvidenceCommandConfiguration.periodFlags,
        'after-sequence': Flags.integer({
            min: 0,
            description: 'Continue observation summaries after this database sequence.',
        }),
        'observation-sequence': Flags.integer({
            min: 1,
            description: 'Inspect member changes for exactly this observation.',
        }),
        'after-skill': Flags.string({
            description: 'Continue this observation’s changes after this skill slug.',
        }),
    };
    async run(): Promise<void> {
        const { flags } = await this.parse(TelemetryCatalogHistoryCommand);
        this.log(
            JSON.stringify(
                new SkillEvidenceService().query(flags.db, 'history', {
                    from: flags.from,
                    until: flags.until,
                    collection: flags.collection,
                    skill: flags.skill,
                    limit: flags.limit,
                    ...(flags['after-sequence'] === undefined
                        ? {}
                        : { after_sequence: flags['after-sequence'] }),
                    ...(flags['observation-sequence'] === undefined
                        ? {}
                        : { observation_sequence: flags['observation-sequence'] }),
                    ...(flags['after-skill'] === undefined
                        ? {}
                        : { after_skill: flags['after-skill'] }),
                }),
            ),
        );
    }
}
