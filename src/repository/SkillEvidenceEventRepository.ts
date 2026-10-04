// SPDX-License-Identifier: Apache-2.0
import type { DatabaseSync } from 'node:sqlite';
import type { ValidatedEvidenceEvent } from '../validator/SkillEvidenceContractValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';

/** Claims canonical v2 envelopes inside the owning projection's transaction. */
export class SkillEvidenceEventRepository {
    private readonly database: DatabaseSync;
    constructor(database: DatabaseSync) {
        this.database = database;
    }

    claim(event: ValidatedEvidenceEvent): boolean {
        const envelope = JSON.stringify(event);
        const previous = this.database
            .prepare('SELECT envelope FROM usage_events WHERE event_id=?')
            .get(event.event_id);
        if (previous) {
            if (previous.envelope !== envelope) throw new SkillOperationError('evidence_conflict');
            return false;
        }
        if (
            this.database
                .prepare('SELECT event_id FROM usage_reads WHERE event_id=?')
                .get(event.event_id)
        )
            throw new SkillOperationError('evidence_conflict');
        this.database
            .prepare('INSERT INTO usage_events VALUES (?, ?, ?, ?, ?)')
            .run(
                event.event_id,
                event.event_type,
                event.occurred_at,
                event.session ?? '',
                envelope,
            );
        return true;
    }
}
