// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import { CodexHookConfiguration } from '../../../service/CodexHookConfiguration.ts';

export default class HookRenderCommand extends Command {
    static description =
        'Print the optional Codex session hook configuration without writing or enabling it.';
    static examples = ['<%= config.bin %> hook codex session-config'];

    async run(): Promise<void> {
        await this.parse(HookRenderCommand);
        this.log(JSON.stringify(new CodexHookConfiguration().codexSessionHook(), null, 2));
    }
}
