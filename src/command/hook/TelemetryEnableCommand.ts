// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { InstalledCollectionConfiguration } from '../../config/InstalledCollectionConfiguration.ts';
import { PluginDataConfiguration } from '../../config/PluginDataConfiguration.ts';
import { HookInstallationService } from '../../service/HookInstallationService.ts';
import { join } from 'node:path';

export default class TelemetryEnableCommand extends Command {
    static description =
        'Preview or explicitly merge skill-read telemetry from a retained read-only runtime.';
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
                'Absolute path resolving to this running Node; other executables are rejected.',
        }),
        'reviewed-registration': Flags.string({
            dependsOn: ['write'],
            description:
                'Exact registration SHA-256 from the inspected preview; required for writes.',
        }),
        write: Flags.boolean({
            default: false,
            description: 'Apply the previewed registration and ownership receipt.',
        }),
    };
    static examples = [
        '<%= config.bin %> hook telemetry-enable --host claude --file /project/.claude/settings.json --collection project=/project/.agents/skills',
        '<%= config.bin %> hook telemetry-enable --host claude --file /project/.claude/settings.json --collection project=/project/.agents/skills --write --reviewed-registration <preview-digest>',
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
                launcher: join(new InstalledCollectionConfiguration().root(), 'bin/index.mjs'),
                reviewedRegistrationDigest: flags['reviewed-registration'],
            },
            flags.write,
        );
        this.log(JSON.stringify(result));
    }
}
