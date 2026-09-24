import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyAliases } from '../../../.agents/skills/skills-host-compatibility/scripts/verify_aliases.mjs';

const helperSource = fileURLToPath(new URL('../../../.agents/skills/skills-host-compatibility/scripts/verify_aliases.mjs', import.meta.url));

function fixture(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'host-compatibility-test-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.agents', 'skills'), { recursive: true });
    return root;
}

test('classifies declared skills and guidance aliases without following them as inventory', (t) => {
    const root = fixture(t);
    fs.mkdirSync(path.join(root, '.claude'));
    fs.mkdirSync(path.join(root, '.github'));
    fs.mkdirSync(path.join(root, '.copilot', 'skills'), { recursive: true });
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Guidance\n');
    fs.writeFileSync(path.join(root, 'wrong-target.md'), '# Wrong guidance\n');
    fs.writeFileSync(path.join(root, 'GEMINI.md'), '# Undeclared guidance\n');
    fs.symlinkSync('../.agents/skills', path.join(root, '.claude', 'skills'), 'dir');
    fs.symlinkSync('AGENTS.md', path.join(root, 'CLAUDE.md'));
    fs.symlinkSync('missing.md', path.join(root, 'BROKEN.md'));
    fs.symlinkSync('wrong-target.md', path.join(root, 'WRONG.md'));
    fs.mkdirSync(path.join(root, '.copy', 'skills'), { recursive: true });
    fs.writeFileSync(path.join(root, '.copy', 'skills', 'SKILL.md'), 'copy\n');
    fs.mkdirSync(path.join(root, 'PLAIN.md'));

    const report = verifyAliases({
        root,
        canonical_path: '.agents/skills',
        guidance_path: 'AGENTS.md',
        aliases: [
            { kind: 'skills', path: '.claude/skills', shape: 'symbolic-link', target: '../.agents/skills' },
            { kind: 'guidance', path: 'CLAUDE.md', shape: 'symbolic-link', target: 'AGENTS.md' },
            { kind: 'guidance', path: 'MISSING.md', shape: 'symbolic-link', target: 'AGENTS.md' },
            { kind: 'guidance', path: 'BROKEN.md', shape: 'symbolic-link', target: 'AGENTS.md' },
            { kind: 'guidance', path: 'WRONG.md', shape: 'symbolic-link', target: 'AGENTS.md' },
            { kind: 'skills', path: '.copy/skills', shape: 'symbolic-link', target: '../.agents/skills' },
            { kind: 'guidance', path: 'PLAIN.md', shape: 'symbolic-link', target: 'AGENTS.md' },
        ],
        observed_paths: ['.copilot/skills', 'GEMINI.md'],
    });

    assert.deepEqual(report.aliases.map(({ path: name, kind, disposition }) => [name, kind, disposition]), [
        ['.claude/skills', 'skills', 'present'],
        ['CLAUDE.md', 'guidance', 'present'],
        ['MISSING.md', 'guidance', 'missing'],
        ['BROKEN.md', 'guidance', 'broken'],
        ['WRONG.md', 'guidance', 'wrong-target'],
        ['.copy/skills', 'skills', 'duplicate-copy'],
        ['PLAIN.md', 'guidance', 'unsupported-shape'],
    ]);
    assert.deepEqual(report.observed, [
        { path: '.copilot/skills', disposition: 'not-declared' },
        { path: 'GEMINI.md', disposition: 'not-declared' },
    ]);
    assert.deepEqual(report.guidance, { path: 'AGENTS.md', disposition: 'present' });
});

test('rejects alias contracts that escape the supplied repository root', (t) => {
    const root = fixture(t);
    assert.throws(() => verifyAliases({
        root,
        canonical_path: '.agents/skills',
        aliases: [{ kind: 'skills', path: '.claude/skills', shape: 'symbolic-link', target: '../../outside' }],
    }), /escapes the root|does not resolve to canonical_path/);
});

