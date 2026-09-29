// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, resolve } from 'node:path';
import type { PluginHookHost } from '../config/PluginHookConfiguration.ts';

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
        const payload = value as Record<string, unknown>;
        const name = payload.hook_event_name;
        const session = name === 'SessionStart';
        const read = host === 'claude' && ['PreToolUse', 'PostToolUse'].includes(String(name));
        if (!session && !read) return;
        if (read && payload.tool_name !== 'Read') return;

        if (
            typeof payload.cwd !== 'string' ||
            payload.cwd.length > 4096 ||
            !isAbsolute(payload.cwd) ||
            !payload.cwd.isWellFormed() ||
            /[\x00-\x1f\x7f]/.test(payload.cwd)
        ) {
            throw new Error('Expected a bounded absolute caller directory');
        }
        if (
            typeof payload.session_id !== 'string' ||
            !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(payload.session_id)
        ) {
            throw new Error('Expected a bounded native session identifier');
        }

        if (session) {
            const sources = ['startup', 'resume', 'clear', 'compact'];
            if (host === 'codex') sources.push('fork');
            if (typeof payload.source !== 'string' || !sources.includes(payload.source)) return;
        }

        return { cwd: resolve(payload.cwd), session, payload };
    }
}
