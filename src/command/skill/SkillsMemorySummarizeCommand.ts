// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillEvidenceCommandConfiguration } from '../../config/SkillEvidenceCommandConfiguration.ts';
import { SkillMemoryService } from '../../service/SkillMemoryService.ts';

export default class SkillsMemorySummarizeCommand extends Command {
    static description =
        'Summarize recorded lifecycle, catalog and weaker read evidence in one read-only snapshot.';
    static examples = [
        '<%= config.bin %> skills memory summarize --db /data/evidence.db --collection demo --skill example-skill --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z --limit 20',
    ];
    static flags = {
        ...SkillEvidenceCommandConfiguration.periodFlags,
        collection: Flags.string({ required: true, description: 'Logical collection slug.' }),
        limit: Flags.integer({
            min: 1,
            max: 100,
            default: 20,
            description:
                'Displayed entries per section; work remains capped at 5,000 rows per scan.',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(SkillsMemorySummarizeCommand);
        const { db, ...query } = flags;
        this.log(JSON.stringify(new SkillMemoryService().summarize(db, query)));
    }
}
