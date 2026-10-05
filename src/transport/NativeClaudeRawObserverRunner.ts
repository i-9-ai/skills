// SPDX-License-Identifier: Apache-2.0
import { NativeClaudeRawObserverDispatcher } from '../service/NativeClaudeRawObserverDispatcher.ts';

try {
    const result = await new NativeClaudeRawObserverDispatcher().run(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result.status !== 'captured') process.exitCode = 2;
} catch {
    process.stderr.write('Raw Claude observer selection, context or retention failed.\n');
    process.exitCode = 2;
}
