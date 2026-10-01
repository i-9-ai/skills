// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import HookObserveCommand from './HookObserveCommand.ts';
import { TelemetryHookConfiguration } from '../../service/TelemetryHookConfiguration.ts';
import { PluginDataConfiguration } from '../../config/PluginDataConfiguration.ts';

export default class TelemetryConfigCommand extends Command {
    static description =
        'Print supported native skill-read observation hooks; never write host settings.';
    static flags = {
        host: HookObserveCommand.flags.host,
        db: HookObserveCommand.flags.db,
        collection: HookObserveCommand.flags.collection,
    };
    static examples = [
        '<%= config.bin %> hook telemetry-config --host claude --db /data/usage.db --collection project=/project/.agents/skills',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(TelemetryConfigCommand);
        this.log(
            JSON.stringify(
                new TelemetryHookConfiguration().configuration(
                    flags.db ?? new PluginDataConfiguration().usageDatabase(),
                    flags.collection,
                    flags.host,
                ),
                null,
                2,
            ),
        );
    }
}
