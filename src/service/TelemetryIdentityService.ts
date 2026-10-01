// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { SkillReadValidator } from '../validator/SkillReadValidator.ts';
import type { SkillTelemetryEvent, TelemetryType } from '../validator/SkillTelemetryValidator.ts';

export type NativeTelemetryObservation = {
    event: Omit<SkillTelemetryEvent, 'payload'>;
    file?: string;
};

/** Stable opaque identities deduplicate retries without persisting native identifiers. */
export class TelemetryIdentityService {
    event(
        host: string,
        adapter: string,
        session: string,
        occurrence: string,
        type: TelemetryType,
        timestamp: string,
    ) {
        const identity = ['i9-skills', adapter, session, occurrence];
        return {
            schema_version: 1 as const,
            event_type: type,
            event_id: this.uuid([...identity, type]),
            correlation_id: this.uuid(identity),
            occurred_at: timestamp,
            source_host: host,
            source_adapter: adapter,
            session: this.uuid(['i9-skills', host + '-session', session]),
        };
    }

    identifier(value: unknown): string {
        if (
            typeof value !== 'string' ||
            value.length < 1 ||
            value.length > 256 ||
            !value.isWellFormed() ||
            /[\x00-\x1f\x7f]/.test(value)
        )
            throw new Error('Expected a bounded host occurrence identifier');
        return value;
    }

    /** Normalize only bounded documented native timestamps, without permissive Date parsing. */
    timestamp(value: unknown, format: 'iso' | 'milliseconds'): string {
        if (format === 'milliseconds') {
            if (
                typeof value !== 'number' ||
                !Number.isSafeInteger(value) ||
                value < 0 ||
                value > 253402300799999
            )
                throw new Error('Expected bounded native epoch milliseconds');
            return new SkillReadValidator().timestamp(new Date(value).toISOString());
        }
        if (
            typeof value !== 'string' ||
            value.length > 24 ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
        )
            throw new Error('Expected bounded native ISO timestamp');
        const normalized = value.length === 20 ? value.replace('Z', '.000Z') : value;
        return new SkillReadValidator().timestamp(normalized);
    }

    path(value: unknown): string {
        if (
            typeof value !== 'string' ||
            value.length < 1 ||
            value.length > 4096 ||
            !value.isWellFormed() ||
            /[\x00-\x1f\x7f]/.test(value)
        )
            throw new Error('Expected a bounded native filename');
        return value;
    }

    object(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Expected a host event object');
        return value as Record<string, unknown>;
    }

    private uuid(parts: string[]): string {
        const bytes = createHash('sha256').update(JSON.stringify(parts)).digest().subarray(0, 16);
        bytes[6] = (bytes[6]! & 0x0f) | 0x80;
        bytes[8] = (bytes[8]! & 0x3f) | 0x80;
        const hex = bytes.toString('hex');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
}
