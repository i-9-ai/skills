import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { CatalogError, checkCatalog, syncCatalog, validateCatalogData } from '../../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';

const PACKAGE = fileURLToPath(new URL('../../../.agents/skills/skills-catalog', import.meta.url));

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-catalog-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'skills'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Consult `skills-catalog.json` to discover skills.\n');
    return root;
}

function skill(directory, name, description = `Use ${name} for a synthetic catalog test.`) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\nmetadata:\n  tags: "catalog, tests"\n---\n\n# ${name}\n`);
}

test('global layout discovers real nested packages and produces an idempotent root catalog', (t) => {
    const root = fixture(t);
    skill(path.join(root, 'skills', 'alpha'), 'alpha');
    skill(path.join(root, 'skills', 'suite'), 'suite');
    skill(path.join(root, 'skills', 'suite', 'models', 'beta'), 'beta');
    skill(path.join(root, 'skills', '.system', 'ignored'), 'ignored');

    const first = syncCatalog(root, { layout: 'global' });
    const bytes = fs.readFileSync(path.join(root, 'skills-catalog.json'));
    const second = syncCatalog(root, { layout: 'global' });
    assert.equal(first.changed, true);
    assert.equal(second.changed, false);
    assert.deepEqual(fs.readFileSync(path.join(root, 'skills-catalog.json')), bytes);
    assert.equal(fs.existsSync(path.join(path.dirname(root), 'skills-catalog.json')), false);
    const catalog = JSON.parse(bytes);
    assert.deepEqual(catalog.skills.map(({ name, path: packagePath }) => [name, packagePath]), [
        ['alpha', 'skills/alpha'], ['beta', 'skills/suite/models/beta'], ['suite', 'skills/suite'],
    ]);
    assert.equal(checkCatalog(root, { layout: 'global' }).changed, false);
});

test('global layout permits only same-name direct children of explicit package link roots', (t) => {
    const root = fixture(t);
    const sources = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-catalog-sources-'));
    t.after(() => fs.rmSync(sources, { recursive: true, force: true }));
    skill(path.join(sources, 'linked-skill'), 'linked-skill');
    fs.symlinkSync(path.join(sources, 'linked-skill'), path.join(root, 'skills', 'linked-skill'));

    assert.throws(() => syncCatalog(root, { layout: 'global' }), /pass an explicit --allow-package-link-root/);
    const result = syncCatalog(root, { layout: 'global', allowPackageLinkRoots: [sources] });
    assert.equal(result.packages, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'skills-catalog.json'))).skills[0].path,
        'skills/linked-skill');

    fs.unlinkSync(path.join(root, 'skills', 'linked-skill'));
    skill(path.join(sources, 'nested', 'escaped'), 'escaped');
    fs.symlinkSync(path.join(sources, 'nested', 'escaped'), path.join(root, 'skills', 'escaped'));
    assert.throws(() => syncCatalog(root, { layout: 'global', allowPackageLinkRoots: [sources] }),
        /outside the allowed package link roots/);
});

test('global discovery rejects links inside real package trees', (t) => {
    const root = fixture(t);
    skill(path.join(root, 'skills', 'alpha'), 'alpha');
    fs.symlinkSync(path.join(root, 'AGENTS.md'), path.join(root, 'skills', 'alpha', 'linked-reference'));
    assert.throws(() => syncCatalog(root, { layout: 'global' }), /must not be a symbolic link/);
});

test('global discovery bounds one directory before sorting its entries', (t) => {
    const root = fixture(t);
    skill(path.join(root, 'skills', 'alpha'), 'alpha');
    for (let index = 0; index <= 16384; index++) {
        fs.writeFileSync(path.join(root, 'skills', `entry-${index}`), '');
    }
    assert.throws(() => syncCatalog(root, { layout: 'global' }), /exceeds 16384 entries/);
});

test('catalog output and collection roots reject symbolic and hard links', (t) => {
    const root = fixture(t);
    skill(path.join(root, 'skills', 'alpha'), 'alpha');
    const outside = path.join(root, 'outside.json');
    fs.writeFileSync(outside, '{}\n');
    fs.symlinkSync(outside, path.join(root, 'skills-catalog.json'));
    assert.throws(() => syncCatalog(root, { layout: 'global' }), /regular, non-linked file/);
    fs.unlinkSync(path.join(root, 'skills-catalog.json'));
    fs.linkSync(outside, path.join(root, 'skills-catalog.json'));
    assert.throws(() => syncCatalog(root, { layout: 'global' }), /regular, non-linked file/);

    const linkedRoot = `${root}-link`;
    fs.symlinkSync(root, linkedRoot);
    t.after(() => fs.rmSync(linkedRoot, { force: true }));
    assert.throws(() => syncCatalog(linkedRoot, { layout: 'global' }), /collection root must be a real directory/);
});

test('global paths validate but traversal and name mismatches do not', () => {
    const entry = {
        name: 'beta', path: 'skills/suite/models/beta',
        description: 'Use beta for a synthetic catalog test.', tags: ['catalog']
    };
    assert.equal(validateCatalogData({ schema_version: 1, skills: [entry] }).skills[0].name, 'beta');
    for (const invalid of ['skills/../beta', 'skills/suite/alpha', '/skills/beta']) {
        assert.throws(() => validateCatalogData({ schema_version: 1, skills: [{ ...entry, path: invalid }] }), CatalogError);
    }
});

test('copied skills-catalog package runs without sibling packages', (t) => {
    const root = fixture(t);
    skill(path.join(root, 'skills', 'alpha'), 'alpha');
    const installation = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-catalog-installation-'));
    t.after(() => fs.rmSync(installation, { recursive: true, force: true }));
    fs.cpSync(PACKAGE, path.join(installation, 'skills-catalog'), { recursive: true });
    const helper = path.join(installation, 'skills-catalog', 'scripts', 'catalog_tools.mjs');
    const result = spawnSync(process.execPath, [helper, 'sync', root, '--layout', 'global'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).catalog, path.join(fs.realpathSync.native(root), 'skills-catalog.json'));
    assert.equal(fs.existsSync(path.join(installation, 'skill-authoring')), false);
});
