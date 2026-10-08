import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
    symlinkSync,
    readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillInstallationConfiguration } from '../../../src/config/SkillInstallationConfiguration.ts';
import { InstalledCollectionConfiguration } from '../../../src/config/InstalledCollectionConfiguration.ts';
import {
    SkillBundleRepository,
    installationDigest,
} from '../../../src/repository/SkillBundleRepository.ts';
import { SkillInstallationRepository } from '../../../src/repository/SkillInstallationRepository.ts';
import { SkillInstallationService } from '../../../src/service/SkillInstallationService.ts';

function fixture(t, checkpoint) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-owned-install-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const source = join(root, 'bundle');
    const consumer = join(root, 'consumer');
    mkdirSync(consumer);
    mkdirSync(join(source, '.agents/skills'), { recursive: true });
    const put = (name, value = name) => {
        const path = join(source, '.agents/skills', name);
        mkdirSync(path, { recursive: true });
        writeFileSync(join(path, 'SKILL.md'), `Synthetic inert skill: ${value}\n`);
        writeFileSync(join(path, 'LICENSE'), 'Synthetic fixture license\n');
    };
    put('alpha');
    put('bravo');
    let version = '1.0.0';
    const bundle = new SkillBundleRepository(new InstalledCollectionConfiguration(source));
    bundle.bundle = () => {
        const packages = readdirSync(join(source, '.agents/skills'))
            .sort()
            .map((name) => bundle.inventory(join(source, '.agents/skills', name), name));
        return { version, catalog_sha256: installationDigest(JSON.stringify(packages)), packages };
    };
    const configuration = new SkillInstallationConfiguration({ project: consumer });
    const repository = new SkillInstallationRepository(configuration, bundle, checkpoint);
    const service = new SkillInstallationService(configuration, bundle, repository);
    return {
        root,
        source,
        consumer,
        put,
        bundle,
        configuration,
        repository,
        service,
        version: (value) => {
            version = value;
        },
    };
}

test('a native manager finishing between preflight and lock acquisition prevents loose staging', (t) => {
    const f = fixture(t);
    const locked = f.repository.locked.bind(f.repository);
    f.repository.locked = (callback) => {
        f.repository.directory(f.configuration.state, true);
        f.repository.publishNative('claude', {
            schema_version: 1,
            host: 'claude',
            root: f.configuration.root,
        });
        return locked(callback);
    };
    assert.throws(() => f.service.run('install', true), /native plugin route/);
    assert.equal(existsSync(join(f.configuration.skills, 'alpha')), false);
    assert.equal(f.repository.receipt(), null);
});

test('preview is read-only; repeated installation and removal are idempotent and preserve foreign files', (t) => {
    const f = fixture(t);
    assert.deepEqual(f.service.run('install').additions, ['alpha', 'bravo']);
    assert.equal(existsSync(f.configuration.root), false);
    assert.equal(f.service.run('install', true).written, true);
    assert.equal(f.service.run('install', true).written, false);
    const foreign = join(f.configuration.skills, 'foreign');
    mkdirSync(foreign);
    writeFileSync(join(foreign, 'user.txt'), 'Unrelated consumer bytes');
    const database = join(f.configuration.root, 'skills-usage.db');
    writeFileSync(database, 'Inert user evidence');
    const settings = join(f.consumer, 'settings.json');
    writeFileSync(settings, 'Unrelated host settings');
    const removed = f.service.run('uninstall', true);
    assert.deepEqual(removed.removals, ['alpha', 'bravo']);
    assert.equal(existsSync(join(f.configuration.skills, 'alpha')), false);
    assert.equal(
        readFileSync(join(removed.recovery, 'previous/alpha/SKILL.md'), 'utf8'),
        'Synthetic inert skill: alpha\n',
    );
    assert.equal(readFileSync(join(foreign, 'user.txt'), 'utf8'), 'Unrelated consumer bytes');
    assert.equal(readFileSync(database, 'utf8'), 'Inert user evidence');
    assert.equal(readFileSync(settings, 'utf8'), 'Unrelated host settings');
    assert.equal(f.service.run('uninstall', true).written, false);
});

