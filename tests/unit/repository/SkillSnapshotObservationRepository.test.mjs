// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SkillSnapshotObservationRepository } from '../../../src/repository/SkillSnapshotObservationRepository.ts';
import { SkillObservationService } from '../../../src/service/SkillObservationService.ts';
import { SkillBumpReportService } from '../../../src/service/SkillBumpReportService.ts';
import { bumpDigest } from '../../../src/validator/SkillBumpReportValidator.ts';
import { bumpFixture, treeBytes, validator } from '../fixture/SkillBumpFixture.mjs';

const unavailable = (error) =>
    error.code === 'snapshot_unavailable' && !error.message.includes('private-sentinel');
const manifest = (snapshot) => JSON.parse(fs.readFileSync(path.join(snapshot, 'manifest.json')));
function rewrite(snapshot, update) {
    const value = manifest(snapshot);
    update(value);
    fs.writeFileSync(path.join(snapshot, 'manifest.json'), JSON.stringify(value));
}

test('verified collection observations retain exact inventory without touching snapshots, source or HOME', (t) => {
    const target = bumpFixture(t),
        snapshot = target.capture('before');
    const before = treeBytes(target.root);
    const result = new SkillObservationService().observe(snapshot, target.subject);
    assert.equal(result.sha256, validator.pin(result.observation).sha256);
    assert.equal(result.observation.snapshot_tree_sha256, manifest(snapshot).content.tree_hash);
    assert.equal(result.observation.contracts.coverage, 'not_provided');
    assert.deepEqual(result.observation.validation, []);
    assert.ok(
        result.observation.inventory.entries.some(
            (entry) => entry.path === '.agents/skills/demo-skill/SKILL.md',
        ),
    );
    assert.deepEqual(treeBytes(target.root), before);

    const skill = path.join(target.root, 'collection/.agents/skills/demo-skill/SKILL.md');
    fs.appendFileSync(skill, '\nA second explicitly selected revision.\n');
    const after = new SkillObservationService().observe(target.capture('after'), target.subject);
    const report = new SkillBumpReportService().report({
        schema_version: 1,
        before: result,
        after,
        assessment: null,
    });
    assert.equal(report.recommendation, 'undetermined');
    assert.equal(report.changes[0].key, '.agents/skills/demo-skill/SKILL.md');
    assert.notEqual(
        report.observations.before.content_identity.sha256,
        report.observations.after.content_identity.sha256,
    );
});

test('package observations rebase only the selected package and retain a distinct original snapshot identity', (t) => {
    const target = bumpFixture(t);
    fs.chmodSync(path.join(target.root, 'collection/.agents/skills/demo-skill'), 0o750);
    const snapshot = target.capture('package', { packageScope: true });
    const subject = {
        ...target.subject,
        subject: { scope: 'skill', collection: 'synthetic', skill: 'demo-skill' },
    };
    const observation = new SkillObservationService().observe(snapshot, subject).observation;
    assert.equal(observation.inventory.root_mode, 0o750);
    assert.deepEqual(
        observation.inventory.entries.map((entry) => entry.path),
        ['LICENSE', 'SKILL.md', 'references', 'references/usage.md'],
    );
    assert.notEqual(observation.content_identity.sha256, observation.snapshot_tree_sha256);
    assert.throws(
        () => new SkillObservationService().observe(snapshot, target.subject),
        unavailable,
    );
    subject.subject.skill = 'other-skill';
    assert.throws(() => new SkillObservationService().observe(snapshot, subject), unavailable);
});

test('observations bind submitted contract definitions and receipts to verified content while rejecting stale evidence', (t) => {
    const target = bumpFixture(t),
        snapshot = target.capture('review');
    const service = new SkillObservationService(),
        plain = service.observe(snapshot, target.subject);
    const definition = plain.observation.inventory.entries.find((entry) =>
        entry.path.endsWith('/SKILL.md'),
    );
    const evidence = {
        contracts: {
            coverage: 'complete',
            entries: [
                {
                    id: 'inspect-example',
                    kind: 'capability',
                    required: true,
                    signature_sha256: 'a'.repeat(64),
                    files: [{ path: definition.path, sha256: definition.sha256 }],
                },
            ],
        },
        validation: [
            {
                kind: 'structural',
                status: 'passed',
                content_sha256: plain.observation.content_identity.sha256,
                evidence_sha256: 'b'.repeat(64),
            },
        ],
    };
    const reviewed = service.observe(snapshot, target.subject, evidence);
    assert.notEqual(reviewed.sha256, plain.sha256);
    assert.deepEqual(reviewed.observation.content_identity, plain.observation.content_identity);
    evidence.validation[0].content_sha256 = 'c'.repeat(64);
    assert.throws(() => service.observe(snapshot, target.subject, evidence), {
        code: 'invalid_input',
    });
    assert.throws(
        () =>
            service.observe('private-sentinel', { ...target.subject, prompt: 'private-sentinel' }),
        { code: 'invalid_input' },
    );
});

