// SPDX-License-Identifier: Apache-2.0
import { resolve } from 'node:path';
import { TelemetryIdentityService } from './TelemetryIdentityService.ts';
import type { NativeTelemetryObservation } from './TelemetryIdentityService.ts';

/** CLI view receipts are timestamp-keyed; legacy payloads without session IDs are unsupported. */
export class CopilotTelemetryAdapter {
    observation(value: unknown, _timestamp: string): NativeTelemetryObservation | undefined {
        const identity = new TelemetryIdentityService();
        const input = identity.object(value);
        if (typeof input.hook_event_name !== 'string')
            throw new Error('Expected a native hook event name');
        const session = identity.identifier(input.sessionId);
        const occurred = identity.timestamp(input.timestamp, 'milliseconds');
        if (input.hook_event_name === 'sessionStart') {
            if (typeof input.source !== 'string' || !['startup', 'new'].includes(input.source))
                return;
            return {
                event: identity.event(
                    'copilot',
                    'copilot-hooks-v1',
                    session,
                    'session-start:' + input.source + ':' + occurred,
                    'session.started',
                    occurred,
                ),
            };
        }
        if (
            !['preToolUse', 'postToolUse'].includes(input.hook_event_name) ||
            input.toolName !== 'view'
        )
            return;
        const tool = identity.object(
            typeof input.toolArgs === 'string' ? JSON.parse(input.toolArgs) : input.toolArgs,
        );
        const path = identity.path(tool.path);
        const cwd = identity.path(input.cwd);
        if (input.hook_event_name === 'postToolUse') {
            const response = identity.object(input.toolResult);
            if (response.resultType !== 'success' || typeof response.textResultForLlm !== 'string')
                return;
        }
        const file = resolve(cwd, path);
        return {
            file,
            event: identity.event(
                'copilot',
                'copilot-hooks-v1',
                session,
                JSON.stringify([input.timestamp, input.hook_event_name, file]),
                input.hook_event_name === 'preToolUse'
                    ? 'skill.read.attempted'
                    : 'skill.read.observed',
                occurred,
            ),
        };
    }
}
