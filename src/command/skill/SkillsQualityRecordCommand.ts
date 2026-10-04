// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { PluginDataConfiguration } from '../../config/PluginDataConfiguration.ts';
import { SkillQualityService } from '../../service/SkillQualityService.ts';

export default class SkillsQualityRecordCommand extends Command {
    static description =
        'Record one exact-revision quality assertion, optionally checking selected package bytes or a retained benchmark. No official process executes.';
    static examples = [
        '<%= config.bin %> skills quality record --db /data/evidence.db --file receipt.json',
        '<%= config.bin %> skills quality record --db /data/evidence.db --file receipt.json --package-root /input/example-skill --benchmark /input/frozen-benchmark',
    ];
    static flags = {
        db: Flags.string({
            default: async () => new PluginDataConfiguration().usageDatabase(),
            description:
                'Absolute evidence database outside installed, caller and selected input roots; explicitly creates or upgrades.',
        }),
        file: Flags.string({
            required: true,
            description:
                'Closed receipt JSON, at most 16 KiB, or - for stdin. Supplied assurance is rejected.',
        }),
        'package-root': Flags.string({
            description:
                'Explicit real package directory whose full inert byte inventory must match the asserted digest.',
        }),
        benchmark: Flags.string({
            description:
                'Explicit real retained benchmark directory; full freeze/run/artifact verification derives coverage.',
        }),
    };
    async run(): Promise<void> {
        const { flags } = await this.parse(SkillsQualityRecordCommand);
        this.log(
            JSON.stringify(
                await new SkillQualityService().recordFile(flags.db, flags.file, {
                    ...(flags['package-root'] ? { package_root: flags['package-root'] } : {}),
                    ...(flags.benchmark ? { benchmark: flags.benchmark } : {}),
                }),
            ),
        );
    }
}
