// SPDX-License-Identifier: Apache-2.0
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PluginHookConfiguration } from '../config/PluginHookConfiguration.ts';
import { TelemetryInputRepository } from '../repository/TelemetryInputRepository.ts';
import { PluginHookService } from '../service/PluginHookService.ts';

/** Direct Node 24 host adapter; no Git, dependency preparation or global CLI. */
export class PluginHookRunner {
    async run(): Promise<void> {
        let neutral = '{}';

        try {
            const host = PluginHookConfiguration.hostArgument(process.argv.slice(2));
            neutral = host === 'codex' ? '' : '{}';
            const configuration = new PluginHookConfiguration(host);
            const payload = await new TelemetryInputRepository().read(
                '-',
                process.stdin,
                1_048_576,
            );
            const event = process.argv.slice(2)[3];
            const input =
                host === 'copilot' &&
                event &&
                payload &&
                typeof payload === 'object' &&
                !Array.isArray(payload)
                    ? { ...payload, hook_event_name: event }
                    : payload;
            const result = await new PluginHookService(configuration).run(input);
            const output = result.output ? `${result.output}\n` : '';
            if (Buffer.byteLength(output, 'utf8') > configuration.maxOutputBytes) {
                throw new Error('Hook output exceeds its bound');
            }

            for (const diagnostic of result.diagnostics) process.stderr.write(`${diagnostic}\n`);
            process.stdout.write(output);
        } catch {
            process.stderr.write(
                'I-9 Skills plugin hook: context unavailable; continuing without hook output.\n',
            );
            if (neutral) process.stdout.write(`${neutral}\n`);
        }
    }
}

/** Resolve filesystem aliases without executing the hook on ordinary imports. */
function isEntrypoint(): boolean {
    const entrypoint = process.argv[1];
    if (!entrypoint) return false;

    try {
        return (
            realpathSync.native(entrypoint) === realpathSync.native(fileURLToPath(import.meta.url))
        );
    } catch {
        return false;
    }
}

if (isEntrypoint()) {
    await new PluginHookRunner().run();
}
