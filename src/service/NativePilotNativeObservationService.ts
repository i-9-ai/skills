// SPDX-License-Identifier: Apache-2.0
import { NativePilotCommonPhaseService } from './NativePilotCommonPhaseService.ts';
import { NativeCodexObserverDispatcher } from './NativeCodexObserverDispatcher.ts';
import { NativeClaudeRawObserverDispatcher } from './NativeClaudeRawObserverDispatcher.ts';

/** Fixed in-container host dispatch; no selected module import or extra caller command. */
export class NativePilotNativeObservationService {
    async run(argv: string[]) {
        const selection = new NativePilotCommonPhaseService().selection(argv);
        if (
            !['baseline', 'observe-a', 'observe-b', 'observe-restored-a', 'verify-absent'].includes(
                selection.phase,
            )
        )
            throw new Error('native_observer_phase');
        if (selection.host === 'codex') return new NativeCodexObserverDispatcher().run(argv);
        const narrowed = [...argv];
        if (narrowed.length === 12) narrowed.push('--pin', 'a');
        else narrowed[13] = selection.phase === 'observe-b' ? 'b' : 'a';
        return new NativeClaudeRawObserverDispatcher().run(narrowed);
    }
}
