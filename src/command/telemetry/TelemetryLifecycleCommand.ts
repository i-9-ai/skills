// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillEvidenceCommandConfiguration } from '../../config/SkillEvidenceCommandConfiguration.ts';
import { SkillEvidenceService } from '../../service/SkillEvidenceService.ts';

export default class TelemetryLifecycleCommand extends Command {
    static description = 'Inspect explicit lifecycle cohorts, outcomes and denominators.';
    static examples = [
        '<%= config.bin %> telemetry lifecycle --db /data/usage.db --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z',
    ];
    static flags = {
        ...SkillEvidenceCommandConfiguration.periodFlags,
        interval: Flags.string({ options: ['total', 'day', 'month'], default: 'total' }),
    };
    async run(): Promise<void> {
        const { flags } = await this.parse(TelemetryLifecycleCommand);
        this.log(
            JSON.stringify(
                new SkillEvidenceService().query(flags.db, 'lifecycle', {
                    from: flags.from,
                    until: flags.until,
                    collection: flags.collection,
                    skill: flags.skill,
                    limit: flags.limit,
                    interval: flags.interval,
                }),
            ),
        );
    }
}
