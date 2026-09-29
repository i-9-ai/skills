// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { InstalledCollectionConfiguration } from '../../../src/config/InstalledCollectionConfiguration.ts';
import { InstalledSkillRepository } from '../../../src/repository/InstalledSkillRepository.ts';
import { SkillCatalogService } from '../../../src/service/SkillCatalogService.ts';
import { catalogFixture, digest, snapshot, write } from '../fixture/InstalledCatalogFixture.mjs';

function service(target) {
    return new SkillCatalogService(
        new InstalledSkillRepository(new InstalledCollectionConfiguration(target.installed)),
    );
}

function rejects(target, operation, code) {
    const before = snapshot(target.root);
    assert.throws(operation, (error) => {
        assert.equal(error.code, code);
        assert.ok(error.message.length < 512);
        assert.equal(error.message.includes(target.root), false);
        assert.equal(error.message.includes('private-request-sentinel'), false);
        return true;
    });
    assert.deepEqual(snapshot(target.root), before);
}

test('installed catalog searches literal metadata with deterministic, truthful pagination', (t) => {
    const target = catalogFixture(t);
    const catalog = service(target);
    const before = snapshot(target.root);
    const result = catalog.search({ query: 'CATALOG', limit: 1, offset: 0 });
    assert.equal(result.total, 2);
    assert.equal(result.limit, 1);
    assert.equal(result.offset, 0);
    assert.equal(result.next_offset, 1);
    assert.deepEqual(
        result.skills.map((skill) => skill.name),
        ['alpha-guide'],
    );
    const next = catalog.search({ query: 'CATALOG', limit: 1, offset: result.next_offset });
    assert.deepEqual(
        next.skills.map((skill) => skill.name),
        ['beta-guide'],
    );
    assert.equal(next.next_offset, null);
    assert.equal(catalog.search({ query: '^.*$' }).total, 0);
    assert.deepEqual(
        catalog.search({ query: '[.*]' }).skills.map((skill) => skill.name),
        ['alpha-guide'],
    );
    assert.equal(catalog.search({ query: 'gamma-guide' }).total, 1);
    assert.deepEqual(catalog.search({ offset: 256 }).skills, []);
    assert.equal(catalog.search({ offset: 256 }).next_offset, null);
    assert.deepEqual(snapshot(target.root), before);
});

test('installed provenance distinguishes content digests from unverified version and Git metadata', (t) => {
    const target = catalogFixture(t);
    const manifest = JSON.parse(fs.readFileSync(join(target.installed, 'package.json'), 'utf8'));
    write(
        target.installed,
        'package.json',
        JSON.stringify({ ...manifest, gitHead: 'a'.repeat(40) }),
    );
    const result = service(target).search({});
    assert.deepEqual(result.provenance, {
        collection: 'i9-skills',
        package_name: '@i-9-ai/skills',
        package_version: '9.8.7',
        repository: 'https://github.com/i-9-ai/skills',
        source_ref: null,
        resolved_git_sha: null,
        catalog_sha256: digest(fs.readFileSync(join(target.installed, 'skills-catalog.json'))),
    });
});

test('installed resources return exact UTF-8 Markdown and a digest of the selected bytes', (t) => {
    const target = catalogFixture(t);
    const catalog = service(target);
    const before = snapshot(target.root);
    for (const resource of ['SKILL.md', 'references/example.md', 'references/nested/guide.md']) {
        const bytes = fs.readFileSync(
            join(target.installed, '.agents/skills/alpha-guide', resource),
        );
        const result = catalog.read({
            skill: 'alpha-guide',
            ...(resource === 'SKILL.md' ? {} : { resource }),
        });
        assert.equal(result.skill, 'alpha-guide');
        assert.equal(result.resource, resource);
        assert.equal(result.media_type, 'text/markdown');
        assert.equal(result.byte_length, bytes.length);
        assert.equal(result.content, bytes.toString('utf8'));
        assert.equal(result.content_sha256, digest(bytes));
        assert.equal(result.provenance.resolved_git_sha, null);
    }
    assert.deepEqual(snapshot(target.root), before);
});

