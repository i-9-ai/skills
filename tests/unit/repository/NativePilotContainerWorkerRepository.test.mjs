import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { containerFixture } from '../../helpers/NativePilotContainerFixture.mjs';
import { NativePilotContainerWorkerRepository } from '../../../src/repository/NativePilotContainerWorkerRepository.ts';
import {
    NativePilotContainerValidator,
    canonicalContainerDigest,
} from '../../../src/validator/NativePilotContainerValidator.ts';
import { NativePilotContractValidator } from '../../../src/validator/NativePilotContractValidator.ts';

test('worker composes only fixed declared command phase/index, with no host HOME arguments', (t) => {
    const f = containerFixture(t);
    f.controller.files.stage();
    const worker = new NativePilotContainerWorkerRepository(f.controller.files.request);
    const native = worker.command('install-a', 0);
    assert.equal(native.executable, '/pilot/runtime-bin/codex');
    assert.deepEqual(native.args, ['plugin', 'marketplace', 'add', '/pilot/source', '--json']);
    assert.throws(() => worker.command('arbitrary-shell', 0), /Unknown/);
    assert.throws(() => worker.command('install-a', -1), /Unknown/);
    assert.throws(() => worker.command('install-a', 4), /Unknown/);
    assert.throws(
        () => NativePilotContainerWorkerRepository.load(join(f.root, 'request.json')),
        /Only the mounted/,
    );
});

test('inert retention records link text without reading or extracting linked private bytes', (t) => {
    const f = containerFixture(t);
    f.controller.files.stage();
    const worker = new NativePilotContainerWorkerRepository(f.controller.files.request);
    const state = join(f.root, 'synthetic-state');
    mkdirSync(state);
    const outside = join(f.root, 'outside-sentinel');
    writeFileSync(outside, 'sentinel never copied through symlink');
    writeFileSync(join(state, 'ordinary'), 'owned file');
    symlinkSync(outside, join(state, 'link'));
    const captured = worker.snapshot(state, true);
    assert.equal(captured.find((e) => e.path === 'link').base64, null);
    assert.equal(captured.find((e) => e.path === 'link').target, outside);
    assert.equal(
        Buffer.from(captured.find((e) => e.path === 'ordinary').base64, 'base64').toString(),
        'owned file',
    );
    assert(!JSON.stringify(captured).includes('sentinel never copied'));
    assert.equal(readFileSync(outside, 'utf8'), 'sentinel never copied through symlink');
});

test('worker frozen source inventories expose complete package and runtime files without truncation', (t) => {
    const f = containerFixture(t);
    f.controller.files.stage();
    const retained = JSON.parse(
        readFileSync(
            join(f.controller.files.owned.mount, 'control', 'source-a.inventory.json'),
            'utf8',
        ),
    );
    assert.deepEqual(retained, f.prepared.trees.source_a);
    assert(retained.entries.some((e) => e.path === 'hooks/codex.json'));
    assert(retained.entries.some((e) => e.path === '.agents/skills/example/references/guide.md'));
    assert(retained.entries.some((e) => e.kind === 'symlink'));
});

for (const [name, mutate] of Object.entries({
    'remote daemon': (p) => {
        p.docker.endpoint = 'ssh://unrelated.example';
    },
    'context fallback': (p) => {
        p.docker.context = 'default';
    },
    'floating image': (p) => {
        p.image.reference = 'node:latest';
    },
    'wrong UID': (p) => {
        p.account.uid = 0;
    },
    'home override path': (p) => {
        p.account.home = '/pilot/work';
    },
}))
    test(`closed container pin rejects ${name}`, (t) => {
        const f = containerFixture(t);
        const input = structuredClone(f.pin);
        mutate(input);
        assert.throws(() => new NativePilotContainerValidator().pin(input, f.prepared.contract));
        assert.equal(f.calls.length, 0);
    });

