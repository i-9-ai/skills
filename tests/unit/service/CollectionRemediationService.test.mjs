// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { CollectionMaintenanceRepository } from '../../../src/repository/CollectionMaintenanceRepository.ts';
import { CollectionSnapshotRepository } from '../../../src/repository/CollectionSnapshotRepository.ts';
import { CollectionRemediationService } from '../../../src/service/CollectionRemediationService.ts';
import {
    checkCatalog,
    deriveCatalog,
    syncCatalog,
} from '../../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';
import {
    inventory,
    maintenanceFixture,
    repository,
} from '../fixture/CollectionMaintenanceFixture.mjs';

for (const catalog of ['missing', 'stale']) {
    test(`a ${catalog} catalog follows audit, selected plan, inert preview, verified apply and a no-op fresh plan`, (t) => {
        const target = maintenanceFixture(t, { catalog });
        const before = inventory(target.collection);
        const audit = target.audit();
        assert.equal(audit.catalog.status, catalog);
        assert.equal(audit.packages.length, 2);
        assert.ok(audit.packages.every((item) => item.validation === 'passed'));
        assert.deepEqual(audit.validation, {
            local: 'structural',
            official: 'not_run',
            behavioral: 'not_run',
        });
        const service = new CollectionRemediationService();
        const plan = service.plan(target.selection, audit);
        assert.equal(plan.operations[0].type, 'catalog.sync');
        const preview = service.evolve(target.selection, plan);
        assert.equal(preview.status, 'preview');
        assert.equal(preview.applied, false);
        assert.deepEqual(inventory(target.collection), before);
        assert.equal(fs.existsSync(target.store), false);

        const result = service.evolve(target.selection, plan, {
            apply: true,
            snapshotStore: target.store,
        });
        assert.equal(result.status, 'applied');
        assert.equal(result.after_sha256, plan.operations[0].expected_after_sha256);
        assert.deepEqual(result.verification, {
            preimage: 'passed',
            catalog: 'passed',
            rollback: 'not_run',
        });
        assert.deepEqual(checkCatalog(target.collection, { layout: 'repository' }).changed, false);
        assert.deepEqual(
            inventory(target.collection).filter((item) => item.path !== 'skills-catalog.json'),
            before.filter((item) => item.path !== 'skills-catalog.json'),
        );
        assert.deepEqual(
            JSON.parse(fs.readFileSync(join(result.snapshot, 'maintenance-result.json'), 'utf8')),
            result,
        );
        assert.throws(() => service.evolve(target.selection, plan), /stale/);
        const after = inventory(target.root);
        assert.equal(
            service.evolve(target.selection, target.plan(), { apply: true }).status,
            'unchanged',
        );
        assert.deepEqual(inventory(target.root), after);
    });
}

test('independent broken packages remain explicit handoffs after catalog repair without running candidate code', (t) => {
    const target = maintenanceFixture(t);
    fs.unlinkSync(join(target.alpha, 'LICENSE'));
    fs.mkdirSync(join(target.beta, 'scripts'));
    const marker = join(target.root, 'executed');
    fs.writeFileSync(
        join(target.beta, 'scripts/do-not-run.mjs'),
        `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'bad');\n`,
    );
    const audit = target.audit();
    assert.equal(audit.coverage.complete, true);
    assert.deepEqual(
        audit.packages.map((item) => item.validation),
        ['failed', 'passed'],
    );
    const result = new CollectionRemediationService().evolve(target.selection, target.plan(), {
        apply: true,
        snapshotStore: target.store,
    });
    assert.equal(result.status, 'applied');
    assert.ok(
        result.remaining_handoffs.some(
            (item) => item.code === 'package_license' && item.owner === 'skill-evolution',
        ),
    );
    assert.equal(fs.existsSync(join(target.alpha, 'LICENSE')), false);
    assert.equal(fs.existsSync(marker), false);
    assert.deepEqual(fs.readdirSync(target.home), []);
});