test('resource digests update when bytes change without pretending metadata catalogs pin content', (t) => {
    const target = catalogFixture(t);
    const catalog = service(target);
    const first = catalog.read({ skill: 'alpha-guide' });
    write(
        target.installed,
        '.agents/skills/alpha-guide/SKILL.md',
        first.content + '\nAn updated implementation example.\n',
    );
    const second = catalog.read({ skill: 'alpha-guide' });
    assert.notEqual(second.content_sha256, first.content_sha256);
    assert.equal(second.provenance.catalog_sha256, first.provenance.catalog_sha256);
    assert.equal(second.provenance.resolved_git_sha, null);
    assert.match(second.content, /updated implementation example/u);
});

test('metadata discovery does not require a skill body to fit the narrower resource response limit', (t) => {
    const target = catalogFixture(t);
    const file = '.agents/skills/alpha-guide/SKILL.md';
    write(
        target.installed,
        file,
        fs.readFileSync(join(target.installed, file), 'utf8') + 'x'.repeat(70 * 1024),
    );
    const catalog = service(target);
    assert.equal(catalog.search({ query: 'alpha-guide' }).total, 1);
    assert.match(catalog.overview({ max_entries: 1 }).overview, /alpha-guide/u);
    rejects(target, () => catalog.read({ skill: 'alpha-guide' }), 'resource_unavailable');
});

test('installed overview preserves package counts and omissions within the fixed context budget', (t) => {
    const target = catalogFixture(t);
    const result = service(target).overview({ max_entries: 1 });
    assert.equal(typeof result.overview, 'string');
    assert.ok(result.overview.length <= 4096);
    assert.match(result.overview, /alpha-guide/u);
    assert.match(result.overview, /Discovered: 3 distinct packages/u);
    assert.match(result.overview, /2 additional packages omitted/u);
    assert.match(result.overview, /Selected route: unassessed/u);
    assert.match(result.overview, /Status: available = readable, parsed metadata/u);
    assert.match(
        result.overview,
        /SKILL.md: "\.agents\/skills\/alpha-guide\/SKILL.md" \(collection-relative\)/u,
    );
    assert.doesNotMatch(result.overview, /decoy-guide/u);
});

const invalidQueries = {
    search: [
        null,
        [],
        'query',
        { query: 1 },
        { query: 'a'.repeat(201) },
        { limit: 0 },
        { limit: 51 },
        { limit: 1.5 },
        { offset: -1 },
        { offset: 257 },
        { offset: '1' },
        { extra: 'private-request-sentinel' },
    ],
    read: [
        null,
        [],
        {},
        { skill: 1 },
        { skill: '../alpha-guide' },
        { skill: 'alpha-guide', resource: 1 },
        { skill: 'alpha-guide', extra: 'private-request-sentinel' },
    ],
    overview: [
        null,
        [],
        { max_entries: 0 },
        { max_entries: 25 },
        { max_entries: '1' },
        { extra: 'private-request-sentinel' },
    ],
};
for (const [method, inputs] of Object.entries(invalidQueries)) {
    test(`installed catalog ${method} rejects closed-schema violations without side effects`, (t) => {
        const target = catalogFixture(t);
        const catalog = service(target);
        for (const input of inputs) rejects(target, () => catalog[method](input), 'invalid_input');
    });
}

test('resource selection rejects traversal, encoded separators, scripts and unrelated files', (t) => {
    const target = catalogFixture(t);
    const catalog = service(target);
    for (const resource of [
        '../SKILL.md',
        '/etc/passwd',
        'C:\\private\\file.md',
        'references/../SKILL.md',
        'references/%2e%2e/SKILL.md',
        'references/%252e%252e/file.md',
        'references%2fexample.md',
        'references\\example.md',
        'scripts/forbidden.mjs',
        'LICENSE',
        'references/example.json',
    ])
        rejects(target, () => catalog.read({ skill: 'alpha-guide', resource }), 'invalid_input');
    assert.equal(fs.existsSync(join(target.root, 'script-executed')), false);
});