test('upgrade adds, changes and prunes only unchanged owned packages; local edits block the entire operation', (t) => {
    const f = fixture(t);
    f.service.run('install', true);
    f.put('alpha', 'revised');
    rmSync(join(f.source, '.agents/skills/bravo'), { recursive: true });
    f.put('charlie');
    f.version('2.0.0');
    const before = readFileSync(join(f.configuration.state, 'receipt.json'));
    writeFileSync(join(f.configuration.skills, 'alpha/SKILL.md'), 'Local consumer edit');
    const blocked = f.service.run('upgrade');
    assert.equal(blocked.conflicts[0].reason, 'owned-content-changed-or-missing');
    assert.throws(() => f.service.run('upgrade', true), /Installation conflicts/);
    assert.deepEqual(readFileSync(join(f.configuration.state, 'receipt.json')), before);
    assert.equal(existsSync(join(f.configuration.skills, 'charlie')), false);
    writeFileSync(join(f.configuration.skills, 'alpha/SKILL.md'), 'Synthetic inert skill: alpha\n');
    const result = f.service.run('upgrade', true);
    assert.deepEqual(result.additions, ['charlie']);
    assert.deepEqual(result.replacements, ['alpha']);
    assert.deepEqual(result.removals, ['bravo']);
    assert.equal(existsSync(join(f.configuration.skills, 'bravo')), false);
    assert.equal(f.repository.receipt().version, '2.0.0');
    assert.equal(f.service.run('upgrade', true).written, false);
});

test('receipt-backed removal remains available when the current bundle is corrupt or absent', (t) => {
    const f = fixture(t);
    f.service.run('install', true);
    rmSync(join(f.source, '.agents/skills'), { recursive: true });
    assert.throws(() => f.bundle.bundle(), /ENOENT/);
    const preview = f.service.run('uninstall');
    assert.deepEqual(preview.removals, ['alpha', 'bravo']);
    assert.equal(preview.version, null);
    assert.equal(f.service.run('uninstall', true).written, true);
    assert.equal(f.repository.receipt(), null);
    assert.equal(existsSync(join(f.configuration.skills, 'alpha')), false);
    assert.equal(f.service.run('uninstall', true).written, false);
});

test('a missing selected project is refused without creating any part of the typo path', (t) => {
    const f = fixture(t);
    const typo = join(f.root, 'missing-parent', 'mistyped-project');
    const configuration = new SkillInstallationConfiguration({ project: typo });
    const service = new SkillInstallationService(configuration, f.bundle);
    assert.throws(() => service.run('install', true), /project must already exist/);
    assert.equal(existsSync(join(f.root, 'missing-parent')), false);
});

test('linked project ancestors are refused before creating managed descendants', (t) => {
    const f = fixture(t);
    const link = join(f.root, 'linked-project-parent');
    symlinkSync(f.root, link, 'dir');
    const configuration = new SkillInstallationConfiguration({ project: join(link, 'consumer') });
    assert.throws(
        () => new SkillInstallationService(configuration, f.bundle).run('install', true),
        /ordinary directories/,
    );
    assert.equal(existsSync(f.configuration.root), false);
});

for (const phase of ['staged', 'withdrawn', 'published', 'receipt']) {
    test(`a stopped ${phase} transaction retains recovery evidence and restores the complete prior state`, (t) => {
        let stop = false;
        const f = fixture(t, (current) => {
            if (stop && current === phase) throw new Error('Synthetic interruption');
        });
        f.service.run('install', true);
        f.put('alpha', 'changed');
        f.put('charlie');
        stop = true;
        assert.throws(() => f.service.run('upgrade', true), /Synthetic interruption/);
        assert.ok(f.repository.pending());
        assert.throws(() => f.service.run('install', true), /recover/);
        assert.equal(f.service.run('recover').written, false);
        stop = false;
        assert.equal(f.service.run('recover', true).written, true);
        assert.equal(
            readFileSync(join(f.configuration.skills, 'alpha/SKILL.md'), 'utf8'),
            'Synthetic inert skill: alpha\n',
        );
        assert.equal(existsSync(join(f.configuration.skills, 'charlie')), false);
        assert.equal(f.repository.receipt().version, '1.0.0');
        assert.equal(f.repository.pending(), null);
    });
}

test('deleted published replacements block recovery before recreating content or changing other packages', (t) => {
    let stop = false;
    const f = fixture(t, (phase) => {
        if (stop && phase === 'published') throw new Error('Interrupted');
    });
    f.service.run('install', true);
    f.put('alpha', 'replacement');
    stop = true;
    assert.throws(() => f.service.run('upgrade', true), /Interrupted/);
    stop = false;
    const pending = readFileSync(join(f.configuration.state, 'pending.json'));
    const bravo = readFileSync(join(f.configuration.skills, 'bravo/SKILL.md'));
    rmSync(join(f.configuration.skills, 'alpha'), { recursive: true });
    assert.throws(() => f.service.run('recover', true), /consumer deletion blocks recovery/);
    assert.equal(existsSync(join(f.configuration.skills, 'alpha')), false);
    assert.deepEqual(readFileSync(join(f.configuration.skills, 'bravo/SKILL.md')), bravo);
    assert.deepEqual(readFileSync(join(f.configuration.state, 'pending.json')), pending);
});

