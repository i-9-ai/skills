// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { HookInstallationService } from '../../service/HookInstallationService.ts';

export default class TelemetryStatusCommand extends Command {
    static description =
        'Inspect owned telemetry registrations and runtime availability without creating state.';
    static flags = {
        host: Flags.string({ required: true, options: ['codex', 'claude', 'copilot', 'gemini'] }),
        file: Flags.string({
            required: true,
            description: 'Absolute selected host settings filename.',
        }),
    };
    static examples = [
        '<%= config.bin %> hook telemetry-status --host codex --file /project/.codex/hooks.json',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(TelemetryStatusCommand);
        this.log(JSON.stringify(new HookInstallationService().status(flags)));
    }
}
