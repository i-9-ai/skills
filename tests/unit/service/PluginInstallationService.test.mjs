import assert from 'node:assert/strict';
import test from 'node:test';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillInstallationConfiguration } from '../../../src/config/SkillInstallationConfiguration.ts';
import { SkillInstallationRepository } from '../../../src/repository/SkillInstallationRepository.ts';
import { PluginInstallationClientRepository } from '../../../src/repository/PluginInstallationClientRepository.ts';
import { PluginInstallationService } from '../../../src/service/PluginInstallationService.ts';

function fixture(t, host, global = true) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-native-install-fixture-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = join(root, 'home');
    const project = join(root, 'project');
    mkdirSync(home);
    mkdirSync(project);
    const configuration = new SkillInstallationConfiguration(
        global ? { global: true, environment: { HOME: home } } : { project },
    );
    const clients = new PluginInstallationClientRepository({ HOME: home, PATH: '' });
    const state = new SkillInstallationRepository(configuration);
    const calls = [];
    let current = null;
    let version = '1.0.0';
    let revision = 'a'.repeat(40);
    let fail = false;
    let supported = true;
    let enabled = true;
    let marketplace = false;
    const seed = (selectedVersion = version) => {
        const path = join(home, `.${host}/plugins/cache/i9-skills/i9-skills`, selectedVersion);
        mkdirSync(path, { recursive: true });
        writeFileSync(
            join(path, 'plugin.json'),
            JSON.stringify({ name: 'i9-skills', version: selectedVersion }),
        );
        writeFileSync(join(path, 'resource.md'), `Inert resource ${selectedVersion}\n`);
        current = { path, version: selectedVersion };
    };
    clients.detect = (name) =>
        name === host ? join(root, 'synthetic-native-client-never-executed') : null;
    clients.support = () => supported;
    clients.execute = (_binary, args) => {
        if (args[1] === 'marketplace' && args[2] === 'list')
            return JSON.stringify(
                host === 'codex'
                    ? { marketplaces: marketplace ? [{ name: 'i9-skills', root }] : [] }
                    : marketplace
                      ? [{ name: 'i9-skills' }]
                      : [],
            );
        if (args[1] === 'list') {
            const row = current
                ? host === 'codex'
                    ? {
                          pluginId: 'i9-skills@i9-skills',
                          name: 'i9-skills',
                          marketplaceName: 'i9-skills',
                          installed: true,
                          enabled,
                          version: current.version,
                          source: { source: 'local', path: current.path },
                          marketplaceSource: {
                              sourceType: 'git',
                              source: 'https://github.com/i-9-ai/skills.git',
                          },
                      }
                    : {
                          id: 'i9-skills@i9-skills',
                          enabled,
                          scope: global ? 'user' : 'project',
                          projectPath: project,
                          version: current.version,
                          installPath: current.path,
                      }
                : null;
            return JSON.stringify(
                host === 'codex'
                    ? { installed: row ? [row] : [], available: [] }
                    : row
                      ? [row]
                      : [],
            );
        }
        calls.push(args);
        if (fail) throw new Error('Synthetic native refusal');
        if (args[1] === 'marketplace' && args[2] === 'add') marketplace = true;
        if (['add', 'install', 'update'].includes(args[1])) seed();
        if (['remove', 'uninstall'].includes(args[1])) current = null;
        return '{}';
    };
    const service = new PluginInstallationService(configuration, clients, state, () => ({
        package_version: version,
        resolved_git_sha: revision,
    }));
    return {
        root,
        home,
        project,
        configuration,
        clients,
        state,
        service,
        calls,
        seed,
        current: () => current,
        fail: (value) => {
            fail = value;
        },
        supported: (value) => {
            supported = value;
        },
        enabled: (value) => {
            enabled = value;
        },
        version: (value) => {
            version = value;
            revision = 'b'.repeat(40);
        },
    };
}

