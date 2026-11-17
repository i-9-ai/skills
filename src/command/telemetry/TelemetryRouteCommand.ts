// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { PluginDataConfiguration } from '../../config/PluginDataConfiguration.ts';
import { SkillRoutingService } from '../../service/SkillRoutingService.ts';

export default class TelemetryRouteCommand extends Command {
    static description =
        'Record all explicitly selected skills under one decision correlation, atomically.';
    static examples = ['<%= config.bin %> telemetry route --file decision.json'];
    static flags = {
        db: Flags.string({
            default: async () => new PluginDataConfiguration().usageDatabase(),
            description: 'Absolute caller-owned evidence database; defaults to shared agent state.',
        }),
        file: Flags.string({
            required: true,
            description: 'Explicit decision JSON, at most 32 KiB, or - for stdin.',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(TelemetryRouteCommand);
        this.log(JSON.stringify(await new SkillRoutingService().recordFile(flags.db, flags.file)));
    }
}
