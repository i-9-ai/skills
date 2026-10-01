// SPDX-License-Identifier: Apache-2.0
import { isDeepStrictEqual } from 'node:util';
import { HookConfigurationRepository } from '../repository/HookConfigurationRepository.ts';
import { HostHookConfiguration } from './HostHookConfiguration.ts';
import type { SessionHost, SessionHookSelection } from './HostHookConfiguration.ts';

/** Compares repository hook configuration without enabling or executing it. */
export class HookVerificationService {
    /** Compare configuration only. This never executes a hook or proves host enablement. */
    verifyHook(
        filename: string,
        host: SessionHost = 'codex',
        selection: SessionHookSelection = {},
    ): { matches: boolean; executed: false } {
        return {
            matches: isDeepStrictEqual(
                new HookConfigurationRepository().readHookConfiguration(filename),
                new HostHookConfiguration().sessionConfiguration(host, selection),
            ),
            executed: false,
        };
    }
}
