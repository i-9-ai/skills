// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { HookTelemetryService } from '../../service/HookTelemetryService.ts';

export default class HookObserveCommand extends Command {
    static description = 'Observe a verified native host event without granting tool permission.';
    static examples = [
        '<%= config.bin %> hook observe --host claude --db /data/usage.db --collection project=/project/.agents/skills',
    ];
    static flags = {
        host: Flags.string({ required: true, options: ['claude'] }),
        db: Flags.string({ required: true, description: 'Absolute caller-owned usage database.' }),
        collection: Flags.string({
            required: true,
            multiple: true,
            description: 'Logical label=absolute skill directory. Repeat for explicit roots.',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(HookObserveCommand);
        try {
            await new HookTelemetryService().observe(flags.db, flags.collection);
            this.log('{}');
        } catch {
            this.log('{}');
            // Claude treats exit 1 as a nonblocking hook failure. Never use exit 2
            // or a permission/decision field for diagnostic collection.
            this.error('Skill telemetry unavailable; no permission decision was made.', {
                exit: 1,
            });
        }
    }
}