for (const host of ['codex', 'claude']) {
    test(`${host} uses one native backend with explicit preview, cache ownership and retained removal bytes`, (t) => {
        const f = fixture(t, host);
        assert.equal(f.service.run('install', host).status, 'preview');
        assert.equal(f.calls.length, 0);
        assert.equal(existsSync(f.configuration.root), false);
        const installed = f.service.run('install', host, true);
        assert.equal(installed.written, true);
        assert.equal(existsSync(f.configuration.skills), false);
        assert.equal(f.service.run('install', host, true).status, 'unchanged');
        const before = f.calls.length;
        f.version('2.0.0');
        assert.equal(f.service.run('upgrade', host, true).installed_version, '2.0.0');
        assert.equal(f.calls.length, before + 2);
        const removed = f.service.run('uninstall', host, true);
        assert.equal(removed.installed, false);
        assert.equal(f.state.nativeState(host), null);
        assert.equal(
            f.calls.some((args) => args.includes('marketplace') && args.includes('remove')),
            false,
        );
        assert.equal(existsSync(join(f.configuration.state, 'native-preimage')), true);
        assert.equal(f.service.run('uninstall', host, true).status, 'absent');
    });

    test(`${host} does not adopt unowned plugins or overwrite cache customizations`, (t) => {
        const f = fixture(t, host);
        f.seed();
        assert.equal(f.service.run('install', host, true).status, 'unmanaged');
        assert.equal(f.calls.length, 0);
        assert.equal(existsSync(f.configuration.state), false);
        rmSync(f.current().path, { recursive: true });
        // Clear the simulated native registry without invoking the real client.
        f.clients.execute('synthetic', ['plugin', host === 'codex' ? 'remove' : 'uninstall']);
        f.service.run('install', host, true);
        writeFileSync(join(f.current().path, 'resource.md'), 'Local customization');
        const calls = f.calls.length;
        f.version('2.0.0');
        assert.throws(() => f.service.run('upgrade', host, true), /bytes or client changed/);
        assert.equal(f.calls.length, calls);
        assert.equal(
            readFileSync(join(f.current().path, 'resource.md'), 'utf8'),
            'Local customization',
        );
    });

    test(`${host} retains a native pending journal on failure and never treats manual recovery as completion`, (t) => {
        const f = fixture(t, host);
        f.service.run('install', host, true);
        f.version('2.0.0');
        f.fail(true);
        assert.throws(() => f.service.run('upgrade', host, true), /Synthetic native refusal/);
        const pending = f.state.nativeState(host, true);
        assert.equal(pending.completed_commands, 0);
        assert.equal(
            readFileSync(join(pending.retention, 'resource.md'), 'utf8'),
            'Inert resource 1.0.0\n',
        );
        assert.equal(f.service.run('recover', host, true).status, 'manual-required');
        assert.equal(f.service.run('upgrade', host, true).written, false);
    });
}

test('Codex project setup and unsupported client contracts return manual steps without changing scope', (t) => {
    const project = fixture(t, 'codex', false);
    assert.equal(project.service.run('install', 'codex', true).status, 'manual-required');
    assert.equal(project.calls.length, 0);
    assert.equal(existsSync(project.configuration.root), false);
    const unsupported = fixture(t, 'claude');
    unsupported.supported(false);
    assert.equal(unsupported.service.run('install', 'claude', true).status, 'manual-required');
    assert.equal(unsupported.calls.length, 0);
});

test('Claude project setup scopes both marketplace and plugin commands to that selected project', (t) => {
    const f = fixture(t, 'claude', false);
    assert.equal(f.service.run('install', 'claude', true).written, true);
    for (const args of f.calls) assert.equal(args[args.indexOf('--scope') + 1], 'project');
});

test('an upgrade never re-enables a disabled plugin implicitly', (t) => {
    const f = fixture(t, 'codex');
    f.enabled(false);
    f.service.run('install', 'codex', true);
    const before = f.calls.length;
    f.version('2.0.0');
    assert.equal(f.service.run('upgrade', 'codex', true).status, 'manual-required');
    assert.equal(f.calls.length, before);
});