for (const interruptedFile of [1, 3])
    test(`staging interruption after file ${interruptedFile} keeps complete prior packages and exposes no pending mutation`, (t) => {
        let stop = false;
        let files = 0;
        const f = fixture(t, (phase) => {
            if (stop && phase === 'candidate-file' && ++files === interruptedFile)
                throw new Error('Interrupted staging');
        });
        f.service.run('install', true);
        const before = f.repository.receipt();
        f.put('alpha', 'replacement');
        f.put('bravo', 'replacement');
        stop = true;
        assert.throws(() => f.service.run('upgrade', true), /Interrupted staging/);
        assert.equal(f.repository.pending(), null);
        assert.deepEqual(f.repository.receipt(), before);
        for (const item of before.packages)
            assert.equal(f.repository.actual(item.name).sha256, item.sha256);
        assert.equal(f.service.run('recover', true).written, false);
    });

test('a source read failure during partial staging preserves the installed receipt and permits a fresh retry', (t) => {
    const f = fixture(t);
    f.service.run('install', true);
    const before = f.repository.receipt();
    f.put('alpha', 'replacement');
    const bytes = f.bundle.bytes.bind(f.bundle);
    let reads = 0;
    f.bundle.bytes = (name, path) => {
        if (++reads === 2) throw new Error('Source read failed');
        return bytes(name, path);
    };
    assert.throws(() => f.service.run('upgrade', true), /Source read failed/);
    assert.equal(f.repository.pending(), null);
    assert.deepEqual(f.repository.receipt(), before);
    for (const item of before.packages)
        assert.equal(f.repository.actual(item.name).sha256, item.sha256);
    f.bundle.bytes = bytes;
    assert.equal(f.service.run('upgrade', true).written, true);
});

test('new installation interruption withdraws only its new owned packages on recovery', (t) => {
    const f = fixture(t, (phase) => {
        if (phase === 'published') throw new Error('Interrupted');
    });
    assert.throws(() => f.service.run('install', true), /Interrupted/);
    assert.equal(f.repository.receipt(), null);
    assert.equal(f.service.run('recover', true).written, true);
    assert.equal(existsSync(join(f.configuration.skills, 'alpha')), false);
});

test('unmanaged collisions and linked paths are refused before creating installation state', (t) => {
    const f = fixture(t);
    mkdirSync(join(f.configuration.skills, 'alpha'), { recursive: true });
    writeFileSync(join(f.configuration.skills, 'alpha/SKILL.md'), 'Foreign alpha');
    writeFileSync(join(f.configuration.skills, 'alpha/LICENSE'), 'Foreign license');
    assert.equal(f.service.run('install').conflicts[0].reason, 'unmanaged-collision');
    assert.throws(() => f.service.run('install', true), /conflicts/);
    assert.equal(existsSync(f.configuration.state), false);
    rmSync(join(f.configuration.skills, 'alpha'), { recursive: true });
    symlinkSync(join(f.source, '.agents/skills/alpha'), join(f.configuration.skills, 'alpha'));
    assert.equal(f.service.run('install').conflicts[0].reason, 'unsafe-installed-path');
    assert.throws(() => f.service.run('install', true), /conflicts/);
    assert.equal(existsSync(f.configuration.state), false);
});

test('consumer edits after interruption refuse recovery before touching any other package', (t) => {
    let stop = false;
    const f = fixture(t, (phase) => {
        if (stop && phase === 'published') throw new Error('Interrupted');
    });
    f.service.run('install', true);
    f.put('alpha', 'changed');
    stop = true;
    assert.throws(() => f.service.run('upgrade', true));
    writeFileSync(
        join(f.configuration.skills, 'alpha/SKILL.md'),
        'Post-interruption consumer edit',
    );
    assert.throws(() => f.service.run('recover', true), /Consumer edits/);
    assert.equal(
        readFileSync(join(f.configuration.skills, 'alpha/SKILL.md'), 'utf8'),
        'Post-interruption consumer edit',
    );
    assert.ok(f.repository.pending());
});

