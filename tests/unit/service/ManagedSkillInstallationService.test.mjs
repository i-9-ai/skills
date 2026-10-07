import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillInstallationConfiguration } from '../../../src/config/SkillInstallationConfiguration.ts';
import { SkillInstallationRepository } from '../../../src/repository/SkillInstallationRepository.ts';
import { PluginInstallationClientRepository } from '../../../src/repository/PluginInstallationClientRepository.ts';
import { ManagedSkillInstallationService } from '../../../src/service/ManagedSkillInstallationService.ts';

test('auto recovery keeps native pending state authoritative over a shared stale lock', (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-backend-routing-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const configuration = new SkillInstallationConfiguration({ project: root });
    const state = new SkillInstallationRepository(configuration);
    state.directory(configuration.state, true);
    state.publishNative(
        'codex',
        { schema_version: 1, id: 'synthetic-interrupted-native', root: configuration.root },
        true,
    );
    const lock = join(configuration.state, 'lock.json');
    writeFileSync(lock, JSON.stringify({ pid: 2147483647, nonce: 'synthetic-stale-native-owner' }));
    const clients = new PluginInstallationClientRepository({ HOME: root, PATH: '' });
    const result = new ManagedSkillInstallationService(clients).run('recover', {
        project: root,
        global: false,
        write: true,
        strategy: 'auto',
    });
    assert.equal(result.strategy, 'plugin');
    assert.equal(result.status, 'manual-required');
    assert.equal(result.written, false);
    assert.equal(existsSync(lock), true);
    assert.ok(state.nativeState('codex', true));
});
