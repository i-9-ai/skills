// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { HookTelemetryService } from '../../service/HookTelemetryService.ts';
import { PluginDataConfiguration } from '../../config/PluginDataConfiguration.ts';
import type { PluginHookHost } from '../../config/PluginHookConfiguration.ts';

export default class HookObserveCommand extends Command {
    static description = 'Observe a verified native host event without granting tool permission.';
    static examples = [
        '<%= config.bin %> hook observe --host claude --db /data/usage.db --collection project=/project/.agents/skills',
    ];
    static flags = {
        host: Flags.string({ required: true, options: ['claude', 'codex', 'gemini', 'copilot'] }),
        event: Flags.string({
            options: ['sessionStart', 'preToolUse', 'postToolUse'],
            description: 'Copilot native event selector, supplied by its registration.',
        }),
        db: Flags.string({ description: 'Usage database; defaults to shared agent state.' }),
        collection: Flags.string({
            required: true,
            multiple: true,
            description: 'Logical label=absolute skill directory. Repeat for explicit roots.',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(HookObserveCommand);
        try {
            await new HookTelemetryService().observe(
                flags.db ?? new PluginDataConfiguration().usageDatabase(),
                flags.collection,
                flags.host as PluginHookHost,
                flags.event,
            );
            if (flags.host !== 'codex') this.log('{}');
        } catch {
            if (flags.host !== 'codex') this.log('{}');
            process.stderr.write('Skill telemetry unavailable; no permission decision was made.\n');
        }
    }
}
