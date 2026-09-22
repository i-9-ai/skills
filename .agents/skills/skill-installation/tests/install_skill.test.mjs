/** Synthetic Git/validator fixtures; no user installation or real validator is invoked. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const PACKAGE = fileURLToPath(new URL('../', import.meta.url));

function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'installation-fallback-test-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, 'source');
    const state = path.join(root, 'state');
    const collection = path.join(root, 'consumer', 'skills');
    const installed = path.join(root, 'installed-helper', 'skill-installation');
    const caller = path.join(root, 'caller');
    for (const folder of [source, state, collection, caller]) fs.mkdirSync(folder, { recursive: true });
    fs.cpSync(PACKAGE, installed, { recursive: true });
    const helper = path.join(installed, 'scripts/install_skill.mjs');
    fs.chmodSync(helper, 0o444);
    const git = (...args) => {
        const result = spawnSync('git', ['-C', source, ...args], { encoding: 'utf8', timeout: 10_000,
            env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
                GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
                GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' } });
        assert.equal(result.status, 0, result.stderr);
        return result.stdout.trim();
    };
    git('init', '--quiet');
    const candidate = path.join(source, 'packages', 'sample-skill');
    fs.mkdirSync(path.join(candidate, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(candidate, 'SKILL.md'), `---\nname: sample-skill\ndescription: A synthetic package.\nlicense: Apache-2.0\nmetadata:\n  setup: scripts/setup.mjs\n---\n# Sample\n`);
    fs.writeFileSync(path.join(candidate, 'LICENSE'), 'Synthetic license fixture; never distributed as a license.\n');
    fs.writeFileSync(path.join(candidate, 'scripts/setup.mjs'), 'throw new Error("Setup must never execute");\n', { mode: 0o755 });
    const commit = () => { git('add', '.'); git('commit', '--quiet', '--no-gpg-sign', '-m', 'Synthetic fixture'); return git('rev-parse', 'HEAD'); };
    const revision = commit();
    const validator = path.join(root, 'fake-validator.mjs');
    fs.writeFileSync(validator, `#!${process.execPath}\nimport fs from 'node:fs';\nimport path from 'node:path';\nconst [command, directory] = process.argv.slice(2);\nif (command === '--version') { console.log('skills-ref, version 0.1.0'); process.exit(0); }\nconst text = fs.readFileSync(path.join(directory, 'SKILL.md'), 'utf8');\nif (text.includes('reject-validation')) process.exit(1);\nif (text.includes('mutate-validation')) fs.writeFileSync(path.join(directory, 'changed.txt'), 'unexpected');\nif (command === 'read-properties') console.log(JSON.stringify({name: 'sample-skill', license: 'Apache-2.0', metadata: {setup: 'scripts/setup.mjs'}}));\n`, { mode: 0o755 });
    const destination = path.join(collection, 'sample-skill');
    const defaults = ['--repository', source, '--package', 'packages/sample-skill', '--revision', revision,
        '--name', 'sample-skill', '--license', 'Apache-2.0', '--destination', destination,
        '--state-dir', state, '--validator', validator, '--validator-version', '0.1.0'];
    const invoke = (command, args = []) => spawnSync(process.execPath, [helper, command, ...args], {
        cwd: caller, encoding: 'utf8', timeout: 20_000, maxBuffer: 128 * 1024,
    });
    return { root, source, state, collection, candidate, revision, destination, helper, validator, commit, invoke, defaults };
}

function success(result) {
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

function changedOption(args, name, value) {
    const copy = [...args];
    copy[copy.indexOf(`--${name}`) + 1] = value;
    return copy;
}

test('detached helper installs only pinned Git bytes and verifies a receipt without setup', t => {
    const f = fixture(t);
    const original = fs.readFileSync(path.join(f.candidate, 'SKILL.md'), 'utf8');
    fs.writeFileSync(path.join(f.candidate, 'SKILL.md'), 'Uncommitted content must not be installed.');
    fs.writeFileSync(path.join(f.candidate, 'untracked.txt'), 'not committed');
    const result = success(f.invoke('install', f.defaults));
    assert.equal(fs.readFileSync(path.join(f.destination, 'SKILL.md'), 'utf8'), original);
    assert.equal(fs.existsSync(path.join(f.destination, 'untracked.txt')), false);
    assert.equal(fs.statSync(path.join(f.destination, 'scripts/setup.mjs')).mode & 0o777, 0o755);
    assert.deepEqual(result.setup, { entrypoint: 'scripts/setup.mjs', status: 'not-run' });
    const receipt = JSON.parse(fs.readFileSync(result.receipt, 'utf8'));
    assert.equal(receipt.source.revision, f.revision);
    assert.deepEqual(receipt.host_projections, []);
    assert.equal(receipt.validation.content_sha256, result.content.sha256);
    assert.equal(success(f.invoke('verify', ['--receipt', result.receipt, '--destination', f.destination])).state, 'installed');
    assert.equal(fs.statSync(f.helper).mode & 0o777, 0o444);
    assert.deepEqual(fs.readdirSync(f.collection), ['sample-skill']);
});

test('collisions are preserved and explicit replacement has verified reversible prior bytes', t => {
    const f = fixture(t);
    fs.mkdirSync(f.destination);
    fs.writeFileSync(path.join(f.destination, 'old.txt'), 'prior package bytes');
    assert.match(f.invoke('install', f.defaults).stderr, /explicit --replace/);
    assert.deepEqual(fs.readdirSync(f.state), []);
    assert.equal(fs.readFileSync(path.join(f.destination, 'old.txt'), 'utf8'), 'prior package bytes');
    const result = success(f.invoke('install', [...f.defaults, '--replace']));
    const prior = path.join(path.dirname(result.receipt), 'previous', 'sample-skill', 'old.txt');
    assert.equal(fs.readFileSync(prior, 'utf8'), 'prior package bytes');
    assert.equal(success(f.invoke('rollback', ['--receipt', result.receipt, '--destination', f.destination])).state, 'rolled-back');
    assert.equal(fs.readFileSync(path.join(f.destination, 'old.txt'), 'utf8'), 'prior package bytes');
    assert.equal(fs.existsSync(path.join(path.dirname(result.receipt), 'withdrawn/sample-skill/SKILL.md')), true);
    assert.equal(success(f.invoke('rollback', ['--receipt', result.receipt, '--destination', f.destination])).state, 'rolled-back');
});

test('new installation rollback retains the withdrawn package and leaves destination absent', t => {
    const f = fixture(t);
    const result = success(f.invoke('install', f.defaults));
    success(f.invoke('rollback', ['--receipt', result.receipt, '--destination', f.destination]));
    assert.equal(fs.existsSync(f.destination), false);
    assert.equal(fs.existsSync(path.join(path.dirname(result.receipt), 'withdrawn/sample-skill/SKILL.md')), true);
});

test('changed destination or backup blocks rollback without overwriting either package', t => {
    const f = fixture(t);
    fs.mkdirSync(f.destination);
    fs.writeFileSync(path.join(f.destination, 'old.txt'), 'old');
    const result = success(f.invoke('install', [...f.defaults, '--replace']));
    fs.writeFileSync(path.join(f.destination, 'consumer.txt'), 'consumer change');
    const args = ['--receipt', result.receipt, '--destination', f.destination];
    assert.match(f.invoke('verify', args).stderr, /no longer matches/);
    assert.match(f.invoke('rollback', args).stderr, /Destination changed/);
    assert.equal(fs.readFileSync(path.join(f.destination, 'consumer.txt'), 'utf8'), 'consumer change');
    fs.unlinkSync(path.join(f.destination, 'consumer.txt'));
    const prior = path.join(path.dirname(result.receipt), 'previous/sample-skill/old.txt');
    fs.writeFileSync(prior, 'changed backup');
    assert.match(f.invoke('rollback', args).stderr, /Retained package changed/);
    assert.equal(fs.existsSync(path.join(f.destination, 'SKILL.md')), true);
});

for (const marker of ['reject-validation', 'mutate-validation']) {
    test(`${marker} never publishes or replaces a package`, t => {
        const f = fixture(t);
        fs.appendFileSync(path.join(f.candidate, 'SKILL.md'), marker);
        const revision = f.commit();
        fs.mkdirSync(f.destination);
        fs.writeFileSync(path.join(f.destination, 'old.txt'), 'preserved');
        const result = f.invoke('install', [...changedOption(f.defaults, 'revision', revision), '--replace']);
        assert.notEqual(result.status, 0);
        assert.deepEqual(fs.readdirSync(f.state), []);
        assert.deepEqual(fs.readdirSync(f.destination), ['old.txt']);
    });
}

test('source links, credential signatures and unsafe selections are rejected', t => {
    const f = fixture(t);
    fs.symlinkSync('../../outside', path.join(f.candidate, 'unsafe-link'));
    const linkedRevision = f.commit();
    assert.match(f.invoke('install', changedOption(f.defaults, 'revision', linkedRevision)).stderr, /Git links/);
    fs.unlinkSync(path.join(f.candidate, 'unsafe-link'));
    const sentinel = ['gh', 'p_', 'a'.repeat(40)].join('');
    fs.writeFileSync(path.join(f.candidate, 'secret.txt'), sentinel);
    const secretRevision = f.commit();
    const secretResult = f.invoke('install', changedOption(f.defaults, 'revision', secretRevision));
    assert.match(secretResult.stderr, /credential signature/);
    assert.equal(secretResult.stderr.includes(sentinel), false);
    for (const selection of ['packages/../packages/sample-skill', 'packages//sample-skill', '/packages/sample-skill']) {
        assert.match(f.invoke('install', changedOption(f.defaults, 'package', selection)).stderr, /Unsafe/);
    }
    assert.match(f.invoke('install', changedOption(f.defaults, 'revision', 'HEAD')).stderr, /immutable/);
    assert.equal(fs.existsSync(f.destination), false);
});

test('missing validator, incorrect expected metadata and an existing destination alias fail closed', t => {
    const f = fixture(t);
    assert.notEqual(f.invoke('install', changedOption(f.defaults, 'validator', path.join(f.root, 'missing-tool'))).status, 0);
    assert.match(f.invoke('install', changedOption(f.defaults, 'validator-version', '9.0.0')).stderr, /version does not match/);
    assert.match(f.invoke('install', changedOption(f.defaults, 'license', 'MIT')).stderr, /license does not match/);
    fs.symlinkSync(f.source, f.destination, 'dir');
    assert.match(f.invoke('install', [...f.defaults, '--replace']).stderr, /real directory/);
    assert.equal(fs.lstatSync(f.destination).isSymbolicLink(), true);
    assert.deepEqual(fs.readdirSync(f.state), []);
});

test('state inside discovery and ambiguous receipt fields cannot authorize writes', t => {
    const f = fixture(t);
    assert.match(f.invoke('install', changedOption(f.defaults, 'state-dir', f.collection)).stderr, /must be separate/);
    const result = success(f.invoke('install', f.defaults));
    const original = fs.readFileSync(result.receipt, 'utf8');
    fs.writeFileSync(result.receipt, original.replace('"schema_version": 1,', '"schema_version": 2,\n  "schema_version": 1,'));
    assert.match(f.invoke('rollback', ['--receipt', result.receipt, '--destination', f.destination]).stderr, /generated encoding/);
    assert.equal(fs.existsSync(path.join(f.destination, 'SKILL.md')), true);
    fs.writeFileSync(result.receipt, 'private-receipt-sentinel: invalid JSON');
    const malformed = f.invoke('verify', ['--receipt', result.receipt, '--destination', f.destination]);
    assert.match(malformed.stderr, /valid JSON document/);
    assert.equal(malformed.stderr.includes('private-receipt-sentinel'), false);
});

test('prepared receipt recovers an interrupted replacement without deleting withdrawn bytes', t => {
    const f = fixture(t);
    fs.mkdirSync(f.destination);
    fs.writeFileSync(path.join(f.destination, 'old.txt'), 'prior bytes');
    const result = success(f.invoke('install', [...f.defaults, '--replace']));
    const record = JSON.parse(fs.readFileSync(result.receipt, 'utf8'));
    record.state = 'prepared';
    fs.writeFileSync(result.receipt, `${JSON.stringify(record, null, 2)}\n`);
    const withdrawn = path.join(path.dirname(result.receipt), 'withdrawn');
    fs.mkdirSync(withdrawn);
    fs.renameSync(f.destination, path.join(withdrawn, 'sample-skill'));
    success(f.invoke('rollback', ['--receipt', result.receipt, '--destination', f.destination]));
    assert.equal(fs.readFileSync(path.join(f.destination, 'old.txt'), 'utf8'), 'prior bytes');
    assert.equal(fs.existsSync(path.join(withdrawn, 'sample-skill/SKILL.md')), true);
});

test('rollback refuses redirected transaction resources and tolerates a prior empty withdrawal folder', t => {
    const f = fixture(t);
    fs.mkdirSync(f.destination);
    fs.writeFileSync(path.join(f.destination, 'old.txt'), 'prior bytes');
    const result = success(f.invoke('install', [...f.defaults, '--replace']));
    const transaction = path.dirname(result.receipt);
    const previous = path.join(transaction, 'previous');
    const saved = path.join(f.root, 'saved-previous');
    fs.renameSync(previous, saved);
    fs.symlinkSync(saved, previous, 'dir');
    const args = ['--receipt', result.receipt, '--destination', f.destination];
    assert.match(f.invoke('rollback', args).stderr, /real directory/);
    assert.equal(fs.existsSync(path.join(f.destination, 'SKILL.md')), true);
    assert.equal(fs.readFileSync(path.join(saved, 'sample-skill/old.txt'), 'utf8'), 'prior bytes');
    fs.unlinkSync(previous);
    fs.renameSync(saved, previous);
    fs.mkdirSync(path.join(transaction, 'withdrawn'));
    success(f.invoke('rollback', args));
    assert.equal(fs.readFileSync(path.join(f.destination, 'old.txt'), 'utf8'), 'prior bytes');
});