test('reports missing aliases when their parent directories do not exist', (t) => {
    const root = fixture(t);
    fs.mkdirSync(path.join(root, 'hosts'));
    fs.symlinkSync('hosts', path.join(root, 'host-alias'), 'dir');
    const report = verifyAliases({
        root,
        canonical_path: '.agents/skills',
        aliases: [
            { kind: 'skills', path: '.claude/skills', shape: 'symbolic-link', target: '../.agents/skills' },
            { kind: 'skills', path: 'host-alias/missing/skills', shape: 'symbolic-link', target: '../../.agents/skills' },
        ],
    });
    assert.deepEqual(report.aliases.map(alias => alias.disposition), ['missing', 'missing']);
});

test('reports dangling and looping links without aborting observed alias inspection', (t) => {
    const root = fixture(t);
    fs.symlinkSync('missing', path.join(root, 'dangling'));
    fs.symlinkSync('loop', path.join(root, 'loop'));
    const report = verifyAliases({
        root,
        canonical_path: '.agents/skills',
        aliases: [{ kind: 'skills', path: 'loop', shape: 'symbolic-link', target: '.agents/skills' }],
        observed_paths: ['dangling', 'loop', 'absent'],
    });
    assert.equal(report.aliases[0].disposition, 'broken');
    assert.deepEqual(report.observed, [{ path: 'dangling', disposition: 'not-declared' }]);
    assert.deepEqual(verifyAliases({
        root, canonical_path: '.agents/skills', aliases: [], observed_paths: ['loop'],
    }).observed, [{ path: 'loop', disposition: 'not-declared' }]);
});

test('requires a separate canonical guidance path for guidance aliases', (t) => {
    const root = fixture(t);
    assert.throws(() => verifyAliases({
        root,
        canonical_path: '.agents/skills',
        aliases: [{ kind: 'guidance', path: 'CLAUDE.md', shape: 'symbolic-link', target: 'AGENTS.md' }],
    }), /guidance_path is required/);
});

test('rejects oversized inspection contracts before processing their entries', (t) => {
    const root = fixture(t);
    const contract = { root, canonical_path: '.agents/skills', aliases: [] };
    assert.throws(() => verifyAliases({ ...contract, aliases: Array(257).fill(null) }), /at most 256 entries/);
    assert.throws(() => verifyAliases({ ...contract, observed_paths: Array(257).fill('missing') }), /at most 256 entries/);
    assert.throws(() => verifyAliases({ ...contract, observed_paths: 'missing' }), /must be an array/);
    assert.throws(() => verifyAliases({ ...contract, observed_paths: ['x'.repeat(1025)] }), /at most 1024 characters/);
});

test('rejects intermediate and followed symlink escapes from the supplied repository root', (t) => {
    const root = fixture(t);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'host-compatibility-outside-'));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    fs.mkdirSync(path.join(outside, 'skills'));
    fs.symlinkSync(outside, path.join(root, '.escaped'), 'dir');
    assert.throws(() => verifyAliases({ root, canonical_path: '.escaped/skills', aliases: [] }), /escapes the root/);

    fs.symlinkSync('.agents/skills', path.join(root, '.claude'), 'dir');
    fs.symlinkSync(outside, path.join(root, '.claude', 'external'), 'dir');
    assert.equal(verifyAliases({
        root,
        canonical_path: '.agents/skills',
        aliases: [{ kind: 'skills', path: '.claude/external', shape: 'symbolic-link', target: '.' }],
    }).aliases[0].disposition, 'wrong-target');
    assert.deepEqual(verifyAliases({
        root, canonical_path: '.agents/skills', aliases: [], observed_paths: ['.claude/external'],
    }).observed, [{ path: '.claude/external', disposition: 'not-declared' }]);
    fs.symlinkSync(path.join(outside, 'missing'), path.join(root, 'external-dangling'));
    assert.deepEqual(verifyAliases({
        root, canonical_path: '.agents/skills', aliases: [], observed_paths: ['external-dangling'],
    }).observed, [{ path: 'external-dangling', disposition: 'not-declared' }]);
    assert.equal(verifyAliases({
        root, canonical_path: '.agents/skills',
        aliases: [{ kind: 'skills', path: 'external-dangling', shape: 'symbolic-link', target: '.agents/skills' }],
    }).aliases[0].disposition, 'wrong-target');
});

