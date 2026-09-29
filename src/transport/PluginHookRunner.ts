// SPDX-License-Identifier: Apache-2.0
import { resolve } from 'node:path';
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
            neutral = host === 'claude' ? '{}' : '';
            const configuration = new PluginHookConfiguration(host);
            const payload = await new TelemetryInputRepository().read(
                '-',
                process.stdin,
                1_048_576,
            );
            const result = await new PluginHookService(configuration).run(payload);
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await new PluginHookRunner().run();
}
