// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { HookInstallationService } from '../../service/HookInstallationService.ts';

export default class TelemetryDisableCommand extends Command {
    static description =
        'Preview or remove exact owned telemetry hooks, preserving unrelated settings and evidence.';
    static flags = {
        host: Flags.string({ required: true, options: ['codex', 'claude', 'copilot', 'gemini'] }),
        file: Flags.string({
            required: true,
            description: 'Absolute settings filename with its local ownership receipt.',
        }),
        write: Flags.boolean({
            default: false,
            description: 'Remove verified owned entries; retain the database.',
        }),
    };
    static examples = [
        '<%= config.bin %> hook telemetry-disable --host codex --file /project/.codex/hooks.json --write',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(TelemetryDisableCommand);
        this.log(JSON.stringify(new HookInstallationService().disable(flags, flags.write)));
    }
}
