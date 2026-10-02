// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {
    chmodSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    lstatSync,
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { InstalledCollectionConfiguration } from '../../../src/config/InstalledCollectionConfiguration.ts';
import { HookInstallationService } from '../../../src/service/HookInstallationService.ts';
import { HookSettingsRepository } from '../../../src/repository/HookSettingsRepository.ts';
import { HookObserverRuntimeRepository } from '../../../src/repository/HookObserverRuntimeRepository.ts';

function fixture(t, host = 'claude') {
    const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'i9-hook-setup-')));
    const root = join(workspace, 'runtime');
    mkdirSync(root);
    t.after(() => {
        const unseal = (directory) => {
            chmodSync(directory, 0o755);
            for (const name of readdirSync(directory)) {
                const selected = join(directory, name);
                const info = lstatSync(selected);
                if (info.isDirectory() && !info.isSymbolicLink()) unseal(selected);
            }
        };
        unseal(workspace);
        rmSync(workspace, { recursive: true, force: true });
    });
    for (const directory of ['bin', 'src']) mkdirSync(join(root, directory));
    mkdirSync(join(workspace, 'skills'));
    writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
            name: '@i-9.ai/skills',
            bin: { 'i9-skills': './bin/index.mjs' },
            dependencies: { '@oclif/core': '1.0.0', yaml: '1.0.0' },
        }),
    );
    writeFileSync(join(root, 'bin/index.mjs'), '// Synthetic local launcher.\n');
    writeFileSync(join(root, 'src/observer.ts'), '// Synthetic imported observer.\n');
    for (const name of ['@oclif/core', 'yaml']) {
        const directory = join(root, 'node_modules', name);
        mkdirSync(directory, { recursive: true });
        writeFileSync(
            join(directory, 'package.json'),
            JSON.stringify({ name, version: '1.0.0', main: 'index.js' }),
        );
        writeFileSync(join(directory, 'index.js'), '// Synthetic local dependency.\n');
        chmodSync(join(directory, 'package.json'), 0o444);
        chmodSync(join(directory, 'index.js'), 0o444);
    }
    for (const filename of ['package.json', 'bin/index.mjs', 'src/observer.ts'])
        chmodSync(join(root, filename), 0o444);
    const seal = (directory) => {
        for (const name of readdirSync(directory)) {
            const selected = join(directory, name);
            if (lstatSync(selected).isDirectory()) seal(selected);
        }
        chmodSync(directory, 0o555);
    };
    seal(root);
    const file = join(workspace, 'settings.json');
    const runtime = new HookObserverRuntimeRepository(new InstalledCollectionConfiguration(root));
    const service = new HookInstallationService(new HookSettingsRepository(), runtime);
    return {
        root,
        workspace,
        file,
        service,
        input: {
            file,
            host,
            database: join(workspace, 'usage.db'),
            collections: ['project=' + join(workspace, 'skills')],
            executable: process.execPath,
        },
    };
}
function reviewed(service, input) {
    return { ...input, reviewedRegistrationDigest: service.enable(input).registration_digest };
}

function changeRetainedRuntime(root, operation) {
    const mode = (directory, writable) => {
        chmodSync(directory, writable ? 0o755 : 0o555);
        for (const name of readdirSync(directory)) {
            const file = join(directory, name);
            if (lstatSync(file).isDirectory()) mode(file, writable);
            else chmodSync(file, writable ? 0o644 : 0o444);
        }
    };
    mode(root, true);
    try {
        operation();
    } finally {
        mode(root, false);
    }
}

