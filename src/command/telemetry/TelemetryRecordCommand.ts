// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillTelemetryService } from '../../service/SkillTelemetryService.ts';

export default class TelemetryRecordCommand extends Command {
    static description = 'Record a schema-1 observation or explicit schema-2 lifecycle event.';
    static examples = ['<%= config.bin %> telemetry record --db /data/usage.db --file event.json'];
    static flags = {
        db: Flags.string({
            required: true,
            description: 'Absolute caller-owned usage database; creates or upgrades explicitly.',
        }),
        file: Flags.string({
            required: true,
            description: 'Bounded JSON event file, or - for stdin.',
        }),
        'log-file': Flags.string({
            description:
                'Optional absolute diagnostic JSONL path; rotates at 1 MiB with three archives.',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(TelemetryRecordCommand);
        this.log(
            JSON.stringify(
                await new SkillTelemetryService().record(flags.db, flags.file, flags['log-file']),
            ),
        );
    }
}
