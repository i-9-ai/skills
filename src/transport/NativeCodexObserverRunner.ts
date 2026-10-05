// SPDX-License-Identifier: Apache-2.0
import { NativeCodexObserverDispatcher } from '../service/NativeCodexObserverDispatcher.ts';

try {
    const report = await new NativeCodexObserverDispatcher().run(process.argv.slice(2));
    process.stdout.write(JSON.stringify(report) + '\n');
    if ((report as { status: string }).status !== 'observed') process.exitCode = 2;
} catch {
    process.stderr.write('Native Codex observer preflight or retention failed.\n');
    process.exitCode = 2;
}
