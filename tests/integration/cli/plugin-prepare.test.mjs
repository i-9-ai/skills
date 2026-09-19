// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
    initSkill,
    DEFAULT_LICENSE_PATH,
} from '../../../.agents/skills/skill-authoring/scripts/skill_tools.mjs';
import { syncCatalog } from '../../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';

const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'i9 plugin ')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = join(root, 'source');
    const skills = join(source, '.agents/skills');
    fs.mkdirSync(skills, { recursive: true });
    const skill = initSkill('example-skill', skills);
    fs.writeFileSync(join(source, 'AGENTS.md'), 'Use skills-catalog.json for discovery.\n');
    fs.copyFileSync(DEFAULT_LICENSE_PATH, join(source, 'LICENSE'));
    const manifest = {
        name: '@i-9-ai/skills',
        version: '1.2.3-rc.1',
        description: 'Synthetic skills.',
        homepage: 'https://example.com/skills',
        repository: { url: 'git+https://example.com/skills.git' },
        license: 'Apache-2.0',
    };
    fs.writeFileSync(join(source, 'package.json'), JSON.stringify(manifest));
    syncCatalog(source, { layout: 'repository' });
    const cli = (args = []) =>
        spawnSync(process.execPath, [launcher, 'plugin', 'prepare', '--root', source, ...args], {
            cwd: root,
            encoding: 'utf8',
            timeout: 10000,
        });
    return { root, source, skill, cli, manifest };
}