test('missing and unlisted resource identities fail without consulting external collections', (t) => {
    const target = catalogFixture(t);
    const catalog = service(target);
    for (const input of [
        { skill: 'decoy-guide' },
        { skill: 'missing-guide' },
        { skill: 'alpha-guide', resource: 'references/missing.md' },
    ]) {
        rejects(target, () => catalog.read(input), 'resource_unavailable');
    }
});

test('resource byte limits accept exactly 64 KiB and reject overflow or invalid UTF-8', (t) => {
    const target = catalogFixture(t);
    const resource = '.agents/skills/alpha-guide/references/bounded.md';
    write(target.installed, resource, 'a'.repeat(64 * 1024));
    const catalog = service(target);
    assert.equal(
        catalog.read({ skill: 'alpha-guide', resource: 'references/bounded.md' }).byte_length,
        64 * 1024,
    );
    for (const content of ['a'.repeat(64 * 1024 + 1), Buffer.from([0xff, 0xfe])]) {
        write(target.installed, resource, content);
        rejects(
            target,
            () => catalog.read({ skill: 'alpha-guide', resource: 'references/bounded.md' }),
            'resource_unavailable',
        );
    }
});

for (const kind of ['symbolic file', 'hard-linked file', 'symbolic ancestor']) {
    test(`selected Markdown rejects a ${kind} and preserves the external target`, (t) => {
        const target = catalogFixture(t);
        const outside = join(target.root, 'outside');
        fs.mkdirSync(outside);
        write(outside, 'sentinel.md', '# Private external sentinel\n');
        let resource = 'references/linked.md';
        const destination = join(target.installed, '.agents/skills/alpha-guide', resource);
        if (kind === 'hard-linked file') fs.linkSync(join(outside, 'sentinel.md'), destination);
        if (kind === 'symbolic file') fs.symlinkSync(join(outside, 'sentinel.md'), destination);
        if (kind === 'symbolic ancestor') {
            fs.symlinkSync(
                outside,
                join(target.installed, '.agents/skills/alpha-guide/references/linked'),
                'dir',
            );
            resource = 'references/linked/sentinel.md';
        }
        rejects(
            target,
            () => service(target).read({ skill: 'alpha-guide', resource }),
            'resource_unavailable',
        );
    });
}

for (const [label, changes] of [
    ['package name', { name: '@other/skills' }],
    ['package version', { version: 'not-a-version' }],
    ['repository identity', { repository: { type: 'git', url: 'https://example.test/other.git' } }],
    [
        'repository URL fragment',
        { repository: { type: 'git', url: 'git+https://github.com/i-9-ai/skills.git#main' } },
    ],
]) {
    test(`installed catalog rejects tampered ${label}`, (t) => {
        const target = catalogFixture(t);
        const filename = join(target.installed, 'package.json');
        write(
            target.installed,
            'package.json',
            JSON.stringify({ ...JSON.parse(fs.readFileSync(filename, 'utf8')), ...changes }),
        );
        rejects(target, () => service(target).search({}), 'catalog_unavailable');
    });
}

test('stale metadata and tampered catalog paths are rejected rather than silently refreshed', (t) => {
    const target = catalogFixture(t);
    const catalog = service(target);
    target.skill('alpha-guide', 'A changed description not yet synchronized.', ['catalog']);
    for (const [method, args] of [
        ['search', {}],
        ['read', { skill: 'alpha-guide' }],
        ['overview', {}],
    ]) {
        rejects(target, () => catalog[method](args), 'catalog_unavailable');
    }
    target.sync();
    const filename = join(target.installed, 'skills-catalog.json');
    const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
    manifest.skills[0].path = '../outside/alpha-guide';
    write(target.installed, 'skills-catalog.json', JSON.stringify(manifest));
    rejects(target, () => catalog.search({}), 'catalog_unavailable');
});
