// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import type { SkillTelemetryEvent, TelemetryType } from '../validator/SkillTelemetryValidator.ts';

export type ClaudeObservation = {
    event: Omit<SkillTelemetryEvent, 'payload'>;
    file?: string;
};

/** Maps only documented Claude lifecycle and native Read success events. */
export class ClaudeTelemetryAdapter {
    observation(value: unknown, timestamp: string): ClaudeObservation | undefined {
        const input = this.object(value);
        const name = input.hook_event_name;
        if (typeof name !== 'string') throw new Error('Expected a native hook event name');
        if (!['SessionStart', 'PreToolUse', 'PostToolUse'].includes(name)) return;
        const session = this.identifier(input.session_id);
        if (name === 'SessionStart') {
            if (typeof input.source !== 'string')
                throw new Error('Expected a native session source');
            if (!['startup', 'clear'].includes(input.source)) return;
            return {
                event: this.event(
                    'session.started',
                    session,
                    `session-start:${input.source}`,
                    timestamp,
                ),
            };
        }
        if (input.tool_name !== 'Read') return;
        const occurrence = this.identifier(input.tool_use_id);
        const toolInput = this.object(input.tool_input);
        if (typeof toolInput.file_path !== 'string' || toolInput.file_path.length > 4096) {
            throw new Error('Expected a bounded native Read filename');
        }
        if (name === 'PostToolUse' && !Object.hasOwn(input, 'tool_response')) {
            throw new Error('Successful Read observation requires the documented result field');
        }
        return {
            event: this.event(
                name === 'PreToolUse' ? 'skill.read.attempted' : 'skill.read.observed',
                session,
                occurrence,
                timestamp,
            ),
            file: toolInput.file_path,
        };
    }

    private event(type: TelemetryType, session: string, occurrence: string, timestamp: string) {
        const identity = ['i9-skills', 'claude-hooks-v1', session, occurrence];
        return {
            schema_version: 1 as const,
            event_type: type,
            event_id: this.uuid([...identity, type]),
            correlation_id: this.uuid(identity),
            occurred_at: timestamp,
            source_host: 'claude',
            source_adapter: 'claude-hooks-v1',
            session: this.uuid(['i9-skills', 'claude-session', session]),
        };
    }

    /** UUIDv8 is an opaque stable name mapping; it is not an authentication token. */
    private uuid(parts: string[]): string {
        const bytes = createHash('sha256').update(JSON.stringify(parts)).digest().subarray(0, 16);
        bytes[6] = (bytes[6]! & 0x0f) | 0x80;
        bytes[8] = (bytes[8]! & 0x3f) | 0x80;
        const hex = bytes.toString('hex');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    private identifier(value: unknown): string {
        if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(value)) {
            throw new Error('Expected a bounded host occurrence identifier');
        }
        return value;
    }

    private object(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Expected a host event object');
        return value as Record<string, unknown>;
    }
}