test('malformed catalog bytes remain untouched with a review handoff and no supported operation', (t) => {
    const target = maintenanceFixture(t);
    fs.writeFileSync(target.catalogFile, '{not a catalog}\n');
    const before = inventory(target.root);
    const plan = target.plan();
    assert.deepEqual(plan.operations, []);
    assert.ok(plan.handoffs.some((item) => item.code === 'catalog_malformed'));
    const result = new CollectionRemediationService().evolve(target.selection, plan, {
        apply: true,
        snapshotStore: target.store,
    });
    assert.equal(result.status, 'unchanged');
    assert.deepEqual(inventory(target.root), before);
});

test('a legacy catalog conflict prevents a false clean audit even when canonical bytes are fresh', (t) => {
    const target = maintenanceFixture(t, { catalog: 'current' });
    fs.writeFileSync(join(target.collection, 'catalog.json'), '{"legacy":true}\n');
    const before = inventory(target.collection);
    const audit = target.audit();
    assert.equal(audit.catalog.status, 'unavailable');
    assert.ok(audit.findings.some((item) => item.code === 'catalog_derivation'));
    const result = new CollectionRemediationService().evolve(target.selection, target.plan(), {
        apply: true,
    });
    assert.equal(result.status, 'unchanged');
    assert.ok(result.remaining_handoffs.length > 0);
    assert.deepEqual(inventory(target.collection), before);
});

for (const change of ['body', 'reference', 'mode', 'catalog', 'inventory']) {
    test(`a changed ${change} invalidates both the audit and plan before state creation`, (t) => {
        const target = maintenanceFixture(t);
        const audit = target.audit();
        const service = new CollectionRemediationService();
        const plan = service.plan(target.selection, audit);
        if (change === 'body')
            fs.appendFileSync(join(target.alpha, 'SKILL.md'), '\nNew behavior.\n');
        if (change === 'reference')
            fs.appendFileSync(join(target.alpha, 'references/example.md'), '\nNew evidence.\n');
        if (change === 'mode') fs.chmodSync(join(target.alpha, 'LICENSE'), 0o600);
        if (change === 'catalog') syncCatalog(target.collection);
        if (change === 'inventory') fs.mkdirSync(join(target.alpha, 'new-directory'));
        const before = inventory(target.root);
        assert.throws(() => service.plan(target.selection, audit), /stale/);
        assert.throws(
            () =>
                service.evolve(target.selection, plan, {
                    apply: true,
                    snapshotStore: target.store,
                }),
            /stale/,
        );
        assert.deepEqual(inventory(target.root), before);
    });
}

test('a selected plan cannot authorize another root, arbitrary operations, edited hashes or omitted handoffs', (t) => {
    const target = maintenanceFixture(t);
    fs.unlinkSync(join(target.alpha, 'LICENSE'));
    const plan = target.plan();
    const other = maintenanceFixture(t);
    const service = new CollectionRemediationService();
    assert.throws(() => service.evolve(other.selection, plan), /stale|unsupported/);
    const variants = [
        { ...plan, command: 'touch external-file' },
        { ...plan, operations: [{ ...plan.operations[0], type: 'package.rewrite' }] },
        { ...plan, operations: [{ ...plan.operations[0], target: '../escape' }] },
        { ...plan, operations: [{ ...plan.operations[0], expected_after_sha256: '0'.repeat(64) }] },
        { ...plan, handoffs: [] },
        { ...plan, schema_version: 2 },
    ];
    const before = inventory(target.root);
    for (const candidate of variants)
        assert.throws(
            () =>
                service.evolve(target.selection, candidate, {
                    apply: true,
                    snapshotStore: target.store,
                }),
            /stale|unsupported/,
        );
    assert.deepEqual(inventory(target.root), before);
});