for (const recoveryPhase of ['recover-withdrawn', 'recover-restored']) {
    test(`recovery interrupted at ${recoveryPhase} can resume without discarding evidence`, (t) => {
        let phase = null;
        const f = fixture(t, (current) => {
            if (phase === current) throw new Error('Interrupted');
        });
        f.service.run('install', true);
        f.put('alpha', 'changed');
        phase = 'published';
        assert.throws(() => f.service.run('upgrade', true));
        phase = recoveryPhase;
        assert.throws(() => f.service.run('recover', true));
        assert.ok(f.repository.pending());
        phase = null;
        assert.equal(f.service.run('recover', true).written, true);
        assert.equal(
            readFileSync(join(f.configuration.skills, 'alpha/SKILL.md'), 'utf8'),
            'Synthetic inert skill: alpha\n',
        );
        assert.equal(f.repository.pending(), null);
    });
}

test('recover clears a stopped owner lock without a journal but refuses a live owner', (t) => {
    const f = fixture(t);
    f.repository.directory(f.configuration.state, true);
    const lock = join(f.configuration.state, 'lock.json');
    writeFileSync(lock, JSON.stringify({ pid: process.pid, nonce: 'synthetic-live-owner' }));
    assert.equal(f.service.run('recover').written, false);
    assert.throws(() => f.service.run('recover', true), /may still be running/);
    assert.equal(existsSync(lock), true);
    const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], {
        cwd: f.root,
        encoding: 'utf8',
        timeout: 5000,
    });
    assert.equal(child.status, 0);
    writeFileSync(
        lock,
        JSON.stringify({ pid: Number(child.stdout), nonce: 'synthetic-stopped-owner' }),
    );
    assert.equal(f.service.run('recover', true).recovered_lock, true);
    assert.equal(existsSync(lock), false);
    assert.equal(f.service.run('install', true).written, true);
});

test('a complete journal above 1 MiB stays readable and recoverable within the fixed 4 MiB bound', (t) => {
    let stop = false;
    const f = fixture(t, (phase) => {
        if (stop && phase === 'published') throw new Error('Interrupted');
    });
    for (let i = 0; i < 1900; i++) {
        writeFileSync(
            join(
                f.source,
                '.agents/skills/alpha',
                `entry-${String(i).padStart(4, '0')}-${'x'.repeat(160)}.txt`,
            ),
            'x',
        );
    }
    f.service.run('install', true);
    f.put('alpha', 'changed');
    stop = true;
    assert.throws(() => f.service.run('upgrade', true), /Interrupted/);
    assert.ok(readFileSync(join(f.configuration.state, 'pending.json')).length > 1_048_576);
    assert.ok(f.repository.pending());
    stop = false;
    assert.equal(f.service.run('recover', true).written, true);
    assert.equal(
        readFileSync(join(f.configuration.skills, 'alpha/SKILL.md'), 'utf8'),
        'Synthetic inert skill: alpha\n',
    );
});

test('a source inside the destination with a dot-prefixed name is refused before state creation', (t) => {
    const f = fixture(t);
    const source = join(f.configuration.root, '..bundle');
    mkdirSync(source, { recursive: true });
    f.bundle.configuration = new InstalledCollectionConfiguration(source);
    assert.throws(() => f.service.run('install', true), /must not overlap/);
    assert.equal(existsSync(f.configuration.state), false);
});

test('tampered inventory digests and copied journals are refused before package mutations', (t) => {
    let phase = null;
    const f = fixture(t, (current) => {
        if (phase === current) throw new Error('Interrupted');
    });
    f.service.run('install', true);
    const receipt = join(f.configuration.state, 'receipt.json');
    const before = readFileSync(receipt);
    const forged = JSON.parse(before);
    forged.packages[0].entries[0].bytes++;
    writeFileSync(receipt, JSON.stringify(forged));
    assert.throws(() => f.service.run('uninstall', true), /digest differs/);
    assert.equal(
        readFileSync(join(f.configuration.skills, 'alpha/SKILL.md'), 'utf8'),
        'Synthetic inert skill: alpha\n',
    );
    writeFileSync(receipt, before);
    f.put('alpha', 'changed');
    phase = 'published';
    assert.throws(() => f.service.run('upgrade', true));
    const pending = join(f.configuration.state, 'pending.json');
    const journal = JSON.parse(readFileSync(pending));
    journal.id = '10000000-0000-4000-8000-000000000001';
    writeFileSync(pending, JSON.stringify(journal));
    assert.throws(() => f.service.run('recover', true), /transaction is missing/);
    assert.equal(
        readFileSync(join(f.configuration.skills, 'alpha/SKILL.md'), 'utf8'),
        'Synthetic inert skill: changed\n',
    );
});
