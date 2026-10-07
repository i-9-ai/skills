// SPDX-License-Identifier: Apache-2.0
import { Flags } from '@oclif/core';

/** Shared scope flags do not execute host discovery or installation. */
export class SkillInstallationCommandConfiguration {
    static readonly flags = {
        project: Flags.string({
            description: 'Selected project; defaults to the current working directory.',
        }),
        global: Flags.boolean({
            default: false,
            description: 'Select the shared global agent state root instead of a project.',
        }),
        write: Flags.boolean({
            default: false,
            description:
                'Apply the reviewed operation; without this flag output is a read-only preview.',
        }),
        strategy: Flags.string({
            options: ['auto', 'skills', 'plugin'],
            default: 'auto',
            description: 'Install portable packages or select a native plugin adapter.',
        }),
        host: Flags.string({
            options: ['codex', 'claude'],
            description: 'Explicit native host for the plugin route.',
        }),
    };
}