for (const hazard of ['symlink', 'hardlink', 'directory-link', 'fifo', 'oversize']) {
    test(`unsafe package ${hazard} is bounded evidence and blocks application without following its target`, (t) => {
        const target = maintenanceFixture(t);
        const outside = join(target.root, 'outside');
        fs.writeFileSync(outside, 'External sentinel remains unchanged.');
        const entry = join(target.alpha, 'unsafe');
        if (hazard === 'symlink') fs.symlinkSync(outside, entry);
        if (hazard === 'hardlink') fs.linkSync(outside, entry);
        if (hazard === 'directory-link') fs.symlinkSync(target.home, entry);
        if (hazard === 'fifo') {
            const made = spawnSync('mkfifo', [entry], { encoding: 'utf8' });
            assert.equal(made.status, 0, made.stderr);
        }
        if (hazard === 'oversize') {
            const descriptor = fs.openSync(entry, 'wx');
            fs.ftruncateSync(descriptor, 4_194_305);
            fs.closeSync(descriptor);
        }
        const audit = target.audit();
        assert.equal(audit.coverage.complete, false);
        assert.equal(audit.coverage.omitted, null);
        const service = new CollectionRemediationService();
        const plan = service.plan(target.selection, audit);
        assert.equal(plan.operations.length, 0);
        const before = inventory(target.root);
        assert.throws(
            () =>
                service.evolve(target.selection, plan, {
                    apply: true,
                    snapshotStore: target.store,
                }),
            /coverage/,
        );
        assert.deepEqual(inventory(target.root), before);
    });
}

test('global reserved .system bytes are excluded and nested packages work without home discovery', (t) => {
    const target = maintenanceFixture(t, { layout: 'global' });
    const reserved = join(target.skills, '.system');
    fs.mkdirSync(reserved);
    fs.writeFileSync(join(reserved, 'private'), 'Do not inspect or change reserved data.');
    fs.symlinkSync(target.root, join(reserved, 'loop'));
    fs.mkdirSync(join(target.skills, 'group'));
    fs.renameSync(target.beta, join(target.skills, 'group/beta-skill'));
    const before = inventory(reserved);
    const audit = target.audit();
    assert.equal(audit.coverage.complete, true);
    assert.ok(audit.packages.some((item) => item.path === 'skills/group/beta-skill'));
    assert.equal(JSON.stringify(audit).includes('private'), false);
    const result = new CollectionRemediationService().evolve(target.selection, target.plan(), {
        apply: true,
        snapshotStore: target.store,
    });
    assert.equal(result.status, 'applied');
    assert.deepEqual(inventory(reserved), before);
    assert.deepEqual(fs.readdirSync(target.home), []);
});

for (const stage of ['before', 'after']) {
    for (const catalog of ['missing', 'stale']) {
        test(`${stage}-write failure restores original catalog ${catalog === 'missing' ? 'absence' : 'bytes and mode'}`, (t) => {
            const target = maintenanceFixture(t, { catalog });
            if (catalog === 'stale') fs.chmodSync(target.catalogFile, 0o640);
            class FailureRepository extends CollectionMaintenanceRepository {
                sync(selection) {
                    if (stage === 'after') super.sync(selection);
                    throw new Error('injected write failure');
                }
            }
            const before = inventory(target.collection);
            const result = new CollectionRemediationService(new FailureRepository()).evolve(
                target.selection,
                target.plan(),
                { apply: true, snapshotStore: target.store },
            );
            assert.equal(result.status, 'rolled_back');
            assert.equal(result.applied, false);
            assert.equal(result.verification.rollback, 'passed');
            assert.deepEqual(inventory(target.collection), before);
            assert.equal(fs.existsSync(join(result.snapshot, 'maintenance-result.json')), true);
        });
    }
}

test('failed rollback is distinguished and retains the verified recovery artifact', (t) => {
    const target = maintenanceFixture(t);
    class FailureRepository extends CollectionMaintenanceRepository {
        sync(selection) {
            super.sync(selection);
            throw new Error('injected');
        }
        restore() {
            throw new Error('injected rollback failure');
        }
    }
    const result = new CollectionRemediationService(new FailureRepository()).evolve(
        target.selection,
        target.plan(),
        { apply: true, snapshotStore: target.store },
    );
    assert.equal(result.status, 'rollback_failed');
    assert.equal(result.verification.rollback, 'failed');
    assert.equal(fs.existsSync(target.catalogFile), true);
    assert.equal(fs.existsSync(join(result.snapshot, 'manifest.json')), true);
    assert.equal(
        JSON.parse(fs.readFileSync(join(result.snapshot, 'maintenance-result.json'))).status,
        'rollback_failed',
    );
});

