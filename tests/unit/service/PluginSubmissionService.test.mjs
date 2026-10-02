// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {
    existsSync,
    cpSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    symlinkSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ProjectConfiguration } from '../../../src/config/ProjectConfiguration.ts';
import { PluginSubmissionService } from '../../../src/service/PluginSubmissionService.ts';
import { PluginZipRepository } from '../../../src/repository/PluginZipRepository.ts';
import { submissionFixture } from '../fixture/PluginSubmissionFixture.mjs';
import { snapshot } from '../fixture/InstalledCatalogFixture.mjs';
import { syncCatalog } from '../../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';

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
        'assets',
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
    const manifest = JSON.parse(readFileSync(join(target.output, 'plugin.json')));
    const compatibility = JSON.parse(
        readFileSync(join(target.output, '.codex-plugin/plugin.json')),
    );
    assert.deepEqual(manifest.extensions['com.openai'].interface, compatibility.interface);
    assert.ok(existsSync(join(target.output, manifest.extensions['com.openai'].interface.logo)));
    assert.deepEqual(snapshot(target.source), sourceBefore);
    const generated = snapshot(target.root);
    assert.throws(() => service.prepare(configuration, target.output, true), /already exists/u);
    assert.deepEqual(snapshot(target.root), generated);
});

test('public profile transparently omits optional persistent-command setup while retaining canonical source', (t) => {
    const target = submissionFixture(t);
    const canonical = new URL('../../../.agents/skills/skills-usage-setup', import.meta.url);
    cpSync(canonical, join(target.source, '.agents/skills/skills-usage-setup'), {
        recursive: true,
    });
    syncCatalog(target.source, { layout: 'repository' });
    const sourceBefore = snapshot(target.source);
    const result = new PluginSubmissionService().prepare(
        new ProjectConfiguration({ root: target.source }),
        target.output,
        true,
    );
    assert.equal(result.integrity.packages, 1);
    assert.deepEqual(
        result.integrity.excluded_skills.map((entry) => entry.name),
        ['skills-usage-setup'],
    );
    assert.match(result.integrity.excluded_skills[0].reason, /persistent host-command/u);
    assert.equal(existsSync(join(target.output, 'skills/skills-usage-setup')), false);
    const receipt = JSON.parse(readFileSync(join(target.output, 'artifact-receipt.json')));
    assert.deepEqual(receipt.excluded_skills, result.integrity.excluded_skills);
    assert.ok(receipt.files.every((entry) => !entry.path.startsWith('skills/skills-usage-setup/')));
    assert.deepEqual(snapshot(target.source), sourceBefore);
});

test('missing, linked or corrupted public icon and invalid listing are rejected without outputs', (t) => {
    const changes = [
        (target) => {
            unlinkSync(join(target.source, 'assets/plugin-icon.png'));
        },
        (target) => {
            const icon = join(target.source, 'assets/plugin-icon.png');
            const outside = join(target.root, 'outside-icon.png');
            writeFileSync(outside, readFileSync(icon));
            unlinkSync(icon);
            symlinkSync(outside, icon);
        },
        (target) => {
            writeFileSync(join(target.source, 'assets/plugin-icon.png'), 'not png');
        },
        (target) => {
            const path = join(target.source, '.codex-plugin/plugin.json');
            const value = JSON.parse(readFileSync(path));
            value.interface.shortDescription = 'x'.repeat(31);
            writeFileSync(path, JSON.stringify(value));
        },
    ];
    for (const change of changes) {
        const target = submissionFixture(t);
        change(target);
        const before = snapshot(target.root);
        assert.throws(() =>
            new PluginSubmissionService().prepare(
                new ProjectConfiguration({ root: target.source }),
                target.output,
                true,
            ),
        );
        assert.deepEqual(snapshot(target.root), before);
    }
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
