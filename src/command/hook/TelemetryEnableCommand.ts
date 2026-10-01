// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { InstalledCollectionConfiguration } from '../../config/InstalledCollectionConfiguration.ts';
import { PluginDataConfiguration } from '../../config/PluginDataConfiguration.ts';
import { HookInstallationService } from '../../service/HookInstallationService.ts';
import { join } from 'node:path';

export default class TelemetryEnableCommand extends Command {
    static description =
        'Preview or explicitly merge optional skill-read telemetry into selected host settings.';
    static flags = {
        host: Flags.string({ required: true, options: ['codex', 'claude', 'copilot', 'gemini'] }),
        file: Flags.string({
            required: true,
            description: 'Absolute settings filename under an existing canonical directory.',
        }),
        db: Flags.string({
            description: 'Evidence database; defaults to shared ~/.agents/skills-usage.db.',
        }),
        collection: Flags.string({
            required: true,
            multiple: true,
            description: 'Explicit label=absolute skill directory; repeat for multiple roots.',
        }),
        executable: Flags.string({
            description:
                'Absolute installed CLI executable; otherwise use this running Node and launcher.',
        }),
        write: Flags.boolean({
            default: false,
            description: 'Apply the previewed registration and ownership receipt.',
        }),
    };
    static examples = [
        '<%= config.bin %> hook telemetry-enable --host claude --file /project/.claude/settings.json --collection project=/project/.agents/skills',
        '<%= config.bin %> hook telemetry-enable --host claude --file /project/.claude/settings.json --collection project=/project/.agents/skills --executable /usr/local/bin/i9-skills --write',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(TelemetryEnableCommand);
        const result = new HookInstallationService().enable(
            {
                file: flags.file,
                host: flags.host,
                database: flags.db ?? new PluginDataConfiguration().usageDatabase(),
                collections: flags.collection,
                executable: flags.executable,
                launcher: flags.executable
                    ? undefined
                    : join(new InstalledCollectionConfiguration().root(), 'bin/index.mjs'),
            },
            flags.write,
        );
        this.log(JSON.stringify(result));
    }
}
