// SPDX-License-Identifier: Apache-2.0
export type SkillRead = {
    event_id: string;
    collection: string;
    skill: string;
    revision: string;
    session: string;
    occurred_at: string;
};

export type RankingQuery = { from: string; until: string; limit: number };
export const readFields = [
    'event_id',
    'collection',
    'skill',
    'revision',
    'session',
    'occurred_at',
] as const;

/** Validates minimized read evidence and bounded ranking queries. */
export class SkillReadValidator {
    timestamp(value: unknown): string {
        if (
            typeof value !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
            !Number.isFinite(Date.parse(value)) ||
            new Date(value).toISOString() !== value
        ) {
            throw new Error('Expected canonical UTC timestamp');
        }

        return value;
    }

    skillRead(value: unknown): SkillRead {
        const input = this.object(value);

        if (
            Object.keys(input).length !== readFields.length ||
            readFields.some((field) => !Object.hasOwn(input, field))
        ) {
            throw new Error('Expected only the documented read event fields');
        }

        for (const field of readFields) {
            if (field === 'occurred_at') continue;
            const identifier = input[field];
            if (
                typeof identifier !== 'string' ||
                !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(identifier)
            ) {
                throw new Error('Expected bounded logical identifiers');
            }
        }

        this.timestamp(input.occurred_at);
        return input as SkillRead;
    }

    rankingQuery(value: unknown = {}): RankingQuery {
        const input = this.object(value);
        if (Object.keys(input).some((field) => !['from', 'until', 'limit'].includes(field))) {
            throw new Error('Unknown ranking fields');
        }

        const from = this.timestamp(input.from ?? '1970-01-01T00:00:00.000Z');
        const until = this.timestamp(input.until ?? '9999-12-31T23:59:59.999Z');
        const limit = input.limit ?? 20;

        if (
            from >= until ||
            typeof limit !== 'number' ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            throw new Error('Invalid ranking period or limit');
        }

        return { from, until, limit };
    }

    private object(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Expected an object');
        return value as Record<string, unknown>;
    }
}
