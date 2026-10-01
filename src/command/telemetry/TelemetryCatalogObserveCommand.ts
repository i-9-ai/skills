// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillEvidenceService } from '../../service/SkillEvidenceService.ts';
import { PluginDataConfiguration } from '../../config/PluginDataConfiguration.ts';
export default class TelemetryCatalogObserveCommand extends Command {
    static description =
        'Record one complete redacted catalog observation without changing a source catalog.';
    static examples = [
        '<%= config.bin %> telemetry catalog-observe --db /data/usage.db --file observation.json',
    ];
    static flags = {
        db: Flags.string({
            default: async () => new PluginDataConfiguration().usageDatabase(),
            description: 'Absolute caller-owned evidence database; creates or upgrades explicitly.',
        }),
        file: Flags.string({
            required: true,
            description: 'Strict JSON observation, at most 256 KiB, or - for stdin.',
        }),
    };
    async run(): Promise<void> {
        const { flags } = await this.parse(TelemetryCatalogObserveCommand);
        this.log(
            JSON.stringify(
                await new SkillEvidenceService().recordCatalogFile(flags.db, flags.file),
            ),
        );
    }
}
