// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { strictJson as catalogJson, validateCatalogData as catalogData } from '../../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';
import { strictJson as indexJson, validateCatalogData as indexData } from '../../../.agents/skills/skills-catalog-index/scripts/catalog_data.mjs';

const PACKAGE = fileURLToPath(new URL('../../../.agents/skills/skills-catalog-index/', import.meta.url));

function permissions(directory, writable) {
    if (writable) fs.chmodSync(directory, 0o755);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) permissions(filename, writable);
        else fs.chmodSync(filename, writable ? 0o644 : 0o444);
    }
    if (!writable) fs.chmodSync(directory, 0o555);
}

function snapshot(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).map(entry => {
        const filename = path.join(directory, entry.name);
        assert.equal(entry.isSymbolicLink(), false);
        return [entry.name, entry.isDirectory() ? snapshot(filename) : fs.readFileSync(filename)];
    });
}

function execute(helper, args, cwd) {
    const result = spawnSync(process.execPath, [helper, ...args], {
        cwd, encoding: 'utf8', timeout: 10_000, maxBuffer: 256 * 1024,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

test('standalone catalog index runs documented examples with no writable package or siblings', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-index-distribution-'));
    t.after(() => { permissions(root, true); fs.rmSync(root, { recursive: true, force: true }); });
    const installation = path.join(root, 'isolated', 'skills-catalog-index');
    fs.cpSync(PACKAGE, installation, { recursive: true });
    const before = snapshot(installation);
    permissions(installation, false);
    const caller = path.join(root, 'unrelated-caller');
    fs.mkdirSync(caller);
    const helper = path.join(installation, 'scripts/aggregate_index.mjs');
    const sources = ['alpha', 'beta'].flatMap(id => ['--source', `${id}=${path.join(installation, 'examples', id, 'skills-catalog.json')}`]);
    const output = path.join(caller, 'sqlite');

    const baseline = execute(helper, ['rebuild', ...sources, '--output', output, '--format', 'sqlite'], caller);
    assert.equal(baseline.sources, 2);
    assert.equal(baseline.skills, 2);
    const matches = execute(helper, ['query', '--index', baseline.index, '--name', 'catalog-example'], caller);
    assert.deepEqual(matches.map(item => item.source_id), ['alpha', 'beta']);
    execute(helper, ['sync', ...sources, '--output', output, '--format', 'sqlite'], caller);
    const history = execute(helper, ['history', '--index', baseline.index, '--limit', '2'], caller);
    assert.equal(history.length, 2);
    const changes = execute(helper, ['changes', '--index', baseline.index, '--name', 'catalog-example'], caller);
    assert.equal(changes.length, 2, 'the second unchanged observation adds no skill changes');

    const jsonOutput = path.join(caller, 'json');
    const json = execute(helper, ['rebuild', ...sources, '--output', jsonOutput, '--format', 'json'], caller);
    const jsonBytes = fs.readFileSync(json.index);
    execute(helper, ['rebuild', ...sources, '--output', jsonOutput, '--format', 'json'], caller);
    assert.deepEqual(fs.readFileSync(json.index), jsonBytes);
    assert.deepEqual(execute(helper, ['query', '--index', json.index, '--name', 'catalog-example'], caller), matches);

    const alias = path.join(root, 'index-skill-alias');
    fs.symlinkSync(installation, alias, 'dir');
    assert.deepEqual(execute(path.join(alias, 'scripts/aggregate_index.mjs'),
        ['query', '--index', json.index, '--name', 'catalog-example'], caller), matches);
    fs.unlinkSync(alias);

    assert.deepEqual(snapshot(installation), before);
    assert.deepEqual(fs.readdirSync(path.dirname(installation)), ['skills-catalog-index']);
    assert.equal(fs.existsSync(path.join(installation, 'scripts/catalog_tools.mjs')), false);
});

test('independently bundled catalog decoders accept the same public schema and reject ambiguity', () => {
    const valid = JSON.parse(fs.readFileSync(path.join(PACKAGE, 'examples/alpha/skills-catalog.json'), 'utf8'));
    const global = JSON.parse(fs.readFileSync(path.join(PACKAGE, 'examples/beta/skills-catalog.json'), 'utf8'));
    for (const value of [valid, global]) {
        const bytes = Buffer.from(JSON.stringify(value));
        assert.deepEqual(catalogData(catalogJson(bytes)), indexData(indexJson(bytes)));
    }
    const variants = [
        { ...valid, extra: true },
        { ...valid, schema_version: 2 },
        { ...valid, skills: [] },
        { ...valid, skills: [...valid.skills, ...valid.skills] },
        { ...valid, skills: [{ ...valid.skills[0], path: 'skills/../catalog-example' }] },
        { ...valid, skills: [{ ...valid.skills[0], description: ' Leading space' }] },
        { ...valid, skills: [{ ...valid.skills[0], tags: ['z', 'a'] }] },
        { ...valid, skills: [{ ...valid.skills[0], tags: ['a', 'a'] }] },
    ];
    const malformed = [
        '{"schema_version":1,"skills":[],"skills":[]}',
        '{"schema_version":1,"schema_versi\\u006fn":1,"skills":[]}',
        '{"value":"\\ud800"}',
        '{"value":1e999}',
        '['.repeat(66) + '0' + ']'.repeat(66),
    ];
    for (const value of variants) {
        assert.throws(() => catalogData(value));
        assert.throws(() => indexData(value));
    }
    for (const value of malformed) {
        assert.throws(() => catalogJson(Buffer.from(value)));
        assert.throws(() => indexJson(Buffer.from(value)));
    }
});
