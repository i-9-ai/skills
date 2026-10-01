// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ProjectConfiguration } from '../../../src/config/ProjectConfiguration.ts';
import { PluginSubmissionService } from '../../../src/service/PluginSubmissionService.ts';
import { PluginZipRepository } from '../../../src/repository/PluginZipRepository.ts';
import { submissionFixture } from '../fixture/PluginSubmissionFixture.mjs';
import { snapshot } from '../fixture/InstalledCatalogFixture.mjs';

test('public projection previews exact ZIP integrity without writes and omits root hooks/MCP/apps/state', (t) => {
    const target = submissionFixture(t);
    const service = new PluginSubmissionService();
    const configuration = new ProjectConfiguration({ root: target.source });
    const before = snapshot(target.root);
    const sourceBefore = snapshot(target.source);
    const preview = service.prepare(configuration, target.output);
    assert.equal(preview.written, false);
    assert.deepEqual(snapshot(target.root), before);
    const result = service.prepare(configuration, target.output, true);
    assert.deepEqual(result.integrity, preview.integrity);
    assert.equal(result.integrity.submission, 'not_submitted');
    assert.equal(result.integrity.approval, 'unverified');
    assert.equal(result.integrity.profile, 'public_skills_only');
    assert.equal(
        new PluginZipRepository().digest(readFileSync(result.archive)),
        result.integrity.archive.sha256,
    );
    assert.deepEqual(JSON.parse(readFileSync(result.summary, 'utf8')), result.integrity);
    assert.deepEqual(readdirSync(target.output).sort(), [
        '.codex-plugin',
        'LICENSE',
        'artifact-receipt.json',
        'plugin.json',
        'skills',
    ]);
    for (const path of [
        'hooks/hooks.json',
        'hooks/codex.json',
        '.mcp.json',
        '.app.json',
        'mcp/local.json',
        'private/usage.db',
    ])
        assert.equal(existsSync(join(target.output, path)), false, path);
    const receipt = JSON.parse(readFileSync(join(target.output, 'artifact-receipt.json')));
    assert.ok(
        receipt.files.every(
            (file) => !file.path.startsWith('hooks/') && !file.path.startsWith('mcp/'),
        ),
    );
    assert.ok(existsSync(join(target.output, 'skills/skill-design/assets/icon.png')));
    assert.ok(existsSync(join(target.output, 'skills/skill-design/LICENSE')));
    assert.deepEqual(snapshot(target.source), sourceBefore);
    const generated = snapshot(target.root);
    assert.throws(() => service.prepare(configuration, target.output, true), /already exists/u);
    assert.deepEqual(snapshot(target.root), generated);
});

for (const name of ['i9-skills.zip', 'i9-skills-submission.json']) {
    test(`existing ${name} rejects the complete write before creating a staging folder`, (t) => {
        const target = submissionFixture(t);
        writeFileSync(join(target.root, name), 'preserve');
        const before = snapshot(target.root);
        assert.throws(
            () =>
                new PluginSubmissionService().prepare(
                    new ProjectConfiguration({ root: target.source }),
                    target.output,
                    true,
                ),
            /already exists/u,
        );
        assert.deepEqual(snapshot(target.root), before);
        assert.equal(existsSync(target.output), false);
    });
}

test('public projection inherits neutral paths, existing-parent and no-link confinement', (t) => {
    const target = submissionFixture(t);
    const service = new PluginSubmissionService();
    const configuration = new ProjectConfiguration({ root: target.source });
    mkdirSync(join(target.root, '.agents/skills'), { recursive: true });
    symlinkSync(target.root, join(target.root, 'alias'));
    for (const output of [
        join(target.root, '.agents/skills/i9-skills'),
        join(target.root, 'missing/i9-skills'),
        join(target.root, 'alias/i9-skills'),
    ]) {
        const before = snapshot(target.root);
        assert.throws(() => service.prepare(configuration, output, true));
        assert.deepEqual(snapshot(target.root), before);
    }
});

test('public projection rejects an unexpected component even if a substituted derivation supplies one', (t) => {
    const target = submissionFixture(t);
    const preparation = {
        derive: () => ({
            files: [{ path: 'hooks/hooks.json', mode: 0o644, bytes: Buffer.from('{}') }],
        }),
    };
    const before = snapshot(target.root);
    assert.throws(
        () =>
            new PluginSubmissionService(undefined, preparation).prepare(
                new ProjectConfiguration({ root: target.source }),
                target.output,
                true,
            ),
        /unsupported/u,
    );
    assert.deepEqual(snapshot(target.root), before);
});

test('public projection rejects accidental skill-local databases before staging', (t) => {
    const target = submissionFixture(t);
    writeFileSync(
        join(target.source, '.agents/skills/skill-design/skill-usage.db'),
        'private-state-sentinel',
    );
    const before = snapshot(target.root);
    assert.throws(
        () =>
            new PluginSubmissionService().prepare(
                new ProjectConfiguration({ root: target.source }),
                target.output,
                true,
            ),
        /local state/u,
    );
    assert.deepEqual(snapshot(target.root), before);
});
