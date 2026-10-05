import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
    cpSync,
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    existsSync,
    realpathSync,
    rmSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

test('clean compiled consumer uses only dist JavaScript for fixed worker and common observer paths', async (t) => {
    const source = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    const consumer = realpathSync(mkdtempSync(join(tmpdir(), 'i9-native-compiled-fixture-')));
    t.after(() => rmSync(consumer, { recursive: true, force: true }));
    const compiler =
        process.env.I9_NATIVE_PILOT_TSC ??
        createRequire(import.meta.url).resolve('typescript/bin/tsc');
    mkdirSync(join(consumer, 'dist'));
    writeFileSync(join(consumer, 'package.json'), '{"type":"module","private":true}\n');
    execFileSync(
        'rtk',
        [
            'proxy',
            process.execPath,
            compiler,
            '--project',
            join(source, 'tsconfig.build.json'),
            '--outDir',
            join(consumer, 'dist'),
            '--typeRoots',
            join(dirname(dirname(dirname(compiler))), '@types'),
        ],
        { cwd: source, timeout: 30_000, maxBuffer: 1_048_576, shell: false },
    );
    assert.equal(existsSync(join(consumer, 'src')), false);
    const { NativePilotConfiguration } = await import(
        pathToFileURL(join(consumer, 'dist/config/NativePilotConfiguration.js'))
    );
    const { containerPath } = await import(
        pathToFileURL(join(consumer, 'dist/validator/NativePilotContainerValidator.js'))
    );
    const { NativePilotPlanService } = await import(
        pathToFileURL(join(consumer, 'dist/service/NativePilotPlanService.js'))
    );
    const { NativePilotOperatorService } = await import(
        pathToFileURL(join(consumer, 'dist/service/NativePilotOperatorService.js'))
    );
    const { NativePilotInventoryRepository } = await import(
        pathToFileURL(join(consumer, 'dist/repository/NativePilotInventoryRepository.js'))
    );
    const inventory = new NativePilotInventoryRepository();
    const entrypoint = 'dist/service/NativePilotOperatorService.js';
    assert.throws(
        () =>
            inventory.verifyRunningExport(
                consumer,
                inventory.tree(consumer).tree_sha256,
                consumer,
                entrypoint,
            ),
        /complete bundled closure/,
    );
    writeFileSync(
        join(consumer, 'dist/source-receipt.json'),
        '{"synthetic":true,"purpose":"byte-identity-fixture"}\n',
    );
    const selected = realpathSync(mkdtempSync(join(tmpdir(), 'i9-native-compiled-export-')));
    t.after(() => rmSync(selected, { recursive: true, force: true }));
    cpSync(consumer, selected, { recursive: true });
    const pinned = inventory.tree(selected).tree_sha256;
    assert.equal(
        inventory.verifyRunningExport(selected, pinned, consumer, entrypoint).tree_sha256,
        pinned,
    );
    writeFileSync(
        join(consumer, 'dist/source-receipt.json'),
        '{"synthetic":true,"changed":true}\n',
    );
    assert.throws(
        () => inventory.verifyRunningExport(selected, pinned, consumer, entrypoint),
        /Running driver bytes differ/,
    );
    assert.equal(NativePilotConfiguration.runtime_layout, 'compiled-js');
    assert.equal(
        containerPath.worker,
        '/pilot/input/driver/dist/transport/NativePilotContainerWorkerRunner.js',
    );
    const plan = new NativePilotPlanService().plan(
        {
            root: '/pilot',
            contract: { observer: { entrypoint: 'dist/transport/SelectedRunner.js' } },
        },
        { run_id: 'd6d47654-6cdf-41af-b6f8-2473e6a7d063', host: 'codex', repetition: 1 },
        'disposable-container-v1',
    );
    assert.equal(
        plan[0].commands[0].args[0],
        '/pilot/input/driver/dist/transport/NativePilotCommonObserverRunner.js',
    );
    assert.equal(
        plan.find((step) => step.id === 'retain').commands[0].args[0],
        containerPath.worker,
    );
    assert(!JSON.stringify(plan).includes('/src/'));
    let started = 0;
    await assert.rejects(
        new NativePilotOperatorService().run('relative-invalid-request', () => {
            started++;
        }),
        /canonical absolute operator request/,
    );
    assert.equal(started, 0);
});
