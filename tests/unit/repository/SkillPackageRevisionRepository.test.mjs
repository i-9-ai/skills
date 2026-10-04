// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SkillPackageRevisionRepository } from '../../../src/repository/SkillPackageRevisionRepository.ts';
import { SafeRoot } from '../../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { fixture } from '../fixture/SkillBenchmarkFixture.mjs';

test('the 2,048-entry traversal budget includes directories and regular files', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'i9-revision-entry-bound-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.writeFileSync(path.join(directory, 'SKILL.md'), 'Synthetic skill');
    fs.writeFileSync(path.join(directory, 'LICENSE'), 'Synthetic license');
    for (let index = 0; index < 1024; index++) {
        const nested = path.join(directory, 'resource-' + index);
        fs.mkdirSync(nested);
        fs.writeFileSync(path.join(nested, 'reference.md'), 'Synthetic resource');
    }
    // 1,026 files plus 1,024 directories exceed the total-entry budget.
    assert.throws(() => new SkillPackageRevisionRepository().inspect(directory));
    fs.unlinkSync(path.join(directory, 'resource-0', 'reference.md'));
    fs.unlinkSync(path.join(directory, 'resource-1', 'reference.md'));
    const revision = new SkillPackageRevisionRepository().inspect(directory);
    assert.equal(revision.files, 1024);
    assert.equal(revision.package_sha256.length, 64);
    // A directory alone consumes an entry, even though it adds no content bytes.
    fs.mkdirSync(path.join(directory, 'one-too-many'));
    assert.throws(() => new SkillPackageRevisionRepository().inspect(directory));
});

test('inert revision scan rejects linked/hard-linked resources and oversized bytes', (t) => {
    for (const kind of ['link', 'hardlink', 'oversize']) {
        const target = fixture(t);
        const directory = path.join(target.skills, 'example-skill');
        const file = path.join(directory, 'SKILL.md');
        if (kind === 'link') {
            fs.unlinkSync(file);
            fs.symlinkSync(target.artifactFile, file);
        }
        if (kind === 'hardlink') fs.linkSync(file, path.join(directory, 'alias.md'));
        if (kind === 'oversize')
            fs.writeFileSync(path.join(directory, 'large.bin'), Buffer.alloc(4_194_305));
        const original = fs.readFileSync(target.artifactFile);
        assert.throws(() => new SkillPackageRevisionRepository().inspect(directory));
        assert.deepEqual(fs.readFileSync(target.artifactFile), original);
    }
});

test('revision scan detects additions during content inspection instead of claiming stable identity', (t) => {
    const target = fixture(t);
    const directory = path.join(target.skills, 'example-skill');
    const original = SafeRoot.prototype.readBytes;
    let injected = false;
    SafeRoot.prototype.readBytes = function (...args) {
        const result = original.apply(this, args);
        if (!injected) {
            injected = true;
            fs.writeFileSync(path.join(directory, 'late.md'), 'changed');
        }
        return result;
    };
    try {
        assert.throws(
            () => new SkillPackageRevisionRepository().inspect(directory),
            (error) => error?.code === 'invalid_input',
        );
    } finally {
        SafeRoot.prototype.readBytes = original;
    }
    assert.equal(injected, true);
});
