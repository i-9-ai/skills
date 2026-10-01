// SPDX-License-Identifier: Apache-2.0
import { resolve } from 'node:path';
import { TelemetryIdentityService } from './TelemetryIdentityService.ts';
import type { NativeTelemetryObservation } from './TelemetryIdentityService.ts';

/** Native read_file success; timestamp receipts cannot prove pre/post call pairing. */
export class GeminiTelemetryAdapter {
    observation(value: unknown, _timestamp: string): NativeTelemetryObservation | undefined {
        const identity = new TelemetryIdentityService();
        const input = identity.object(value);
        if (typeof input.hook_event_name !== 'string')
            throw new Error('Expected a native hook event name');
        const session = identity.identifier(input.session_id);
        const timestamp = identity.timestamp(input.timestamp, 'iso');
        if (input.hook_event_name === 'SessionStart') {
            if (
                !['startup', 'clear'].includes(String(input.source)) ||
                typeof input.source !== 'string'
            )
                return;
            return {
                event: identity.event(
                    'gemini',
                    'gemini-hooks-v1',
                    session,
                    'session-start:' + input.source + ':' + timestamp,
                    'session.started',
                    timestamp,
                ),
            };
        }
        if (
            !['BeforeTool', 'AfterTool'].includes(input.hook_event_name) ||
            input.tool_name !== 'read_file'
        )
            return;
        const tool = identity.object(input.tool_input);
        const path = identity.path(tool.file_path);
        const cwd = identity.path(input.cwd);
        if (input.hook_event_name === 'AfterTool') {
            const response = identity.object(input.tool_response);
            if (
                response.error !== undefined ||
                !Object.hasOwn(response, 'llmContent') ||
                response.llmContent === undefined ||
                response.llmContent === null
            )
                return;
        }
        const file = resolve(cwd, path);
        return {
            file,
            event: identity.event(
                'gemini',
                'gemini-hooks-v1',
                session,
                JSON.stringify([timestamp, input.hook_event_name, file]),
                input.hook_event_name === 'BeforeTool'
                    ? 'skill.read.attempted'
                    : 'skill.read.observed',
                timestamp,
            ),
        };
    }
}
