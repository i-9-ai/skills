// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillEvidenceCommandConfiguration } from '../../config/SkillEvidenceCommandConfiguration.ts';
import { SkillQualityService } from '../../service/SkillQualityService.ts';

export default class SkillsQualityInspectCommand extends Command {
    static description =
        'Inspect bounded exact-revision quality receipts in one read-only snapshot; never creates or upgrades storage or dereferences artifact locators.';
    static examples = [
        '<%= config.bin %> skills quality inspect --db /data/evidence.db --collection demo --skill example-skill --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z --limit 20',
    ];
    static flags = {
        ...SkillEvidenceCommandConfiguration.periodFlags,
        collection: Flags.string({ required: true, description: 'Logical collection slug.' }),
        kind: Flags.string({
            options: ['official_validation', 'behavioral_evaluation'],
            description: 'Receipt kind.',
        }),
        'source-key': Flags.string({ description: 'Exact source family hash.' }),
        'identity-key': Flags.string({ description: 'Exact package revision hash.' }),
        after: Flags.string({ description: 'Opaque cursor from the identical query scope.' }),
    };
    async run(): Promise<void> {
        const { flags } = await this.parse(SkillsQualityInspectCommand);
        const { db, 'source-key': source, 'identity-key': identity, ...query } = flags;
        this.log(
            JSON.stringify(
                new SkillQualityService().inspect(db, {
                    ...query,
                    ...(source ? { source_key: source } : {}),
                    ...(identity ? { identity_key: identity } : {}),
                }),
            ),
        );
    }
}
