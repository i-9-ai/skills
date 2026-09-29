// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillEvidenceCommandConfiguration } from '../../config/SkillEvidenceCommandConfiguration.ts';
import { SkillMemoryService } from '../../service/SkillMemoryService.ts';

export default class SkillsMemoryRetentionCommand extends Command {
    static description =
        'Inspect evidence counts around an optional caller cutoff without deleting or approving retention.';
    static examples = [
        '<%= config.bin %> skills memory retention --db /data/evidence.db --collection demo --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z --cutoff 2026-09-15T00:00:00.000Z',
    ];
    static flags = {
        ...SkillEvidenceCommandConfiguration.periodFlags,
        collection: Flags.string({ required: true, description: 'Logical collection slug.' }),
        cutoff: Flags.string({
            description:
                'Optional canonical UTC cutoff within [from, until); an input, not approval.',
        }),
        limit: Flags.integer({
            min: 1,
            max: 100,
            default: 20,
            description:
                'Displayed evidence families; total counts always cover the bounded window.',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(SkillsMemoryRetentionCommand);
        const { db, ...query } = flags;
        this.log(JSON.stringify(new SkillMemoryService().retention(db, query)));
    }
}
