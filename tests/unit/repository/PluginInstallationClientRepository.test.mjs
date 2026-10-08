import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PluginInstallationClientRepository } from '../../../src/repository/PluginInstallationClientRepository.ts';

function contractFixture(unsupported = '') {
    const clients = new PluginInstallationClientRepository({ PATH: '' });
    const calls = [];
    clients.execute = (_binary, args) => {
        calls.push(args);
        assert.equal(args.at(-1), '--help');
        const command = args.slice(0, -1).join(' ');
        if (command === unsupported) return 'Usage: native command --scope-extra';
        return 'Usage: native command --scope --json --ref';
    };
    return { clients, calls };
}

test('native capability probing checks the requested update and scoped flags before any dispatch', () => {
    const f = contractFixture('plugin update');
    const batch = [
        ['plugin', 'marketplace', 'add', 'synthetic-source', '--scope', 'project'],
        ['plugin', 'update', 'synthetic-plugin', '--scope', 'project'],
    ];
    assert.equal(f.clients.support('never-executed', 'claude', '.', batch), false);
    assert.deepEqual(f.calls.at(-1), ['plugin', 'update', '--help']);
    assert.equal(f.calls.length, 4);
});

test('native capability probing covers removal and every observation contract', () => {
    const f = contractFixture('plugin uninstall');
    assert.equal(
        f.clients.support('never-executed', 'claude', '.', [
            ['plugin', 'uninstall', 'synthetic-plugin', '--scope', 'user'],
        ]),
        false,
    );
    assert.deepEqual(f.calls, [
        ['plugin', 'list', '--help'],
        ['plugin', 'marketplace', 'list', '--help'],
        ['plugin', 'uninstall', '--help'],
    ]);
    const missingJson = contractFixture('plugin list');
    assert.equal(
        missingJson.clients.support('never-executed', 'codex', '.', [
            ['plugin', 'add', 'synthetic-plugin', '--json'],
        ]),
        false,
    );
    assert.equal(missingJson.calls.length, 1);
});

test('supported command batches are probed with help only', () => {
    const f = contractFixture();
    assert.equal(
        f.clients.support('never-executed', 'codex', '.', [
            [
                'plugin',
                'marketplace',
                'add',
                'synthetic-source',
                '--ref',
                'synthetic-ref',
                '--json',
            ],
            ['plugin', 'add', 'synthetic-plugin', '--json'],
        ]),
        true,
    );
    assert.equal(f.calls.length, 4);
});

test('Windows client discovery honors PATHEXT without POSIX execute bits and keeps batch execution manual', (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-native-windows-discovery-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const exe = join(root, 'codex.exe');
    const batch = join(root, 'claude.cmd');
    writeFileSync(exe, 'Inert executable fixture', { mode: 0o600 });
    writeFileSync(join(root, 'codex'), 'Inert extensionless POSIX wrapper', { mode: 0o600 });
    writeFileSync(batch, 'Inert batch fixture', { mode: 0o600 });
    const clients = new PluginInstallationClientRepository(
        { PATH: `relative;${root}`, PATHEXT: '.EXE;.CMD;../../escape', HOME: root },
        'win32',
    );
    assert.equal(statSync(clients.detect('codex')).ino, statSync(exe).ino);
    assert.equal(statSync(clients.detect('claude')).ino, statSync(batch).ino);
    assert.throws(() => clients.execute(batch, ['plugin', 'list', '--json'], root), /manual setup/);
    assert.equal(
        clients.support(batch, 'claude', root, [
            ['plugin', 'install', 'synthetic', '--scope', 'user'],
        ]),
        false,
    );
    const posix = new PluginInstallationClientRepository({ PATH: root }, 'linux');
    assert.equal(posix.detect('codex'), null);
});

test('Claude capability probing refuses removal when keep-data is unsupported', () => {
    const f = contractFixture();
    assert.equal(
        f.clients.support('never-executed', 'claude', '.', [
            ['plugin', 'uninstall', 'synthetic', '--scope', 'user', '--keep-data'],
        ]),
        false,
    );
});
