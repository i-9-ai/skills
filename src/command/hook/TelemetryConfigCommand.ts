// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import HookObserveCommand from './HookObserveCommand.ts';
import { TelemetryHookConfiguration } from '../../service/TelemetryHookConfiguration.ts';

export default class TelemetryConfigCommand extends Command {
    static description = 'Print verified native Read observation hooks; never write host settings.';
    static flags = HookObserveCommand.flags;
    static examples = [
        '<%= config.bin %> hook telemetry-config --host claude --db /data/usage.db --collection project=/project/.agents/skills',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(TelemetryConfigCommand);
        this.log(
            JSON.stringify(
                new TelemetryHookConfiguration().configuration(flags.db, flags.collection),
                null,
                2,
            ),
        );
    }
}