test('post-write permission drift fails verification and restores the original catalog mode', (t) => {
    const target = maintenanceFixture(t, { catalog: 'stale' });
    fs.chmodSync(target.catalogFile, 0o640);
    class ChangedModeRepository extends CollectionMaintenanceRepository {
        sync(selection) {
            super.sync(selection);
            fs.chmodSync(target.catalogFile, 0o600);
        }
    }
    const before = inventory(target.collection);
    const result = new CollectionRemediationService(new ChangedModeRepository()).evolve(
        target.selection,
        target.plan(),
        { apply: true, snapshotStore: target.store },
    );
    assert.equal(result.status, 'rolled_back');
    assert.deepEqual(inventory(target.collection), before);
});

test('drift during recovery preparation prevents a later catalog write', (t) => {
    const target = maintenanceFixture(t);
    class DriftingSnapshotRepository extends CollectionSnapshotRepository {
        prepare(...args) {
            const recovery = super.prepare(...args);
            fs.appendFileSync(join(target.alpha, 'SKILL.md'), '\nConcurrent edit.\n');
            return recovery;
        }
    }
    assert.throws(
        () =>
            new CollectionRemediationService(
                new CollectionMaintenanceRepository(),
                new DriftingSnapshotRepository(),
            ).evolve(target.selection, target.plan(), { apply: true, snapshotStore: target.store }),
        /stale/,
    );
    assert.equal(fs.existsSync(target.catalogFile), false);
    assert.match(fs.readFileSync(join(target.alpha, 'SKILL.md'), 'utf8'), /Concurrent edit/);
    assert.equal(
        fs.readdirSync(target.store).filter((name) => name.startsWith('catalog-')).length,
        1,
    );
});

test('a supported apply requires explicit recovery selection before it creates any state', (t) => {
    const target = maintenanceFixture(t);
    const before = inventory(target.root);
    assert.throws(
        () =>
            new CollectionRemediationService().evolve(target.selection, target.plan(), {
                apply: true,
            }),
        /snapshot-store/,
    );
    assert.deepEqual(inventory(target.root), before);
});

test('corrupt snapshot objects fail verified recovery before any catalog change', (t) => {
    const target = maintenanceFixture(t);
    class CorruptSnapshotRepository extends CollectionSnapshotRepository {
        recover(recovery) {
            const objects = join(target.store, '.objects/sha256');
            const first = fs.readdirSync(objects)[0];
            fs.chmodSync(join(objects, first), 0o600);
            fs.writeFileSync(join(objects, first), 'corrupt object');
            return super.recover(recovery);
        }
    }
    const before = inventory(target.collection);
    assert.throws(
        () =>
            new CollectionRemediationService(
                new CollectionMaintenanceRepository(),
                new CorruptSnapshotRepository(),
            ).evolve(target.selection, target.plan(), { apply: true, snapshotStore: target.store }),
        /Snapshot/,
    );
    assert.deepEqual(inventory(target.collection), before);
});

test('snapshot scope contains only catalog recovery bytes and never unrelated repository state', (t) => {
    const target = maintenanceFixture(t, { catalog: 'stale' });
    fs.mkdirSync(join(target.collection, '.git'));
    fs.writeFileSync(join(target.collection, '.git/private-object'), 'not snapshot material');
    fs.writeFileSync(join(target.collection, '.env'), 'unrelated secret sentinel');
    const result = new CollectionRemediationService().evolve(target.selection, target.plan(), {
        apply: true,
        snapshotStore: target.store,
    });
    assert.equal(result.status, 'applied');
    const manifest = JSON.parse(fs.readFileSync(join(result.snapshot, 'manifest.json')));
    assert.deepEqual(
        manifest.content.entries.map((entry) => entry.path),
        ['skills-catalog.json', 'state.json'],
    );
    assert.equal(
        fs.readFileSync(join(target.collection, '.env'), 'utf8'),
        'unrelated secret sentinel',
    );
});

