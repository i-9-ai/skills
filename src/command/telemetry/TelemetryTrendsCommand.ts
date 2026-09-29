// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillTelemetryService } from '../../service/SkillTelemetryService.ts';
import { telemetryPeriodFlags } from './TelemetryRankingsCommand.ts';

export default class TelemetryTrendsCommand extends Command {
    static description =
        'Inspect UTC read, attempt and explicit session-start buckets without inferring activation.';
    static examples = [
        '<%= config.bin %> telemetry trends --db /data/usage.db --interval day --limit 30',
    ];
    static flags = {
        ...telemetryPeriodFlags,
        interval: Flags.string({ options: ['day', 'month'], default: 'day' }),
        limit: Flags.integer({ min: 1, max: 366, default: 90 }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(TelemetryTrendsCommand);
        this.log(
            JSON.stringify(
                new SkillTelemetryService().trends(flags.db, {
                    from: flags.from,
                    until: flags.until,
                    interval: flags.interval,
                    limit: flags.limit,
                }),
            ),
        );
    }
}
