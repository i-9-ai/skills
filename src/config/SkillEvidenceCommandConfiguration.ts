// SPDX-License-Identifier: Apache-2.0
import { Flags } from '@oclif/core';

/** Shared operator-facing bounds for read-only evidence queries. */
export class SkillEvidenceCommandConfiguration {
    static periodFlags = {
        db: Flags.string({
            required: true,
            description: 'Existing absolute evidence database; queries never create or upgrade it.',
        }),
        from: Flags.string({
            required: true,
            description: 'Inclusive canonical UTC timestamp; period at most 366 days.',
        }),
        until: Flags.string({ required: true, description: 'Exclusive canonical UTC timestamp.' }),
        collection: Flags.string({ description: 'Logical collection slug.' }),
        skill: Flags.string({ description: 'Logical skill slug.' }),
        limit: Flags.integer({ min: 1, max: 100, default: 20 }),
    };
}
