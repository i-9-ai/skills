// SPDX-License-Identifier: Apache-2.0
import { isDeepStrictEqual } from 'node:util';
import { HookConfigurationRepository } from '../repository/HookConfigurationRepository.ts';
import { CodexHookConfiguration } from './CodexHookConfiguration.ts';

/** Compares repository hook configuration without enabling or executing it. */
export class HookVerificationService {
    /** Compare configuration only. This never executes a hook or proves host enablement. */
    verifyHook(filename: string): { matches: boolean; executed: false } {
        return {
            matches: isDeepStrictEqual(
                new HookConfigurationRepository().readHookConfiguration(filename),
                new CodexHookConfiguration().codexSessionHook(),
            ),
            executed: false,
        };
    }
}
