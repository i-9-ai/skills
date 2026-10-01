// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillTelemetryService } from '../../service/SkillTelemetryService.ts';
import { PluginDataConfiguration } from '../../config/PluginDataConfiguration.ts';

export const telemetryPeriodFlags = {
    db: Flags.string({
        default: async () => new PluginDataConfiguration().usageDatabase(),
        description: 'Existing absolute usage database; queries never create or migrate it.',
    }),
    from: Flags.string({ description: 'Inclusive canonical UTC timestamp.' }),
    until: Flags.string({ description: 'Exclusive canonical UTC timestamp.' }),
};

export default class TelemetryRankingsCommand extends Command {
    static description = 'Rank observed reads and distinct read sessions in a UTC period.';
    static examples = ['<%= config.bin %> telemetry rankings --db /data/usage.db --limit 10'];
    static flags = {
        ...telemetryPeriodFlags,
        limit: Flags.integer({ min: 1, max: 100, default: 20 }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(TelemetryRankingsCommand);
        this.log(
            JSON.stringify(
                new SkillTelemetryService().rankings(flags.db, {
                    from: flags.from,
                    until: flags.until,
                    limit: flags.limit,
                }),
            ),
        );
    }
}
