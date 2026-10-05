import test from 'node:test';
import assert from 'node:assert/strict';
import { NativePilotCommonPhaseService } from '../../../src/service/NativePilotCommonPhaseService.ts';

const selection = { run_id: 'd6d47654-6cdf-41af-b6f8-2473e6a7d063', host: 'codex', repetition: 1 };
const args = (phase, pin = null, host = 'codex') => [
    '--contract',
    '/pilot/contract.json',
    '--root',
    '/pilot',
    '--run-id',
    selection.run_id,
    '--host',
    host,
    '--repetition',
    '1',
    '--phase',
    phase,
    ...(pin ? ['--pin', pin] : []),
];
const service = new NativePilotCommonPhaseService();
const fake = (outputs = [], host = 'codex') => {
    const events = [];
    let index = 0;
    const contract = {
        schema_version: 2,
        binaries: {
            node: { version: '24.21.0' },
            codex: { version: '0.160.0' },
            claude: { version: '2.1.285' },
        },
        observer: { entrypoint: 'src/transport/SelectedObserverRunner.ts' },
    };
    const transport = {
        context: () => {
            events.push('context');
            return { contract, evidence: { mode: 'synthetic', host } };
        },
        seed: () => events.push('seed'),
        snapshot: (label) => {
            events.push(`snapshot:${label}`);
            return [
                { role: 'synthetic-only', path: `${label}.json`, bytes: 1, sha256: 'a'.repeat(64) },
            ];
        },
        run: (call) => {
            events.push(call);
            const output = outputs[index++];
            return {
                process: { status: 'completed', exit_code: 0, signal: null },
                pid: 123,
                start_ticks: null,
                stdout: { path: `${index}.stdout`, bytes: 1, sha256: 'b'.repeat(64) },
                stderr: { path: `${index}.stderr`, bytes: 0, sha256: 'c'.repeat(64) },
                text:
                    call.label === 'node-version'
                        ? 'v24.21.0\n'
                        : host === 'codex'
                          ? 'codex-cli 0.160.0\n'
                          : '2.1.285 (Claude Code)\n',
                ...output,
            };
        },
        finish: (value) => {
            events.push('finish');
            return value;
        },
    };
    return { events, transport };
};

for (const host of ['codex', 'claude'])
    test(`preflight actually requests fixed Node and ${host} versions without a placeholder pass`, async () => {
        const f = fake([], host);
        const result = await service.run(args('preflight', null, host), f.transport);
        assert.deepEqual(
            result.processes.map(({ executable, argv }) => ({ executable, argv })),
            [
                { executable: '/pilot/runtime-bin/node', argv: ['--version'] },
                { executable: `/pilot/runtime-bin/${host}`, argv: ['--version'] },
            ],
        );
        assert.equal(result.native_acceptance, false);
        assert.equal(result.result, 'observed');
        assert(!('checks' in result));
        assert(!f.events.includes('seed'));
    });

test('unknown version output or timeout stops later native calls and still captures after evidence', async () => {
    for (const value of [
        { text: 'unrecognized version\n' },
        { process: { status: 'timeout', exit_code: 0, signal: null } },
    ]) {
        const f = fake([value]);
        const result = await service.run(args('preflight'), f.transport);
        assert.equal(result.result, 'blocked');
        assert.equal(result.processes.length, 1);
        assert(f.events.includes('snapshot:after'));
        assert.equal(result.native_acceptance, false);
    }
});

test('baseline seeds once and retains real expected nonzero auth candidate before listing, without proving absence', async () => {
    const f = fake([
        { process: { status: 'completed', exit_code: 1, signal: null }, text: 'Not logged in\n' },
    ]);
    const result = await service.run(args('baseline'), f.transport);
    assert.deepEqual(f.events.slice(0, 3), ['context', 'seed', 'snapshot:before']);
    assert.deepEqual(
        result.processes.map(({ argv }) => argv),
        [
            ['login', 'status'],
            ['plugin', 'list', '--marketplace', 'i9-skills', '--json'],
            ['plugin', 'marketplace', 'list', '--json'],
        ],
    );
    assert.equal(result.processes[0].process.exit_code, 1);
    assert(
        result.unclaimed.includes('native-authentication-or-registration-from-filesystem-snapshot'),
    );
});

test('selected observer is only a fixed in-container Node command and its failure is retained', async () => {
    const f = fake([
        {
            process: { status: 'completed', exit_code: 2, signal: null },
            text: 'unsupported observation\n',
        },
    ]);
    const result = await service.run(args('observe-b', 'b'), f.transport);
    assert.equal(result.result, 'blocked');
    assert.equal(result.processes[0].executable, '/pilot/runtime-bin/node');
    assert.equal(
        result.processes[0].argv[0],
        '/pilot/input/observer/src/transport/SelectedObserverRunner.ts',
    );
    assert.equal(result.processes[0].argv.at(-1), 'b');
    assert.equal(f.events.filter((event) => event === 'seed').length, 0);
});

test('stop snapshot dispatches no guessed process or native stop command', async () => {
    const f = fake();
    const result = await service.run(args('stop-restored-a', 'restored-a'), f.transport);
    assert.deepEqual(result.processes, []);
    assert(result.unclaimed.includes('all-processes-absent-from-this-dispatcher'));
    assert.deepEqual(f.events, ['context', 'snapshot:before', 'snapshot:after', 'finish']);
});

test('unknown phases, paths, pin mismatches and extra arguments fail before any context effect', async () => {
    for (const input of [
        args('install-a', 'a'),
        args('observe-a', 'b'),
        [...args('preflight'), '--shell', 'inert'],
        args('baseline').map((arg) => (arg === '/pilot' ? '/unrelated' : arg)),
    ]) {
        const f = fake();
        await assert.rejects(service.run(input, f.transport));
        assert.deepEqual(f.events, []);
    }
});
