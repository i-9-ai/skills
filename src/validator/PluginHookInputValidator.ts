// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, resolve } from 'node:path';
import type { PluginHookHost } from '../config/PluginHookConfiguration.ts';
import { TelemetryIdentityService } from '../service/TelemetryIdentityService.ts';

export type PluginHookInput = {
    cwd: string;
    session: boolean;
    payload: Record<string, unknown>;
};

/** Recognizes only reviewed native lifecycle inputs; other events are neutral. */
export class PluginHookInputValidator {
    input(value: unknown, host: PluginHookHost): PluginHookInput | undefined {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('Expected a native hook object');
        }
        const raw = value as Record<string, unknown>;
        const payload = host === 'copilot' ? { ...raw, session_id: raw.sessionId } : raw;
        const name = payload.hook_event_name;
        if (typeof name !== 'string') throw new Error('Expected a native hook event name');
        const session = name === 'SessionStart' || (host === 'copilot' && name === 'sessionStart');
        const events = {
            claude: ['PreToolUse', 'PostToolUse'],
            codex: ['PreToolUse', 'PostToolUse'],
            gemini: ['BeforeTool', 'AfterTool'],
            copilot: ['preToolUse', 'postToolUse'],
        };
        const read = events[host].includes(name);
        if (!session && !read) return;
        const tools = { claude: 'Read', codex: 'Bash', gemini: 'read_file', copilot: 'view' };
        if (read && (host === 'copilot' ? payload.toolName : payload.tool_name) !== tools[host])
            return;

        if (
            typeof payload.cwd !== 'string' ||
            payload.cwd.length > 4096 ||
            !isAbsolute(payload.cwd) ||
            !payload.cwd.isWellFormed() ||
            /[\x00-\x1f\x7f]/.test(payload.cwd)
        ) {
            throw new Error('Expected a bounded absolute caller directory');
        }
        new TelemetryIdentityService().identifier(payload.session_id);

        if (session) {
            const sources = {
                claude: ['startup', 'resume', 'clear', 'compact'],
                codex: ['startup', 'resume', 'clear', 'compact', 'fork'],
                gemini: ['startup', 'resume', 'clear'],
                copilot: ['startup', 'resume', 'new'],
            }[host];
            if (typeof payload.source !== 'string' || !sources.includes(payload.source)) return;
        }

        return { cwd: resolve(payload.cwd), session, payload };
    }
}