test('runs directly when the helper script path contains a space', (t) => {
    const root = fixture(t);
    const helperDirectory = path.join(root, 'helper with space');
    fs.mkdirSync(helperDirectory);
    const helper = path.join(helperDirectory, 'verify aliases.mjs');
    fs.copyFileSync(helperSource, helper);
    fs.copyFileSync(path.join(path.dirname(helperSource), 'strict-json.mjs'), path.join(helperDirectory, 'strict-json.mjs'));
    const contract = path.join(root, 'contract.json');
    fs.writeFileSync(contract, JSON.stringify({ root, canonical_path: '.agents/skills', aliases: [] }));
    const result = spawnSync(process.execPath, [helper, contract], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
        canonical: { path: '.agents/skills', disposition: 'present' }, guidance: null, aliases: [], observed: [],
    });
    const alias = path.join(root, 'alias');
    fs.symlinkSync(helperDirectory, alias, 'dir');
    const linkedResult = spawnSync(process.execPath, [path.join(alias, 'verify aliases.mjs'), contract], { encoding: 'utf8' });
    assert.equal(linkedResult.status, 0, linkedResult.stderr);
    assert.deepEqual(JSON.parse(linkedResult.stdout), JSON.parse(result.stdout));
    fs.writeFileSync(contract, '{}');
    const rejected = spawnSync(process.execPath, [path.join(alias, 'verify aliases.mjs'), contract], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);
    assert.equal(rejected.stdout, '');
});

test('CLI rejects unsafe and oversized contract files without exposing malformed bytes', (t) => {
    const root = fixture(t);
    const contract = path.join(root, 'contract.json');
    const linked = path.join(root, 'linked.json');
    fs.writeFileSync(contract, '');
    fs.truncateSync(contract, 1024 * 1024 + 1);
    let result = spawnSync(process.execPath, [helperSource, contract], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /contract exceeds 1048576 bytes/);

    fs.writeFileSync(contract, JSON.stringify({ root, canonical_path: '.agents/skills', aliases: [] }));
    fs.symlinkSync('contract.json', linked);
    result = spawnSync(process.execPath, [helperSource, linked], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /contract must be a regular file/);

    fs.unlinkSync(linked);
    fs.linkSync(contract, linked);
    result = spawnSync(process.execPath, [helperSource, contract], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /contract must be a regular file/);
    fs.unlinkSync(linked);

    const sentinel = ['private', 'contract', 'sentinel'].join('-');
    fs.writeFileSync(contract, sentinel);
    result = spawnSync(process.execPath, [helperSource, contract], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /contract must contain unambiguous valid UTF-8 JSON/);
    assert.ok(!result.stderr.includes(sentinel));
});

test('alias contracts reject unknown fields and duplicate JSON scope keys', (t) => {
    const root = fixture(t);
    const contract = { root, canonical_path: '.agents/skills', aliases: [] };
    assert.throws(() => verifyAliases({ ...contract, observed_path: [] }), /unknown fields/);
    assert.throws(() => verifyAliases({ ...contract, aliases: [{ kind: 'skills', path: 'alias', shape: 'symbolic-link', target: '.agents/skills', extra: true }] }), /unknown fields/);
    const filename = path.join(root, 'contract.json');
    for (const content of [
        JSON.stringify(contract).replace('"aliases":[]', '"aliases":[],"aliases":[]'),
        JSON.stringify(contract).replace('"aliases":[]', '"aliases":[{"kind":"skills","path":"alias","shape":"symbolic-link","target":".agents/skills","targ\\u0065t":".agents/skills"}]'),
    ]) {
        fs.writeFileSync(filename, content);
        const result = spawnSync(process.execPath, [helperSource, filename], { encoding: 'utf8', timeout: 5000 });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /unambiguous valid UTF-8 JSON/);
        assert.equal(result.stdout, '');
    }
});
