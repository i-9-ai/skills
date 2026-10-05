import test from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtempSync,
    chmodSync,
    existsSync,
    readFileSync,
    readdirSync,
    realpathSync,
    rmSync,
    writeFileSync,
    unlinkSync,
    symlinkSync,
    linkSync,
    lstatSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NativePilotNpmEnvironmentRepository } from '../../../src/repository/NativePilotNpmEnvironmentRepository.ts';
import { NativePilotContainerWorkerRepository } from '../../../src/repository/NativePilotContainerWorkerRepository.ts';
import { containerFixture } from '../../helpers/NativePilotContainerFixture.mjs';

function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-offline-npm-fixture-')));
    chmodSync(root, 0o700);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const selected = join(root, 'npm');
    return {
        root,
        selected,
        repo: new NativePilotNpmEnvironmentRepository(selected),
        env: {
            HOME: join('/', 'home', 'node'),
            PATH: '/pilot/runtime-bin:/usr/local/bin:/usr/bin:/bin',
        },
    };
}
test('fresh owned preparation has distinct empty configs/cache and idempotently preserves normal home and prior cache logs', (t) => {
    const f = fixture(t);
    const envBefore = structuredClone(f.env);
    const first = f.repo.prepare(f.env);
    assert.deepEqual(f.env, envBefore);
    assert.equal(first.environment.HOME, f.env.HOME);
    assert(!Object.hasOwn(first.environment, 'CODEX_HOME'));
    assert.equal(first.environment.NPM_CONFIG_OFFLINE, 'true');
    assert.equal(first.environment.NPM_CONFIG_IGNORE_SCRIPTS, 'true');
    assert.notEqual(
        first.environment.NPM_CONFIG_USERCONFIG,
        first.environment.NPM_CONFIG_GLOBALCONFIG,
    );
    assert.equal(readFileSync(join(f.selected, 'user.npmrc')).length, 0);
    assert.equal(readFileSync(join(f.selected, 'global.npmrc')).length, 0);
    assert.notEqual(
        lstatSync(join(f.selected, 'user.npmrc')).ino,
        lstatSync(join(f.selected, 'global.npmrc')).ino,
    );
    assert.deepEqual(first.evidence.cache.entries, []);
    assert.equal(first.evidence.native_acceptance, false);
    const original = readFileSync(join(f.selected, 'preparation.json'));
    writeFileSync(join(f.selected, 'cache', 'synthetic-log'), 'offline missing-cache warning\n', {
        mode: 0o600,
    });
    const next = f.repo.prepare(first.environment);
    assert.deepEqual(readFileSync(join(f.selected, 'preparation.json')), original);
    assert.equal(next.evidence.cache.entries.length, 1);
    assert.equal(
        readFileSync(join(f.selected, 'cache', 'synthetic-log'), 'utf8'),
        'offline missing-cache warning\n',
    );
});

for (const [label, mutate] of Object.entries({
    'changed config': (f) => writeFileSync(join(f.selected, 'user.npmrc'), 'unexpected=true\n'),
    'configuration symlink': (f) => {
        unlinkSync(join(f.selected, 'user.npmrc'));
        symlinkSync(join(f.selected, 'global.npmrc'), join(f.selected, 'user.npmrc'));
    },
    'shared hardlink': (f) => {
        unlinkSync(join(f.selected, 'user.npmrc'));
        linkSync(join(f.selected, 'global.npmrc'), join(f.selected, 'user.npmrc'));
    },
    'unowned entry': (f) => writeFileSync(join(f.selected, 'unexpected'), 'preserve me'),
    'changed receipt': (f) => writeFileSync(join(f.selected, 'preparation.json'), '{}\n'),
    'writable other account': (f) => chmodSync(join(f.selected, 'cache'), 0o777),
}))
    test(`offline preparation rejects ${label} without repair or reset`, (t) => {
        const f = fixture(t);
        f.repo.prepare(f.env);
        mutate(f);
        const before = readdirSync(f.selected).sort();
        assert.throws(() => f.repo.prepare(f.env));
        assert.deepEqual(readdirSync(f.selected).sort(), before);
    });

test('unknown, lowercase, partial or weakened npm settings reject before filesystem preparation', (t) => {
    for (const extra of [
        { NPM_CONFIG_OFFLINE: 'false' },
        { npm_config_offline: 'true' },
        { NPM_CONFIG_CACHE: '/unowned/cache' },
        {
            ...NativePilotNpmEnvironmentRepository.additions,
            NPM_CONFIG_REGISTRY: 'https://example.invalid',
        },
    ]) {
        const f = fixture(t);
        assert.throws(() => f.repo.prepare({ ...f.env, ...extra }));
        assert.equal(existsSync(f.selected), false);
    }
});

test('install descendants receive the selected recipe through shell-free worker options, with retained preparation metadata', (t) => {
    const f = containerFixture(t);
    f.controller.files.stage();
    const request = structuredClone(f.controller.files.request);
    request.selection.host = 'claude';
    const npm = fixture(t);
    const prepared = npm.repo.prepare(npm.env);
    const calls = [];
    const worker = new NativePilotContainerWorkerRepository(
        request,
        (executable, args, options) => {
            calls.push({ executable, args, options });
            return {
                status: 0,
                signal: null,
                stdout: 'synthetic install only',
                stderr: 'ENOTCACHED synthetic warning',
            };
        },
    );
    worker.context = () => ({ synthetic: true });
    worker.nativeEnvironment = () => prepared;
    const result = worker.execute('install-a', 2);
    assert.equal(calls[0].executable, '/pilot/runtime-bin/claude');
    assert.deepEqual(calls[0].args, [
        'plugin',
        'install',
        'i9-skills@i9-skills',
        '--scope',
        'user',
        '--json',
    ]);
    assert.equal(calls[0].options.shell, false);
    assert.equal(calls[0].options.env.HOME, npm.env.HOME);
    for (const [key, value] of Object.entries(NativePilotNpmEnvironmentRepository.additions))
        assert.equal(calls[0].options.env[key], value);
    assert.equal(result.npm_environment.preparation_sha256, prepared.evidence.preparation_sha256);
    assert.equal(result.stderr, 'ENOTCACHED synthetic warning');
});
