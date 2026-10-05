// SPDX-License-Identifier: Apache-2.0
import { pathToFileURL } from 'node:url';
import { NativePilotContainerWorkerRepository } from '../repository/NativePilotContainerWorkerRepository.ts';
import { containerLimits, requireContainer } from '../validator/NativePilotContainerValidator.ts';

/** Explicit container-only entrypoint. No ambient/default native dispatch on import. */
export async function runNativePilotContainerWorker(args: string[]) {
    const [operation, path, phase, index] = args;
    requireContainer(
        ['idle', 'probe', 'audit', 'execute', 'export'].includes(operation) &&
            args.length === (operation === 'execute' ? 4 : operation === 'probe' ? 3 : 2),
        'Unknown fixed worker operation.',
    );
    const worker = NativePilotContainerWorkerRepository.load(path);
    if (operation === 'idle') {
        requireContainer(
            process.platform === 'linux' &&
                process.getuid?.() === worker.request.account.uid &&
                process.env.HOME === worker.request.account.home &&
                !('CODEX_HOME' in process.env),
            'Idle worker is outside selected container account.',
        );
        const interval = setInterval(() => {}, 1000);
        process.once('SIGTERM', () => {
            clearInterval(interval);
        });
        return;
    }
    if (operation === 'probe')
        requireContainer(
            ['fresh', 'existing'].includes(phase),
            'Probe freshness must be explicit.',
        );
    const result =
        operation === 'probe'
            ? await worker.probe(phase === 'fresh')
            : operation === 'audit'
              ? await worker.audit()
              : operation === 'export'
                ? await worker.export()
                : worker.execute(phase, Number(index));
    const text = JSON.stringify(result);
    requireContainer(
        Buffer.byteLength(text) <=
            (operation === 'export'
                ? containerLimits.retention_output
                : operation === 'execute'
                  ? containerLimits.worker_output_bytes
                  : containerLimits.output_bytes),
        'Worker result exceeded fixed bound.',
    );
    process.stdout.write(`${text}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runNativePilotContainerWorker(process.argv.slice(2)).catch(() => {
        process.stderr.write('Native pilot container worker blocked; no fallback attempted.\n');
        process.exitCode = 1;
    });
}