test('plugin preview is inert and explicit artifacts preserve package bytes and reproducible manifests', (t) => {
    const { root, source, skill, cli, manifest } = fixture(t);
    fs.mkdirSync(join(skill, 'scripts'));
    const script = join(skill, 'scripts/example.mjs');
    fs.writeFileSync(script, "throw new Error('candidate execution is forbidden');\n", {
        mode: 0o755,
    });
    const output = join(root, 'i9-skills');
    const preview = cli(['--output', output]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(JSON.parse(preview.stdout).written, false);
    assert.equal(fs.existsSync(output), false);
    const written = cli(['--output', output, '--write']);
    assert.equal(written.status, 0, written.stderr);
    const result = JSON.parse(written.stdout);
    assert.equal(result.packages, 1);
    assert.equal(result.manifest.version, manifest.version);
    assert.equal(result.inventory_sha256, JSON.parse(preview.stdout).inventory_sha256);
    const receipt = JSON.parse(fs.readFileSync(join(output, 'artifact-receipt.json')));
    for (const file of receipt.files) {
        const bytes = fs.readFileSync(join(output, file.path));
        assert.equal(hash(bytes), file.sha256);
        assert.equal(bytes.length, file.size);
        assert.equal(fs.statSync(join(output, file.path)).mode & 0o777, file.mode);
        if (file.path.startsWith('skills/')) {
            assert.deepEqual(bytes, fs.readFileSync(join(source, '.agents', file.path)));
        }
    }
    assert.equal(receipt.inventory_sha256, hash(Buffer.from(JSON.stringify(receipt.files))));
    assert.deepEqual(fs.readdirSync(output).sort(), [
        '.codex-plugin',
        'LICENSE',
        'artifact-receipt.json',
        'plugin.json',
        'skills',
    ]);
    const portable = JSON.parse(fs.readFileSync(join(output, 'plugin.json')));
    const compatibility = JSON.parse(fs.readFileSync(join(output, '.codex-plugin/plugin.json')));
    assert.equal(portable.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    assert.equal(compatibility.skills, './skills/');
    for (const field of ['name', 'version', 'author', 'homepage', 'repository', 'license']) {
        assert.deepEqual(portable[field], compatibility[field]);
    }
    assert.equal(compatibility.hooks, undefined);
    assert.equal(compatibility.mcpServers, undefined);
    assert.equal(portable.extensions, undefined);
    const marketplace = JSON.parse(
        fs.readFileSync(new URL('../../../docs/examples/plugin-marketplace.json', import.meta.url)),
    );
    assert.equal(marketplace.plugins.length, 1);
    assert.equal(marketplace.plugins[0].name, portable.name);
    assert.equal(marketplace.plugins[0].source.path, './plugins/' + portable.name);
    assert.deepEqual(marketplace.plugins[0].policy, {
        installation: 'AVAILABLE',
        authentication: 'ON_INSTALL',
    });
    const before = fs.readFileSync(join(output, 'artifact-receipt.json'));
    assert.notEqual(cli(['--output', output, '--write']).status, 0);
    assert.deepEqual(fs.readFileSync(join(output, 'artifact-receipt.json')), before);
});

test('plugin source preflight rejects unsafe assets, stale catalogs and malformed identity before writing', (t) => {
    const { root, source, skill, cli, manifest } = fixture(t);
    const output = join(root, 'i9-skills');
    const asset = join(skill, 'linked.txt');
    const sentinel = join(root, 'sentinel');
    fs.writeFileSync(sentinel, 'preserve');
    for (const link of [fs.symlinkSync, fs.linkSync]) {
        link(sentinel, asset);
        assert.notEqual(cli(['--output', output, '--write']).status, 0);
        assert.equal(fs.existsSync(output), false);
        fs.unlinkSync(asset);
    }
    const fifo = spawnSync('mkfifo', [asset], { encoding: 'utf8', timeout: 2000 });
    assert.equal(fifo.status, 0, fifo.stderr);
    assert.notEqual(cli(['--output', output, '--write']).status, 0);
    assert.equal(fs.existsSync(output), false);
    fs.unlinkSync(asset);
    for (const version of ['1.2', '01.2.3', '1.2.3-01', '1.2.3\n']) {
        fs.writeFileSync(join(source, 'package.json'), JSON.stringify({ ...manifest, version }));
        assert.notEqual(cli(['--output', output, '--write']).status, 0, version);
        assert.equal(fs.existsSync(output), false);
    }
    fs.writeFileSync(join(source, 'package.json'), JSON.stringify(manifest));
    fs.writeFileSync(join(source, 'skills-catalog.json'), '{}\n');
    assert.notEqual(cli(['--output', output, '--write']).status, 0);
    assert.equal(fs.existsSync(output), false);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve');
});

test('plugin output refuses occupied or linked locations and known host discovery paths', (t) => {
    const { root, cli } = fixture(t);
    const occupied = join(root, 'i9-skills');
    fs.writeFileSync(occupied, 'preserve');
    assert.notEqual(cli(['--output', occupied, '--write']).status, 0);
    assert.equal(fs.readFileSync(occupied, 'utf8'), 'preserve');
    fs.unlinkSync(occupied);
    fs.symlinkSync(join(root, 'source'), occupied);
    assert.notEqual(cli(['--output', occupied, '--write']).status, 0);
    fs.unlinkSync(occupied);
    fs.symlinkSync(root, join(root, 'alias'));
    assert.notEqual(cli(['--output', join(root, 'alias/i9-skills'), '--write']).status, 0);
    for (const target of [
        '.agents/skills',
        '.agents/plugins',
        '.codex/plugins',
        '.claude/plugins',
        '.system',
    ]) {
        const parent = join(root, target);
        fs.mkdirSync(parent, { recursive: true });
        assert.notEqual(cli(['--output', join(parent, 'i9-skills'), '--write']).status, 0);
        assert.deepEqual(fs.readdirSync(parent), []);
    }
});

test('plugin CLI documents explicit staging and rejects incomplete or unknown options', (t) => {
    const { cli, root } = fixture(t);
    assert.match(cli(['--help']).stdout, /--write/);
    assert.notEqual(cli().status, 0);
    assert.notEqual(cli(['--output', join(root, 'wrong-name')]).status, 0);
    assert.notEqual(cli(['--output', join(root, 'i9-skills'), '--install']).status, 0);
});
