// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PluginPanelRuntimeRepository } from '../../../src/repository/PluginPanelRuntimeRepository.ts';
import { ProjectConfiguration } from '../../../src/config/ProjectConfiguration.ts';

function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'i9-panel-runtime-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const write = (path, value) => {
        const file = join(root, path);
        fs.mkdirSync(join(file, '..'), { recursive: true });
        fs.writeFileSync(file, value);
    };
    write(
        'package.json',
        JSON.stringify({
            name: '@i-9.ai/skills',
            version: '1.0.0',
            type: 'module',
            license: 'Apache-2.0',
            repository: { url: 'https://github.com/i-9-ai/skills' },
            dependencies: { yaml: '2.9.1' },
        }),
    );
    write('skills-catalog.json', '{}');
    write('dist/transport/PluginMcpServer.js', 'throw new Error("Inert fixture must never run");');
    write('dist/unrelated.txt', 'Never included');
    write('assets/skill-panel.html', '<!doctype html><title>Fixture</title>');
    write('assets/skill-panel-icon.svg', '<svg/>');
    write('node_modules/yaml/package.json', JSON.stringify({ name: 'yaml', version: '2.9.1' }));
    write('node_modules/yaml/LICENSE', 'Synthetic license sentinel');
    const config = new ProjectConfiguration({ root });
    const packages = [
        { path: 'skills/example/SKILL.md', bytes: Buffer.from('fixture'), mode: 0o644 },
    ];
    new PluginPanelRuntimeRepository().capture(config, packages);
    return {
        root,
        config,
        write,
        read: () => new PluginPanelRuntimeRepository().read(config, packages),
    };
}

test('panel runtime retains compiled resources, portable helpers and pinned dependency without execution', (t) => {
    const f = fixture(t);
    const files = f.read();
    assert(files.some((file) => file.path === 'runtime/dist/transport/PluginMcpServer.js'));
    assert(files.some((file) => file.path === 'runtime/.agents/skills/example/SKILL.md'));
    assert(files.some((file) => file.path === 'runtime/node_modules/yaml/LICENSE'));
    assert(!files.some((file) => file.path.endsWith('unrelated.txt')));
    assert.equal(
        JSON.parse(files.find((file) => file.path === 'runtime/package.json').bytes).repository.url,
        'https://github.com/i-9-ai/skills',
    );
    assert(files.every((file) => !file.path.includes(f.root)));
});

test('removed imported modules and stale source or assets invalidate the successful build inventory', (t) => {
    const f = fixture(t);
    const receipt = join(f.root, 'dist/panel-runtime-receipt.json');
    f.write('dist/service/SkillPanelService.js', 'export const service = true;');
    f.write('dist/transport/PluginMcpServer.js', 'import "../service/SkillPanelService.js";');
    f.write('src/transport/PluginMcpServer.ts', 'import "../service/SkillPanelService.ts";');
    fs.rmSync(receipt);
    new PluginPanelRuntimeRepository().capture(f.config, [
        { path: 'skills/example/SKILL.md', bytes: Buffer.from('fixture'), mode: 0o644 },
    ]);
    assert(f.read().length > 0);
    fs.rmSync(join(f.root, 'dist/service/SkillPanelService.js'));
    assert.throws(f.read, /incomplete or stale/);
    f.write('dist/service/SkillPanelService.js', 'export const service = true;');
    f.write('src/transport/PluginMcpServer.ts', 'export const changed = true;');
    assert.throws(f.read, /incomplete or stale/);
    f.write('src/transport/PluginMcpServer.ts', 'import "../service/SkillPanelService.ts";');
    f.write('assets/skill-panel.html', '<!doctype html><title>Changed</title>');
    assert.throws(f.read, /incomplete or stale/);
});

test('missing build receipt and incomplete pinned YAML cannot become retained runtimes', (t) => {
    const f = fixture(t);
    const license = join(f.root, 'node_modules/yaml/LICENSE');
    fs.rmSync(license);
    assert.throws(f.read, /incomplete or stale/);
    f.write('node_modules/yaml/LICENSE', 'Synthetic license sentinel');
    fs.rmSync(join(f.root, 'dist/panel-runtime-receipt.json'));
    assert.throws(f.read);
});

test('missing compiled entrypoint and mismatched or transitive YAML fail before emission', (t) => {
    const f = fixture(t);
    const entry = fs.readFileSync(join(f.root, 'dist/transport/PluginMcpServer.js'));
    fs.rmSync(join(f.root, 'dist/transport/PluginMcpServer.js'));
    assert.throws(f.read, /Build the compiled panel runtime/);
    f.write('dist/transport/PluginMcpServer.js', entry);
    for (const manifest of [
        { name: 'yaml', version: '2.0.0' },
        { name: 'yaml', version: '2.9.1', dependencies: { unexpected: '1.0.0' } },
    ]) {
        f.write('node_modules/yaml/package.json', JSON.stringify(manifest));
        assert.throws(f.read, /pinned local YAML/);
    }
});

test('linked dependency directories and compiled files are rejected rather than followed', (t) => {
    const f = fixture(t);
    const yaml = join(f.root, 'node_modules/yaml');
    fs.renameSync(yaml, yaml + '-ordinary');
    fs.symlinkSync('yaml-ordinary', yaml);
    assert.throws(f.read, /real directory|symlink/);
    fs.unlinkSync(yaml);
    fs.renameSync(yaml + '-ordinary', yaml);
    fs.symlinkSync('PluginMcpServer.js', join(f.root, 'dist/transport/alias.js'));
    assert.throws(f.read, /symlink/);
});