test('overlapping and linked recovery paths fail without creating descendants', (t) => {
    const target = maintenanceFixture(t);
    const linked = join(target.root, 'alias');
    fs.symlinkSync(target.collection, linked);
    const paths = [
        join(target.collection, 'recovery'),
        join(linked, 'new-child'),
        'relative-store',
        target.root,
    ];
    for (const store of paths) {
        const before = inventory(target.root);
        assert.throws(
            () =>
                new CollectionRemediationService().evolve(target.selection, target.plan(), {
                    apply: true,
                    snapshotStore: store,
                }),
            /[Ss]napshot|absolute/,
        );
        assert.deepEqual(inventory(target.root), before);
    }
});

test('a case alias of the collection cannot create a recovery child on case-insensitive filesystems', (t) => {
    const target = maintenanceFixture(t);
    const alias = join(target.root, 'SELECTED');
    if (!fs.existsSync(alias)) {
        t.skip('Fixture volume distinguishes case');
        return;
    }
    const before = inventory(target.root);
    assert.throws(
        () =>
            new CollectionRemediationService().evolve(target.selection, target.plan(), {
                apply: true,
                snapshotStore: join(alias, 'new-recovery'),
            }),
        /[Ss]napshot/,
    );
    assert.deepEqual(inventory(target.root), before);
});

test('catalog output links are reported unsafe and cannot be overwritten', (t) => {
    const target = maintenanceFixture(t);
    const outside = join(target.root, 'outside-catalog');
    fs.writeFileSync(outside, '{}\n');
    for (const link of [fs.symlinkSync, fs.linkSync]) {
        link(outside, target.catalogFile);
        const audit = target.audit();
        assert.equal(audit.catalog.status, 'unavailable');
        assert.equal(audit.coverage.complete, false);
        const before = inventory(target.root);
        assert.throws(
            () =>
                new CollectionRemediationService().evolve(target.selection, target.plan(), {
                    apply: true,
                    snapshotStore: target.store,
                }),
            /coverage/,
        );
        assert.deepEqual(inventory(target.root), before);
        fs.unlinkSync(target.catalogFile);
    }
});

test('the shared byte budget makes coverage incomplete before a plan can authorize writes', (t) => {
    const target = maintenanceFixture(t);
    for (let index = 0; index < 17; index++) {
        const file = fs.openSync(join(target.alpha, `payload-${index}`), 'wx');
        fs.ftruncateSync(file, 4_194_304);
        fs.closeSync(file);
    }
    const audit = target.audit();
    assert.equal(audit.coverage.complete, false);
    assert.ok(audit.findings.some((item) => item.code === 'scope_limit'));
    assert.equal(target.plan().operations.length, 0);
    assert.equal(fs.existsSync(target.catalogFile), false);
    assert.equal(fs.existsSync(target.store), false);
});

test('selected audit and plan documents reject linked, duplicate and excessive JSON inputs', (t) => {
    const target = maintenanceFixture(t);
    const reader = new CollectionMaintenanceRepository();
    const selected = join(target.root, 'plan.json');
    fs.writeFileSync(selected, '{"schema_version":1,"schema_version":2}');
    assert.throws(() => reader.readDocument(selected), /duplicate/);
    fs.writeFileSync(selected, Buffer.alloc(1_048_577, 0x20));
    assert.throws(() => reader.readDocument(selected), /exceeds/);
    fs.unlinkSync(selected);
    fs.symlinkSync(join(target.alpha, 'SKILL.md'), selected);
    assert.throws(() => reader.readDocument(selected), /symlink/);
});

test('detached catalog derivation remains read-only and yields exactly the helper sync bytes', async (t) => {
    const target = maintenanceFixture(t);
    const detached = join(target.root, 'detached-catalog');
    fs.cpSync(join(repository, '.agents/skills/skills-catalog'), detached, { recursive: true });
    const helper = await import(pathToFileURL(join(detached, 'scripts/catalog_tools.mjs')).href);
    const before = inventory(target.collection);
    const expected = helper.deriveCatalog(target.collection, { layout: 'repository' });
    assert.deepEqual(expected, deriveCatalog(target.collection));
    assert.deepEqual(inventory(target.collection), before);
    helper.syncCatalog(target.collection);
    assert.equal(
        fs.readFileSync(target.catalogFile, 'utf8'),
        `${JSON.stringify(expected, null, 2)}\n`,
    );
    assert.equal(basename(detached), 'detached-catalog');
});
