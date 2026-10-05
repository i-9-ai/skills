import assert from 'node:assert/strict';
import test from 'node:test';
import { NativePilotProcessRepository } from '../../../src/repository/NativePilotProcessRepository.ts';

const command = {
    executable: '/synthetic space/native',
    args: ['plugin', 'add', '/synthetic path/source'],
    timeout_ms: 90_000,
};

test('the process seam uses separate arguments, shell=false, bounded output and no environment overrides', () => {
    let seen;
    const result = new NativePilotProcessRepository().run(
        command,
        '/synthetic consumer',
        (...args) => {
            seen = args;
            return { status: 0, signal: null, stdout: 'synthetic', stderr: '' };
        },
    );
    assert.deepEqual(seen.slice(0, 2), [command.executable, command.args]);
    assert.deepEqual(seen[2], {
        cwd: '/synthetic consumer',
        shell: false,
        timeout: 90_000,
        maxBuffer: 1_048_576,
        encoding: 'utf8',
        killSignal: 'SIGKILL',
    });
    assert.equal(Object.hasOwn(seen[2], 'env'), false);
    assert.equal(result.process.status, 'completed');
});

for (const [label, raw, expected] of [
    ['nonzero', { status: 2 }, { status: 'completed', exit_code: 2, signal: null }],
    [
        'timeout with zero',
        { status: 0, error: { code: 'ETIMEDOUT' }, signal: 'SIGKILL' },
        { status: 'timeout', exit_code: 0, signal: 'SIGKILL' },
    ],
    [
        'missing binary',
        { status: 0, error: { code: 'ENOENT' } },
        { status: 'unavailable', exit_code: null, signal: null },
    ],
    [
        'interrupt',
        { status: 0, signal: 'SIGINT' },
        { status: 'interrupted', exit_code: 0, signal: 'SIGINT' },
    ],
    [
        'unknown signal',
        { status: null, signal: 'arbitrary' },
        { status: 'interrupted', exit_code: null, signal: 'other' },
    ],
    [
        'error with zero',
        { status: 0, error: { code: 'EIO' } },
        { status: 'execution-error', exit_code: 0, signal: null },
    ],
])
    test(`process classification preserves ${label} without creating success`, () => {
        assert.deepEqual(
            new NativePilotProcessRepository().run(command, '/synthetic', () => raw).process,
            expected,
        );
    });

test('output overflow and thrown execution errors expose no raw diagnostic in the process classification', () => {
    const repository = new NativePilotProcessRepository();
    const over = repository.run(command, '/synthetic', () => ({
        status: 0,
        stdout: 'x'.repeat(1_048_577),
    }));
    assert.equal(over.process.status, 'output-limit');
    assert.equal(over.stdout, '');
    assert.equal(over.stderr, '');
    const error = repository.run(command, '/synthetic', () => {
        throw new Error('/private/unrelated/path');
    });
    assert.deepEqual(error, {
        process: { status: 'execution-error', exit_code: null, signal: null },
        stdout: '',
        stderr: '',
    });
});
