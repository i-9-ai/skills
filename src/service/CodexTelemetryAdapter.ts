// SPDX-License-Identifier: Apache-2.0
import { ShellSkillReadRepository } from '../repository/ShellSkillReadRepository.ts';
import { TelemetryIdentityService } from './TelemetryIdentityService.ts';
import type { NativeTelemetryObservation } from './TelemetryIdentityService.ts';

/** Maps native Codex Bash reads only when literal selection and returned bytes agree. */
export class CodexTelemetryAdapter {
    observation(value: unknown, timestamp: string): NativeTelemetryObservation | undefined {
        const identity = new TelemetryIdentityService();
        const input = identity.object(value);
        if (typeof input.hook_event_name !== 'string')
            throw new Error('Expected a native hook event name');
        const session = identity.identifier(input.session_id);
        if (input.hook_event_name === 'SessionStart') {
            if (input.source !== 'startup') return;
            return {
                event: identity.event(
                    'codex',
                    'codex-hooks-v1',
                    session,
                    'session-start:startup',
                    'session.started',
                    timestamp,
                ),
            };
        }
        if (
            !['PreToolUse', 'PostToolUse'].includes(input.hook_event_name) ||
            input.tool_name !== 'Bash'
        )
            return;
        const occurrence = identity.identifier(input.tool_use_id);
        if (typeof input.cwd !== 'string') return;
        const reads = new ShellSkillReadRepository();
        const selection = reads.selection(identity.object(input.tool_input).command, input.cwd);
        if (!selection) return;
        if (input.hook_event_name === 'PostToolUse' && typeof input.tool_response !== 'string')
            return;
        return {
            file: selection.file,
            event: identity.event(
                'codex',
                'codex-hooks-v1',
                session,
                occurrence,
                input.hook_event_name === 'PreToolUse'
                    ? 'skill.read.attempted'
                    : 'skill.read.observed',
                timestamp,
            ),
        };
    }

    verified(value: unknown): boolean {
        const identity = new TelemetryIdentityService();
        const input = identity.object(value);
        if (typeof input.cwd !== 'string') return false;
        const reads = new ShellSkillReadRepository();
        const selection = reads.selection(identity.object(input.tool_input).command, input.cwd);
        return !!selection && reads.matches(selection, input.tool_response);
    }
}
