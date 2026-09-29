// SPDX-License-Identifier: Apache-2.0
import { isAbsolute } from 'node:path';
import { SkillEvidenceValidator } from './SkillEvidenceValidator.ts';
import { SkillReadValidator } from './SkillReadValidator.ts';
import { SkillOperationError } from './SkillOperationError.ts';

export const MEMORY_INPUT_BYTES = 4096;
export const MEMORY_OUTPUT_BYTES = 65536;
export const MEMORY_PERIOD_ROWS = 5000;
export type SkillMemoryKind = 'summarize' | 'retention';
export type SkillMemoryQuery = {
    from: string;
    until: string;
    collection: string;
    skill?: string;
    limit: number;
    cutoff?: string;
};

/** Closed inspection input; a cutoff never conveys permission to change history. */
export class SkillMemoryValidator {
    query(value: unknown, kind: SkillMemoryKind): SkillMemoryQuery {
        if (!value || typeof value !== 'object' || Array.isArray(value)) this.invalid();
        const input = value as Record<string, unknown>;
        const fields = ['from', 'until', 'collection', 'skill', 'limit'];
        if (kind === 'retention') fields.push('cutoff');
        if (Object.keys(input).some((field) => !fields.includes(field))) this.invalid();
        try {
            if (Buffer.byteLength(JSON.stringify(input)) > MEMORY_INPUT_BYTES) this.invalid();
        } catch {
            this.invalid();
        }

        const query = new SkillEvidenceValidator().query(
            {
                from: input.from,
                until: input.until,
                collection: input.collection,
                skill: input.skill,
                limit: input.limit,
            },
            'lifecycle',
        );
        if (!query.collection) this.invalid();
        let cutoff: string | undefined;
        if (input.cutoff !== undefined) {
            try {
                cutoff = new SkillReadValidator().timestamp(input.cutoff);
            } catch {
                this.invalid();
            }
            if (cutoff < query.from || cutoff >= query.until) this.invalid();
        }
        return {
            from: query.from,
            until: query.until,
            collection: query.collection,
            ...(query.skill === undefined ? {} : { skill: query.skill }),
            limit: query.limit,
            ...(cutoff === undefined ? {} : { cutoff }),
        };
    }

    database(value: unknown): void {
        if (
            typeof value !== 'string' ||
            !isAbsolute(value) ||
            Buffer.byteLength(value) > MEMORY_INPUT_BYTES ||
            /[\u0000\r\n]/u.test(value)
        )
            this.invalid();
    }

    response<T>(value: T): T {
        if (Buffer.byteLength(JSON.stringify(value)) > MEMORY_OUTPUT_BYTES)
            throw new SkillOperationError('response_too_large');
        return value;
    }

    private invalid(): never {
        throw new SkillOperationError('invalid_input');
    }
}
