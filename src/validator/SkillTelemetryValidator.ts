// SPDX-License-Identifier: Apache-2.0
import { SkillReadValidator } from './SkillReadValidator.ts';

export const telemetryTypes = [
    'session.started',
    'skill.read.attempted',
    'skill.read.observed',
] as const;
export type TelemetryType = (typeof telemetryTypes)[number];
export type SkillTelemetryEvent = {
    schema_version: 1;
    event_type: TelemetryType;
    event_id: string;
    correlation_id: string;
    occurred_at: string;
    source_host: string;
    source_adapter: string;
    session: string;
    payload: { collection?: string; skill?: string; revision?: string };
};
const fields = [
    'schema_version',
    'event_type',
    'event_id',
    'correlation_id',
    'occurred_at',
    'source_host',
    'source_adapter',
    'session',
    'payload',
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Closed-schema metadata only: event content can never carry prompts or paths. */
export class SkillTelemetryValidator {
    event(value: unknown): SkillTelemetryEvent {
        const input = this.object(value);
        this.fields(input, fields);
        if (
            input.schema_version !== 1 ||
            !telemetryTypes.includes(input.event_type as TelemetryType)
        ) {
            throw new Error('Unsupported telemetry type or schema');
        }
        for (const field of ['event_id', 'correlation_id']) {
            if (typeof input[field] !== 'string' || !uuid.test(input[field])) {
                throw new Error('Telemetry identifiers must be canonical UUIDs');
            }
        }
        for (const field of ['source_host', 'source_adapter']) {
            if (typeof input[field] !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(input[field])) {
                throw new Error('Expected a bounded telemetry source slug');
            }
        }
        this.identifier(input.session);
        const occurredAt = new SkillReadValidator().timestamp(input.occurred_at);
        const payload = this.object(input.payload);
        const payloadFields =
            input.event_type === 'session.started' ? [] : ['collection', 'skill', 'revision'];
        this.fields(payload, payloadFields);
        for (const field of payloadFields) this.identifier(payload[field]);

        return {
            schema_version: 1,
            event_type: input.event_type as TelemetryType,
            event_id: input.event_id as string,
            correlation_id: input.correlation_id as string,
            occurred_at: occurredAt,
            source_host: input.source_host as string,
            source_adapter: input.source_adapter as string,
            session: input.session as string,
            payload: Object.fromEntries(payloadFields.map((field) => [field, payload[field]])),
        };
    }

    trends(value: unknown = {}) {
        const input = this.object(value);
        if (
            Object.keys(input).some((key) => !['from', 'until', 'interval', 'limit'].includes(key))
        ) {
            throw new Error('Unknown trend fields');
        }
        const period = new SkillReadValidator().rankingQuery({
            from: input.from,
            until: input.until,
        });
        const interval = input.interval ?? 'day';
        const limit = input.limit ?? 90;
        if (
            !['day', 'month'].includes(interval as string) ||
            !Number.isInteger(limit) ||
            Number(limit) < 1 ||
            Number(limit) > 366
        ) {
            throw new Error('Invalid trend interval or limit');
        }
        return {
            from: period.from,
            until: period.until,
            interval: interval as 'day' | 'month',
            limit: Number(limit),
        };
    }

    private identifier(value: unknown): void {
        if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) {
            throw new Error('Expected a bounded logical telemetry identifier');
        }
    }

    private object(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Expected a telemetry object');
        return value as Record<string, unknown>;
    }

    private fields(input: Record<string, unknown>, expected: string[]): void {
        if (
            Object.keys(input).length !== expected.length ||
            expected.some((key) => !Object.hasOwn(input, key))
        ) {
            throw new Error('Expected only documented telemetry fields');
        }
    }
}
