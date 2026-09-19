// SPDX-License-Identifier: Apache-2.0
import { TelemetryInputRepository } from '../repository/TelemetryInputRepository.ts';
import type { SessionHost } from './HostHookConfiguration.ts';

/** Gate hosts whose context lifecycle repeats; raw turn content is discarded. */
export class HostSessionInputService {
    async shouldRender(host: SessionHost): Promise<boolean> {
        if (host !== 'antigravity' && host !== 'hermes') return true;
        const value = await new TelemetryInputRepository().read('-', process.stdin, 1_048_576);
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('Expected a lifecycle object');
        }
        const input = value as Record<string, unknown>;
        if (host === 'antigravity') {
            if (!Number.isInteger(input.invocationNum) || Number(input.invocationNum) < 0) {
                throw new Error('Expected an invocation sequence number');
            }
            return input.invocationNum === 0;
        }
        if (input.hook_event_name !== 'pre_llm_call') return false;
        const extra = input.extra as Record<string, unknown> | undefined;
        if (!extra || typeof extra !== 'object' || typeof extra.is_first_turn !== 'boolean') {
            throw new Error('Expected the first-turn lifecycle flag');
        }
        return extra.is_first_turn;
    }
}