test('external links export only target hashes and do not read current target contents', (t) => {
    const target = bumpFixture(t),
        external = path.join(target.root, 'private-sentinel');
    fs.writeFileSync(external, 'Do not read or return this external target.');
    fs.symlinkSync(external, path.join(target.root, 'collection/external-link'));
    const snapshot = target.capture('linked');
    fs.unlinkSync(external);
    const before = treeBytes(target.root);
    const observation = new SkillObservationService().observe(snapshot, target.subject).observation;
    const link = observation.inventory.entries.find((entry) => entry.path === 'external-link');
    assert.equal(link.type, 'symlink');
    assert.equal(link.target_is_absolute, true);
    assert.match(link.target_sha256, /^[a-f0-9]{64}$/u);
    assert.equal(JSON.stringify(observation).includes('private-sentinel'), false);
    assert.deepEqual(treeBytes(target.root), before);
});

test('tampered objects and hardlinked or linked object paths fail with unchanged rejected data', (t) => {
    const target = bumpFixture(t),
        snapshot = target.capture('invalid-object');
    const entry = manifest(snapshot).content.entries.find((entry) => entry.type === 'file');
    const object = path.join(target.root, 'snapshots/.objects/sha256', entry.sha256);
    const original = fs.readFileSync(object);
    fs.chmodSync(object, 0o600);
    fs.writeFileSync(object, Buffer.alloc(original.length, 65));
    let before = treeBytes(target.root);
    assert.throws(
        () => new SkillObservationService().observe(snapshot, target.subject),
        unavailable,
    );
    assert.deepEqual(treeBytes(target.root), before);
    fs.writeFileSync(object, original);
    const alias = path.join(target.root, 'object-alias');
    fs.linkSync(object, alias);
    before = treeBytes(target.root);
    assert.throws(
        () => new SkillObservationService().observe(snapshot, target.subject),
        unavailable,
    );
    assert.deepEqual(treeBytes(target.root), before);
    fs.unlinkSync(object);
    fs.symlinkSync(alias, object);
    before = treeBytes(target.root);
    assert.throws(
        () => new SkillObservationService().observe(snapshot, target.subject),
        unavailable,
    );
    assert.deepEqual(treeBytes(target.root), before);
});

test('unsupported schemas and work exceeding entry, byte or manifest limits fail before the verifier runs', (t) => {
    const target = bumpFixture(t),
        snapshot = target.capture('bounded');
    const initial = fs.readFileSync(path.join(snapshot, 'manifest.json'));
    let calls = 0;
    const repository = new SkillSnapshotObservationRepository(() => {
        calls++;
        throw new Error('private-sentinel');
    });
    const reject = (update) => {
        fs.writeFileSync(path.join(snapshot, 'manifest.json'), initial);
        rewrite(snapshot, update);
        const before = treeBytes(target.root);
        assert.throws(() => repository.observe(snapshot, target.subject.subject), unavailable);
        assert.deepEqual(treeBytes(target.root), before);
        assert.equal(calls, 0);
    };
    reject((value) => {
        value.schema_version = 1;
    });
    reject((value) => {
        value.content.entries = Array.from({ length: 1025 }, (_, i) => ({
            path: `entry-${String(i).padStart(4, '0')}`,
            type: 'directory',
            mode: 0o755,
        }));
        value.content.tree_hash = bumpDigest(value.content.entries);
    });
    reject((value) => {
        value.content.entries.find((entry) => entry.type === 'file').size = 64 * 1024 * 1024 + 1;
        value.content.tree_hash = bumpDigest(value.content.entries);
    });
    reject((value) => {
        value.untrusted = 'x'.repeat(353 * 1024);
    });
});

test('a failing verifier and mutations during verification produce static snapshot errors', (t) => {
    const target = bumpFixture(t),
        snapshot = target.capture('changing');
    const value = manifest(snapshot);
    const failed = new SkillSnapshotObservationRepository(() => {
        throw new Error('private-sentinel timeout');
    });
    assert.throws(() => failed.observe(snapshot, target.subject.subject), unavailable);
    const changed = new SkillSnapshotObservationRepository(() => {
        fs.appendFileSync(path.join(snapshot, 'manifest.json'), '\n');
        return {
            ok: true,
            tree_hash: value.content.tree_hash,
            scope: value.selection.scope,
            package: null,
        };
    });
    assert.throws(() => changed.observe(snapshot, target.subject.subject), unavailable);
    fs.writeFileSync(path.join(snapshot, 'manifest.json'), JSON.stringify(value));
    const changedObject = new SkillSnapshotObservationRepository(() => {
        const entry = value.content.entries.find((entry) => entry.type === 'file');
        const object = path.join(target.root, 'snapshots/.objects/sha256', entry.sha256);
        fs.chmodSync(object, 0o600);
        fs.appendFileSync(object, 'changed during verification');
        return {
            ok: true,
            tree_hash: value.content.tree_hash,
            scope: value.selection.scope,
            package: null,
        };
    });
    assert.throws(() => changedObject.observe(snapshot, target.subject.subject), unavailable);
});
