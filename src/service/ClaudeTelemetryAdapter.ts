// SPDX-License-Identifier: Apache-2.0
import { TelemetryIdentityService } from './TelemetryIdentityService.ts';
import type { NativeTelemetryObservation } from './TelemetryIdentityService.ts';

export type ClaudeObservation = NativeTelemetryObservation;

/** Maps only documented Claude lifecycle and native Read success events. */
export class ClaudeTelemetryAdapter {
    observation(value: unknown, timestamp: string): ClaudeObservation | undefined {
        const identity = new TelemetryIdentityService();
        const input = identity.object(value);
        const name = input.hook_event_name;
        if (typeof name !== 'string') throw new Error('Expected a native hook event name');
        if (!['SessionStart', 'PreToolUse', 'PostToolUse'].includes(name)) return;
        const session = identity.identifier(input.session_id);
        if (name === 'SessionStart') {
            if (typeof input.source !== 'string')
                throw new Error('Expected a native session source');
            if (!['startup', 'clear'].includes(input.source)) return;
            return {
                event: identity.event(
                    'claude',
                    'claude-hooks-v1',
                    session,
                    'session-start:' + input.source,
                    'session.started',
                    timestamp,
                ),
            };
        }
        if (input.tool_name !== 'Read') return;
        const occurrence = identity.identifier(input.tool_use_id);
        const toolInput = identity.object(input.tool_input);
        const file = identity.path(toolInput.file_path);
        if (name === 'PostToolUse' && !Object.hasOwn(input, 'tool_response')) {
            throw new Error('Successful Read observation requires the documented result field');
        }
        return {
            event: identity.event(
                'claude',
                'claude-hooks-v1',
                session,
                occurrence,
                name === 'PreToolUse' ? 'skill.read.attempted' : 'skill.read.observed',
                timestamp,
            ),
            file,
        };
    }
}