test('selected local derived image needs actual config ID, layers and retained matching build receipt', async (t) => {
    const f = containerFixture(t, {
        mutatePin: (pin, base) => {
            pin.image.kind = 'local-derived';
            pin.image.reference = pin.image.id;
            base.contract.authority.environment_sha256 = pin.image.id.slice(7);
            const dockerfile = join(base.root, 'Dockerfile');
            const receipt = join(base.root, 'build-receipt.json');
            base.put(dockerfile, 'SYNTHETIC INERT DOCKERFILE: NEVER BUILD\n');
            const dockerfileSha = base.inventory.file(dockerfile).sha256;
            const core = {
                schema_version: 1,
                kind: 'local-derived',
                build_exit_code: 0,
                dockerfile_sha256: dockerfileSha,
                base_reference: `example.invalid/base@sha256:${'2'.repeat(64)}`,
                base_id: `sha256:${'4'.repeat(64)}`,
                image_id: pin.image.id,
                platform: pin.image.platform,
                config_sha256: pin.image.config_sha256,
                rootfs_layers: pin.image.rootfs_layers,
            };
            base.put(receipt, JSON.stringify(core));
            pin.image.build = {
                receipt_path: receipt,
                receipt_sha256: base.inventory.file(receipt).sha256,
                dockerfile_path: dockerfile,
                dockerfile_sha256: dockerfileSha,
                base_reference: core.base_reference,
                base_id: core.base_id,
            };
        },
    });
    await f.controller.perform(f.controller.plan[0]);
    assert.deepEqual(f.image()[0].RepoDigests, []);
    assert.equal(f.nativeCalls().length, 1);
    const bad = structuredClone(f.image());
    bad[0].RootFS.Layers = [`sha256:${'0'.repeat(64)}`];
    assert.throws(() => new NativePilotContainerValidator().image(bad, f.pin), /identity/);
    const mismatched = structuredClone(f.image());
    mismatched[0].Config.Env.push('UNREVIEWED=synthetic');
    const sameConfigPin = structuredClone(f.pin);
    sameConfigPin.image.config_sha256 = canonicalContainerDigest(mismatched[0].Config);
    assert.throws(
        () => new NativePilotContainerValidator().image(mismatched, sameConfigPin),
        /environment/,
    );
});

test('registry digest cannot be inferred from a matching local image config ID', (t) => {
    const f = containerFixture(t);
    const image = f.image();
    image[0].RepoDigests = [];
    assert.throws(() => new NativePilotContainerValidator().image(image, f.pin), /identity/);
});

const privateIdentity = (base, scope) => {
    const report = join(base.root, `${scope}-synthetic-review.md`);
    const receipt = join(base.root, `${scope}-synthetic-review.json`);
    base.put(report, 'Synthetic review fixture only. No native or independent acceptance.\n');
    base.put(
        receipt,
        JSON.stringify({
            schema_version: 1,
            kind: 'independent-private-source-review',
            scope,
            tree_sha256: base.contract[scope].tree_sha256,
            result: 'no-actionable-findings',
            report_path: report,
            report_sha256: base.inventory.file(report).sha256,
        }),
    );
    base.contract[scope] = {
        ...base.contract[scope],
        origin: 'reviewed-private-tree',
        revision: null,
        review_path: receipt,
        review_sha256: base.inventory.file(receipt).sha256,
    };
};

test('private executable trees use null Git revision and exact retained review bytes for a probe-only lane', async (t) => {
    const f = containerFixture(t, {
        mutatePin: (_pin, base) => {
            privateIdentity(base, 'driver');
            privateIdentity(base, 'observer');
        },
    });
    assert.equal(f.prepared.contract.driver.revision, null);
    const facts = await f.controller.inspectBoundary();
    assert.equal(facts.commands.length, 0);
    assert.equal(f.nativeCalls().length, 0);
    assert.equal(facts.native_acceptance, false);
});

test('changed independent report bytes block before a Docker call or controller output', async (t) => {
    const f = containerFixture(t, { mutatePin: (_pin, base) => privateIdentity(base, 'driver') });
    writeFileSync(join(f.root, 'driver-synthetic-review.md'), 'changed after review');
    await assert.rejects(f.controller.inspectBoundary(), /review receipt/);
    assert.equal(f.calls.length, 0);
});

test('private source A/B and a fabricated private-tree Git revision are rejected', (t) => {
    const f = containerFixture(t, { mutatePin: (_pin, base) => privateIdentity(base, 'driver') });
    const validator = new NativePilotContractValidator();
    const fakeGit = structuredClone(f.prepared.contract);
    fakeGit.driver.revision = fakeGit.source_b.revision;
    assert.throws(() => validator.resolved(fakeGit), /cannot claim a Git revision/);
    const privateSource = structuredClone(f.prepared.contract);
    privateSource.source_a = { ...privateSource.driver };
    assert.throws(() => validator.resolved(privateSource), /unknown fields/);
    const missing = structuredClone(f.prepared.contract);
    missing.driver.review_sha256 = null;
    assert.throws(() => validator.resolved(missing), /Unresolved execution gates/);
});