function dependencyFixture(modules, name, manifest = {}, body = '// Synthetic dependency.\n') {
    const directory = join(modules, name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
        join(directory, 'package.json'),
        JSON.stringify({ name, version: '1.0.0', main: 'index.js', ...manifest }),
    );
    writeFileSync(join(directory, 'index.js'), body);
    return directory;
}
for (const host of ['claude', 'codex', 'gemini', 'copilot']) {
    test(host + ': reviewed enable, status and exact removal preserve unrelated state', (t) => {
        const { input, file, service } = fixture(t, host);
        const event =
            host === 'copilot' ? 'preToolUse' : host === 'gemini' ? 'BeforeTool' : 'PreToolUse';
        const existing = { type: 'command', command: 'echo unrelated' };
        writeFileSync(file, JSON.stringify({ theme: 'retain', hooks: { [event]: [existing] } }));
        const before = readFileSync(file);
        const preview = service.enable(input);
        assert.equal(preview.written, false);
        assert.match(preview.registration_digest, /^[a-f0-9]{64}$/);
        assert.ok(preview.runtime_identity.inventory.file_count >= 3);
        assert.deepEqual(readFileSync(file), before);
        assert.equal(existsSync(file + '.i9-skills.json'), false);
        assert.throws(() => service.enable(input, true), /exact reviewed/);
        const selected = { ...input, reviewedRegistrationDigest: preview.registration_digest };
        assert.equal(service.enable(selected, true).written, true);
        const enabled = readFileSync(file);
        assert.equal(service.status(input).runtime_available, true);
        assert.equal(service.status(input).enabled, true);
        assert.equal(service.enable(selected, true).written, false);
        assert.deepEqual(readFileSync(file), enabled);
        writeFileSync(input.database, 'Existing evidence is retained.\n');
        assert.equal(service.disable(input).written, false);
        assert.equal(service.disable(input, true).enabled, false);
        const disabled = JSON.parse(readFileSync(file));
        assert.equal(disabled.theme, 'retain');
        assert.deepEqual(disabled.hooks[event], [existing]);
        assert.equal(readFileSync(input.database, 'utf8'), 'Existing evidence is retained.\n');
        assert.equal(service.status(input).enabled, false);
    });
}
test('read-only status creates no settings, receipt or evidence', (t) => {
    const { input, service } = fixture(t);
    assert.equal(service.status(input).enabled, false);
    for (const file of [input.file, input.file + '.i9-skills.json', input.database])
        assert.equal(existsSync(file), false);
});
test('changed imported runtime invalidates reviewed write and status; removal remains available', (t) => {
    const { root, input, service } = fixture(t);
    const selected = reviewed(service, input);
    chmodSync(join(root, 'src/observer.ts'), 0o644);
    writeFileSync(join(root, 'src/observer.ts'), '// Changed import after preview.\n');
    chmodSync(join(root, 'src/observer.ts'), 0o444);
    assert.throws(() => service.enable(selected, true), /exact reviewed/);
    assert.equal(existsSync(input.file), false);
    service.enable(reviewed(service, input), true);
    chmodSync(join(root, 'src/observer.ts'), 0o644);
    writeFileSync(join(root, 'src/observer.ts'), '// Changed import after enable.\n');
    chmodSync(join(root, 'src/observer.ts'), 0o444);
    assert.equal(service.status(input).enabled, true);
    assert.equal(service.status(input).runtime_available, false);
    assert.equal(service.disable(input, true).enabled, false);
});
test('unrelated binaries, scripts and runtime links are rejected before state writes', (t) => {
    const { root, workspace, input, service } = fixture(t);
    const unrelated = join(workspace, 'unrelated');
    writeFileSync(unrelated, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    for (const selection of [{ executable: unrelated }, { launcher: unrelated }]) {
        assert.throws(
            () => service.enable({ ...input, ...selection }, true),
            /running Node|unrelated scripts/,
        );
        assert.equal(existsSync(input.file), false);
    }
    chmodSync(join(root, 'src'), 0o755);
    symlinkSync(join(root, 'src/observer.ts'), join(root, 'src/linked.ts'));
    chmodSync(join(root, 'src'), 0o555);
    assert.throws(() => service.enable(input), /cannot be linked/);
    assert.equal(existsSync(input.file + '.i9-skills.json'), false);
});
test('shared-writable import assets are refused', (t) => {
    const { root, input, service } = fixture(t);
    chmodSync(join(root, 'src/observer.ts'), 0o666);
    assert.throws(() => service.enable(input), /read-only/);
    assert.equal(existsSync(input.file), false);
});

test('owner-writable retained runtime roots are refused before settings writes', (t) => {
    const { root, input, service } = fixture(t);
    chmodSync(root, 0o755);
    assert.throws(() => service.enable(input), /read-only observer runtime root/);
    assert.equal(existsSync(input.file), false);
    assert.equal(existsSync(input.file + '.i9-skills.json'), false);
});

test('owner-writable imports and dependency resolution outside the retained tree are refused', (t) => {
    const { root, input, service } = fixture(t);
    chmodSync(join(root, 'src/observer.ts'), 0o644);
    assert.throws(() => service.enable(input), /read-only/);
    chmodSync(join(root, 'src/observer.ts'), 0o444);
    const nested = join(root, 'nested-runtime');
    chmodSync(root, 0o755);
    for (const directory of ['bin', 'src', 'node_modules/@oclif/core'])
        mkdirSync(join(nested, directory), { recursive: true });
    for (const filename of [
        'package.json',
        'bin/index.mjs',
        'src/observer.ts',
        'node_modules/@oclif/core/index.js',
        'node_modules/@oclif/core/package.json',
    ]) {
        copyFileSync(join(root, filename), join(nested, filename));
        chmodSync(join(nested, filename), 0o444);
    }
    const seal = (directory) => {
        for (const name of readdirSync(directory)) {
            const selected = join(directory, name);
            if (lstatSync(selected).isDirectory()) seal(selected);
        }
        chmodSync(directory, 0o555);
    };
    seal(nested);
    chmodSync(root, 0o555);
    const selected = new HookInstallationService(
        new HookSettingsRepository(),
        new HookObserverRuntimeRepository(new InstalledCollectionConfiguration(nested)),
    );
    assert.throws(() => selected.enable(input), /inside the retained runtime inventory/);
    assert.equal(existsSync(input.file), false);
    assert.equal(existsSync(input.file + '.i9-skills.json'), false);
});

test('transitive external leaf is rejected at preview and after outside-only drift without evaluation', (t) => {
    const { root, workspace, input, service } = fixture(t);
    const marker = join(workspace, 'module-evaluated');
    changeRetainedRuntime(root, () => {
        dependencyFixture(
            join(root, 'node_modules'),
            '@oclif/core',
            { dependencies: { 'outside-leaf': '1.0.0' } },
            "module.exports = require('outside-leaf');\n",
        );
    });
    const outside = dependencyFixture(
        join(workspace, 'node_modules'),
        'outside-leaf',
        {},
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'must not execute');\n`,
    );
    writeFileSync(input.file, '{"retain":true}');
    const before = readFileSync(input.file);
    assert.throws(() => service.enable(input), /inside the retained runtime inventory/);
    writeFileSync(join(outside, 'index.js'), '// Only the mutable external leaf changed.\n');
    assert.throws(
        () => service.enable({ ...input, reviewedRegistrationDigest: '0'.repeat(64) }, true),
        /inside the retained runtime inventory/,
    );
    assert.deepEqual(readFileSync(input.file), before);
    assert.equal(existsSync(input.file + '.i9-skills.json'), false);
    assert.equal(existsSync(input.database), false);
    assert.equal(existsSync(marker), false);
});

test('dependency traversal honors importer-relative nesting, cycles and absent optional/type-only packages', (t) => {
    const { root, input, service } = fixture(t);
    changeRetainedRuntime(root, () => {
        const modules = join(root, 'node_modules');
        const core = dependencyFixture(modules, '@oclif/core', {
            dependencies: {
                'selected-leaf': '1.0.0',
                'type-only': '1.0.0',
                'import-only': '1.0.0',
            },
            optionalDependencies: { 'absent-optional': '1.0.0' },
            peerDependencies: { 'absent-peer': '1.0.0' },
            peerDependenciesMeta: { 'absent-peer': { optional: true } },
        });
        // This inactive root copy must not replace the closer selected nested dependency.
        dependencyFixture(modules, 'selected-leaf', { dependencies: { unavailable: '1.0.0' } });
        dependencyFixture(join(core, 'node_modules'), 'selected-leaf', {
            dependencies: { '@oclif/core': '1.0.0' },
        });
        const types = dependencyFixture(modules, 'type-only', {
            main: undefined,
            types: 'index.d.ts',
        });
        rmSync(join(types, 'index.js'));
        writeFileSync(join(types, 'index.d.ts'), 'export type Synthetic = string;\n');
        dependencyFixture(modules, 'import-only', {
            type: 'module',
            exports: { '.': { import: './index.js' } },
        });
    });
    const preview = service.enable(input);
    assert.equal(preview.written, false);
    service.enable({ ...input, reviewedRegistrationDigest: preview.registration_digest }, true);
    assert.equal(service.status(input).runtime_available, true);
    assert.equal(service.disable(input, true).enabled, false);
});

test('present optional or optional-peer dependencies outside the inventory are refused', (t) => {
    for (const field of ['optionalDependencies', 'peerDependencies']) {
        const { root, workspace, input, service } = fixture(t);
        changeRetainedRuntime(root, () => {
            dependencyFixture(join(root, 'node_modules'), '@oclif/core', {
                [field]: { 'outside-optional': '1.0.0' },
                peerDependenciesMeta: { 'outside-optional': { optional: true } },
            });
        });
        dependencyFixture(join(workspace, 'node_modules'), 'outside-optional');
        assert.throws(() => service.enable(input), /inside the retained runtime inventory/);
        assert.equal(existsSync(input.file), false);
    }
});

test('missing required or oversized dependency declarations fail before settings writes', (t) => {
    for (const dependencies of [
        { 'missing-required': '1.0.0' },
        Object.fromEntries(
            Array.from({ length: 257 }, (_, index) => ['bounded-' + index, '1.0.0']),
        ),
    ]) {
        const { root, input, service } = fixture(t);
        changeRetainedRuntime(root, () => {
            dependencyFixture(join(root, 'node_modules'), '@oclif/core', { dependencies });
        });
        assert.throws(() => service.enable(input), /unavailable|exceed/);
        assert.equal(existsSync(input.file), false);
        assert.equal(existsSync(input.file + '.i9-skills.json'), false);
    }
});

test('modified owned entries require reconciliation', (t) => {
    const { input, file, service } = fixture(t);
    service.enable(reviewed(service, input), true);
    const settings = JSON.parse(readFileSync(file));
    settings.hooks.PreToolUse[0].hooks[0].command += ' operator-change';
    writeFileSync(file, JSON.stringify(settings));
    const before = readFileSync(file);
    assert.equal(service.status(input).registration_changed, true);
    assert.throws(() => service.disable(input, true), /changed/);
    assert.deepEqual(readFileSync(file), before);
});
test('legacy receipts retain exact removal without a bound-runtime claim', (t) => {
    const { input, file, service } = fixture(t);
    service.enable(reviewed(service, input), true);
    const receiptFile = file + '.i9-skills.json';
    const receipt = JSON.parse(readFileSync(receiptFile));
    delete receipt.runtime_identity;
    delete receipt.registration_digest;
    writeFileSync(receiptFile, JSON.stringify(receipt));
    assert.equal(service.status(input).legacy_runtime_unbound, true);
    assert.equal(service.status(input).runtime_available, false);
    assert.equal(service.disable(input, true).enabled, false);
});
test('malformed settings, links and stale snapshots are rejected', (t) => {
    const { workspace, file } = fixture(t);
    const repository = new HookSettingsRepository();
    writeFileSync(file, '{broken');
    assert.throws(() => repository.read(file));
    writeFileSync(file, '{}');
    const snapshot = repository.read(file);
    writeFileSync(file, '{"user":true}');
    assert.throws(() => repository.replace(snapshot, {}), /concurrently/);
    const link = join(workspace, 'linked.json');
    symlinkSync(file, link);
    assert.throws(() => repository.read(link), /without links/);
});
