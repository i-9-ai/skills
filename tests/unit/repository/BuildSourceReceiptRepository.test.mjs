// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { InstalledCollectionConfiguration } from '../../../src/config/InstalledCollectionConfiguration.ts';
import { BuildSourceReceiptRepository } from '../../../src/repository/BuildSourceReceiptRepository.ts';
import { InstalledSkillRepository } from '../../../src/repository/InstalledSkillRepository.ts';
import { SkillCatalogService } from '../../../src/service/SkillCatalogService.ts';
import { BuildSourceReceiptValidator } from '../../../src/validator/BuildSourceReceiptValidator.ts';
import { catalogFixture, digest, snapshot, write } from '../fixture/InstalledCatalogFixture.mjs';

const receiptFile = BuildSourceReceiptValidator.file;
function repository(target) {
    return new BuildSourceReceiptRepository(new InstalledCollectionConfiguration(target.installed));
}
function git(target, args, cwd = target.installed) {
    const result = spawnSync(
        'git',
        [
            '-c',
            'user.name=Synthetic Builder',
            '-c',
            'user.email=builder@example.test',
            '-c',
            'core.hooksPath=/dev/null',
            ...args,
        ],
        { cwd, env: target.environment, encoding: 'utf8', timeout: 10_000 },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}
function target(t, { gitSource = false, origin = 'https://github.com/i-9-ai/skills.git' } = {}) {
    const value = catalogFixture(t);
    write(value.installed, '.gitignore', 'dist/\nnode_modules/\n');
    write(value.installed, 'bin/index.mjs', '// A synthetic distributed launcher.\n');
    write(value.installed, 'dist/index.js', 'export const synthetic = true;\n');
    write(
        value.installed,
        '.codex-plugin/plugin.json',
        '{"name":"synthetic-plugin","version":"9.8.7"}\n',
    );
    write(value.installed, 'assets/plugin-icon.png', 'Synthetic packaged icon bytes.\n');
    if (gitSource) {
        git(value, ['init', '--quiet', '--template=', '--initial-branch=main']);
        git(value, ['remote', 'add', 'origin', origin]);
        git(value, ['add', '--all']);
        git(value, ['commit', '--quiet', '--no-gpg-sign', '-m', 'Record synthetic source']);
        value.sha = git(value, ['rev-parse', 'HEAD']);
    }
    return value;
}
function read(value) {
    return repository(value).read(
        '9.8.7',
        digest(readFileSync(join(value.installed, 'skills-catalog.json'))),
    );
}
function unavailable(value, reason) {
    const result = read(value);
    assert.equal(result.source_ref, null);
    assert.equal(result.resolved_git_sha, null);
    assert.equal(result.source_provenance.status, 'unavailable');
    assert.equal(result.source_provenance.build_verification, 'unavailable');
    assert.equal(result.source_provenance.integrity, 'unavailable');
    assert.equal(result.source_provenance.reason, reason);
    assert.equal(JSON.stringify(result).includes(value.root), false);
    return result;
}

test('clean owned Git source records the selected SHA while installed reads verify only the build assertion', (t) => {
    const value = target(t, { gitSource: true });
    const first = repository(value).capture();
    assert.deepEqual(first.source, {
        status: 'verified',
        git_sha: value.sha,
        verification: 'clean_git_checkout',
    });
    assert.ok(first.files.some((file) => file.path === 'dist/index.js'));
    assert.ok(first.files.some((file) => file.path.endsWith('/SKILL.md')));
    for (const path of ['.codex-plugin/plugin.json', 'assets/plugin-icon.png']) {
        assert.equal(
            first.files.find((file) => file.path === path)?.sha256,
            digest(readFileSync(join(value.installed, path))),
        );
    }
    assert.ok(
        first.files.every((file) => !file.path.includes('.git/') && !file.path.startsWith('/')),
    );
    assert.equal(JSON.stringify(first).includes(value.root), false);
    const original = readFileSync(join(value.installed, receiptFile));
    repository(value).capture();
    assert.deepEqual(readFileSync(join(value.installed, receiptFile)), original);
    rmSync(join(value.installed, '.git'), { recursive: true });
    const before = snapshot(value.root);
    const result = read(value);
    assert.equal(result.source_ref, value.sha);
    assert.equal(result.resolved_git_sha, value.sha);
    assert.deepEqual(result.source_provenance, {
        status: 'asserted',
        build_verification: 'verified',
        integrity: 'verified',
        reason: null,
        receipt_sha256: digest(original),
    });
    const catalog = new SkillCatalogService(
        new InstalledSkillRepository(new InstalledCollectionConfiguration(value.installed)),
    );
    for (const provenance of [
        catalog.search({}).provenance,
        catalog.read({ skill: 'alpha-guide' }).provenance,
        catalog.overview({}).provenance,
    ]) {
        assert.equal(provenance.resolved_git_sha, value.sha);
        assert.deepEqual(provenance.source_provenance, result.source_provenance);
    }
    assert.deepEqual(snapshot(value.root), before, 'repeated installed reads never change bytes');
});

test('archive nested in an unrelated Git checkout and registry gitHead never infer a source revision', (t) => {
    const value = target(t);
    git(value, ['init', '--quiet', '--template=', '--initial-branch=unrelated'], value.root);
    git(value, ['remote', 'add', 'origin', 'https://example.test/unrelated.git'], value.root);
    const manifest = JSON.parse(readFileSync(join(value.installed, 'package.json'), 'utf8'));
    write(
        value.installed,
        'package.json',
        JSON.stringify({ ...manifest, gitHead: 'a'.repeat(40) }),
    );
    assert.equal(repository(value).capture().source.reason, 'not_git_source');
    unavailable(value, 'not_git_source');
});

for (const [label, mutate, reason] of [
    [
        'tracked changes',
        (value) => write(value.installed, 'bin/index.mjs', '// Changed.\n'),
        'dirty_source',
    ],
    [
        'untracked changes',
        (value) => write(value.installed, 'new-source.ts', 'export {};\n'),
        'dirty_source',
    ],
    [
        'unverified origin',
        (value) => git(value, ['remote', 'set-url', 'origin', 'https://example.test/other.git']),
        'unverified_repository',
    ],
]) {
    test(`${label} replace stale receipts with unavailable evidence`, (t) => {
        const value = target(t, { gitSource: true });
        repository(value).capture();
        mutate(value);
        const receipt = repository(value).capture();
        assert.deepEqual(receipt.source, { status: 'unavailable', reason });
        assert.deepEqual(receipt.files, []);
        unavailable(value, reason);
    });
}

test('missing receipt is an explicit source gap without reading caller Git metadata', (t) => {
    const value = target(t, { gitSource: true });
    const before = snapshot(value.root);
    unavailable(value, 'missing_receipt');
    assert.deepEqual(snapshot(value.root), before);
});

for (const [label, mutate] of [
    [
        'receipt Git SHA',
        (value, receipt) => {
            receipt.source.git_sha = 'main';
            write(value.installed, receiptFile, JSON.stringify(receipt));
        },
    ],
    [
        'unknown field',
        (value, receipt) => {
            receipt.private_path = 'not-allowed';
            write(value.installed, receiptFile, JSON.stringify(receipt));
        },
    ],
    [
        'duplicate file',
        (value, receipt) => {
            receipt.files.push(receipt.files[0]);
            write(value.installed, receiptFile, JSON.stringify(receipt));
        },
    ],
    [
        'unrelated file path',
        (value, receipt) => {
            receipt.files[0].path = '.git/config';
            write(value.installed, receiptFile, JSON.stringify(receipt));
        },
    ],
    [
        'traversal path',
        (value, receipt) => {
            receipt.files[0].path = 'docs/../package.json';
            write(value.installed, receiptFile, JSON.stringify(receipt));
        },
    ],
    [
        'changed resource',
        (value) =>
            write(
                value.installed,
                '.agents/skills/alpha-guide/references/example.md',
                '# Modified resource\n',
            ),
    ],
    [
        'missing resource',
        (value) =>
            rmSync(join(value.installed, '.agents/skills/alpha-guide/references/example.md')),
    ],
    [
        'extra resource',
        (value) =>
            write(
                value.installed,
                '.agents/skills/alpha-guide/references/extra.md',
                '# Added resource\n',
            ),
    ],
    [
        'compiled code',
        (value) => write(value.installed, 'dist/index.js', 'export const modified = true;\n'),
    ],
    [
        'changed plugin manifest',
        (value) =>
            write(value.installed, '.codex-plugin/plugin.json', '{"name":"changed-plugin"}\n'),
    ],
    [
        'missing plugin manifest',
        (value) => rmSync(join(value.installed, '.codex-plugin/plugin.json')),
    ],
    [
        'changed plugin icon',
        (value) => write(value.installed, 'assets/plugin-icon.png', 'Changed icon bytes.\n'),
    ],
    ['missing plugin icon', (value) => rmSync(join(value.installed, 'assets/plugin-icon.png'))],
    [
        'oversized receipt',
        (value) =>
            write(
                value.installed,
                receiptFile,
                ' '.repeat(BuildSourceReceiptValidator.receiptBytes + 1),
            ),
    ],
    ['invalid UTF-8', (value) => write(value.installed, receiptFile, Buffer.from([0xff]))],
    [
        'symbolic receipt',
        (value) => {
            const outside = join(value.root, 'outside-receipt');
            cpSync(join(value.installed, receiptFile), outside);
            rmSync(join(value.installed, receiptFile));
            symlinkSync(outside, join(value.installed, receiptFile));
        },
    ],
]) {
    test(`installed source provenance rejects ${label} without repairing evidence`, (t) => {
        const value = target(t, { gitSource: true });
        const receipt = repository(value).capture();
        rmSync(join(value.installed, '.git'), { recursive: true });
        mutate(value, receipt);
        const before = snapshot(value.root);
        unavailable(value, 'invalid_receipt');
        assert.deepEqual(snapshot(value.root), before);
    });
}

test('receipt capture rejects a linked output without changing its external target', (t) => {
    const value = target(t);
    const outside = join(value.root, 'outside');
    write(value.root, 'outside', 'Preserve this unrelated sentinel.\n');
    symlinkSync(outside, join(value.installed, receiptFile));
    const before = snapshot(value.root);
    assert.throws(() => repository(value).capture());
    assert.equal(existsSync(outside), true);
    assert.deepEqual(snapshot(value.root), before);
});
