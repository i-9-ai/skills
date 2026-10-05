import test from 'node:test';
import assert from 'node:assert/strict';
import { NativePilotOperatorService } from '../../../src/service/NativePilotOperatorService.ts';
import { NativePilotDockerProcessRepository } from '../../../src/repository/NativePilotDockerProcessRepository.ts';
import { containerPath } from '../../../src/validator/NativePilotContainerValidator.ts';
import { NativePilotConfiguration } from '../../../src/config/NativePilotConfiguration.ts';
import { join } from 'node:path';
import { existsSync, writeFileSync, readFileSync, cpSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { containerFixture } from '../../helpers/NativePilotContainerFixture.mjs';

const request = (phase, index) => ({
    executable: '/synthetic/pinned-docker',
    args: [
        '--host',
        'unix:///synthetic/socket',
        '--config',
        '/synthetic/owned/config',
        'container',
        'exec',
        '--user',
        '1000:1000',
        '--workdir',
        containerPath.consumer,
        '2'.repeat(64),
        containerPath.node,
        containerPath.worker,
        'execute',
        containerPath.request,
        phase,
        String(index),
    ],
    cwd: '/synthetic/owned',
    shell: false,
    timeoutMs: 1000,
    maxOutputBytes: 1024,
    signal: new AbortController().signal,
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
});

test('a caller-selected observer module is never imported or evaluated on the host', async (t) => {
    const f = containerFixture(t);
    const effect = join(f.root, 'malicious-observer-host-effect');
    writeFileSync(
        join(f.inputs.observer, f.contract.observer.entrypoint),
        `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(effect)}, 'MUST NOT EXECUTE');\n`,
    );
    f.contract.observer.tree_sha256 = f.inventory.tree(f.inputs.observer).tree_sha256;
    const current = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    f.inputs.driver = join(f.root, 'running-driver-export');
    mkdirSync(f.inputs.driver);
    cpSync(join(current, 'src'), join(f.inputs.driver, 'src'), { recursive: true });
    cpSync(join(current, 'package.json'), join(f.inputs.driver, 'package.json'));
    f.contract.driver.tree_sha256 = f.inventory.tree(f.inputs.driver).tree_sha256;
    const contract = join(f.root, 'host-safe-contract.json');
    const inputs = join(f.root, 'host-safe-inputs.json');
    const pin = join(f.root, 'host-safe-pin.json');
    const request = join(f.root, 'host-safe-request.json');
    const preparation = join(f.root, 'host-safe-preparation');
    f.put(contract, JSON.stringify(f.contract));
    f.put(inputs, JSON.stringify(f.inputs));
    f.put(pin, JSON.stringify(f.pin));
    f.put(
        request,
        JSON.stringify({
            schema_version: 1,
            contract_path: contract,
            inputs_path: inputs,
            container_pin_path: pin,
            preparation_root: preparation,
            lanes: [f.lane],
        }),
    );
    let started = 0;
    // The fake Docker path cannot pass the real pinned executable preflight.
    await new NativePilotOperatorService()
        .run(request, (host) =>
            new NativePilotDockerProcessRepository(() => {
                started++;
                throw new Error('must not start');
            }).lifecycle(host),
        )
        .catch(() => {});
    assert.equal(existsSync(effect), false);
    assert.equal(started, 0);
    assert.equal(existsSync(join(preparation, 'preparation.json')), true);
    const source = readFileSync(join(current, 'src/service/NativePilotOperatorService.ts'), 'utf8');
    assert(!source.includes('await import('));
    assert(
        source.includes(
            "import { NativePilotCommonObservationService } from './NativePilotCommonObservationService.ts'",
        ),
    );
});

test('full-lifecycle child capability supports fixed declared calls without arbitrary phase or argument escape', async () => {
    let calls = 0;
    const run = new NativePilotDockerProcessRepository((_file, _args, options, complete) => {
        assert.equal(options.shell, false);
        assert.equal(options.maxBuffer, 1024);
        assert.equal(options.killSignal, 'SIGKILL');
        calls++;
        queueMicrotask(() => complete(null, '{}', ''));
        return { pid: 1234 };
    }).lifecycle('codex');
    for (const phase of NativePilotConfiguration.phases.filter(
        (phase) => !['select-a', 'select-b', 'retain', 'cleanup-owned'].includes(phase),
    ))
        await run(request(phase, 0));
    const before = calls;
    for (const [phase, index] of [
        ['select-a', 0],
        ['retain', 0],
        ['update-b', 1],
        ['install-a', 2],
        ['unknown', 0],
        ['observe-b', 1],
    ])
        await assert.rejects(run(request(phase, index)), /only declared fixed/);
    const extra = request('baseline', 0);
    extra.args.push('--arbitrary');
    await assert.rejects(run(extra), /only declared fixed/);
    const shell = request('baseline', 0);
    shell.args[11] = '/bin/sh';
    await assert.rejects(run(shell), /only declared fixed/);
    const env = request('baseline', 0);
    env.env.CODEX_HOME = '/synthetic';
    await assert.rejects(run(env), /minimal/);
    assert.equal(calls, before);
});

test('a mismatched running driver pin is rejected before preparation or child dispatch', async (t) => {
    const f = containerFixture(t);
    const files = {
        contract: join(f.root, 'operator-contract.json'),
        inputs: join(f.root, 'operator-inputs.json'),
        pin: join(f.root, 'operator-pin.json'),
        request: join(f.root, 'operator-request.json'),
    };
    f.put(files.contract, JSON.stringify(f.contract));
    f.put(files.inputs, JSON.stringify(f.inputs));
    f.put(files.pin, JSON.stringify(f.pin));
    const destination = join(f.root, 'new-operator-preparation');
    f.put(
        files.request,
        JSON.stringify({
            schema_version: 1,
            contract_path: files.contract,
            inputs_path: files.inputs,
            container_pin_path: files.pin,
            preparation_root: destination,
            lanes: [f.lane],
        }),
    );
    let calls = 0;
    await assert.rejects(
        new NativePilotOperatorService().run(files.request, (host) =>
            new NativePilotDockerProcessRepository(() => {
                calls++;
                throw new Error('must not dispatch');
            }).lifecycle(host),
        ),
        /exact running operator/,
    );
    assert.equal(calls, 0);
    assert.equal(existsSync(destination), false);
});
