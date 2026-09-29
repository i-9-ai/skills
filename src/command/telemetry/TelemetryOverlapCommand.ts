// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import { SkillEvidenceCommandConfiguration } from '../../config/SkillEvidenceCommandConfiguration.ts';
import { SkillEvidenceService } from '../../service/SkillEvidenceService.ts';
export default class TelemetryOverlapCommand extends Command {
    static description = 'Inspect co-routing pairs without inferring semantic similarity.';
    static examples = [
        '<%= config.bin %> telemetry overlap --db /data/usage.db --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z',
    ];
    static flags = { ...SkillEvidenceCommandConfiguration.periodFlags };
    async run(): Promise<void> {
        const { flags } = await this.parse(TelemetryOverlapCommand);
        this.log(
            JSON.stringify(
                new SkillEvidenceService().query(flags.db, 'overlap', {
                    from: flags.from,
                    until: flags.until,
                    collection: flags.collection,
                    skill: flags.skill,
                    limit: flags.limit,
                }),
            ),
        );
    }
}
