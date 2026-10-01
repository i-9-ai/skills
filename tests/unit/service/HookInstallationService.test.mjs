// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {
    chmodSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
    existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { HookInstallationService } from '../../../src/service/HookInstallationService.ts';
import { HookSettingsRepository } from '../../../src/repository/HookSettingsRepository.ts';

function fixture(t, host = 'claude') {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-hook-setup-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const file = join(root, 'settings.json');
    return {
        root,
        file,
        input: {
            file,
            host,
            database: join(root, 'usage.db'),
            collections: ['project=' + root],
            executable: process.execPath,
        },
    };
}

for (const host of ['claude', 'codex', 'gemini', 'copilot']) {
    test(host + ': preview, enable, status and disable preserve unrelated settings', (t) => {
        const { input, file } = fixture(t, host);
        const event =
            host === 'copilot' ? 'preToolUse' : host === 'gemini' ? 'BeforeTool' : 'PreToolUse';
        const existing = { type: 'command', command: 'echo unrelated' };
        writeFileSync(file, JSON.stringify({ theme: 'dark', hooks: { [event]: [existing] } }));
        const service = new HookInstallationService();
        const before = readFileSync(file);
        assert.equal(service.enable(input).written, false);
        assert.deepEqual(readFileSync(file), before);
        assert.equal(existsSync(file + '.i9-skills.json'), false);
        assert.equal(service.enable(input, true).written, true);
        const enabledBytes = readFileSync(file);
        assert.equal(service.status(input).enabled, true);
        assert.equal(service.status(input).runtime_available, true);
        assert.equal(service.enable(input, true).written, false);
        assert.deepEqual(readFileSync(file), enabledBytes);
        assert.equal(existsSync(input.database), false);
        assert.equal(service.disable(input).written, false);
        assert.deepEqual(readFileSync(file), enabledBytes);
        assert.equal(service.disable(input, true).enabled, false);
        const disabled = JSON.parse(readFileSync(file));
        assert.equal(disabled.theme, 'dark');
        assert.deepEqual(disabled.hooks[event], [existing]);
        assert.equal(service.disable(input, true).written, false);
        assert.equal(service.status(input).enabled, false);
    });
}

test('read-only status never creates settings, receipt or database', (t) => {
    const { input } = fixture(t);
    assert.equal(new HookInstallationService().status(input).enabled, false);
    for (const path of [input.file, input.file + '.i9-skills.json', input.database])
        assert.equal(existsSync(path), false);
});

test('modified owned entries block removal without altering the config', (t) => {
    const { input, file } = fixture(t);
    const service = new HookInstallationService();
    service.enable(input, true);
    const settings = JSON.parse(readFileSync(file));
    settings.hooks.PreToolUse[0].hooks[0].command += ' user-edit';
    writeFileSync(file, JSON.stringify(settings));
    const before = readFileSync(file);
    assert.equal(service.status(input).registration_changed, true);
    assert.throws(() => service.disable(input, true), /changed/);
    assert.deepEqual(readFileSync(file), before);
});

test('malformed settings, links and stale snapshots are rejected', (t) => {
    const { root, file } = fixture(t);
    const repository = new HookSettingsRepository();
    writeFileSync(file, '{broken');
    assert.throws(() => repository.read(file));
    writeFileSync(file, '{}');
    const snapshot = repository.read(file);
    writeFileSync(file, '{"user":true}');
    assert.throws(() => repository.replace(snapshot, {}), /concurrently/);
    const link = join(root, 'linked.json');
    symlinkSync(file, link);
    assert.throws(() => repository.read(link), /without links/);
    const dangling = join(root, 'dangling.json');
    symlinkSync(join(root, 'missing'), dangling);
    assert.throws(() => repository.read(dangling), /symbolic link/);
});

test('status reports a removed runtime without changing evidence', (t) => {
    const { root, input } = fixture(t);
    const executable = join(root, 'runtime');
    writeFileSync(executable, '# synthetic runtime', { mode: 0o755 });
    const service = new HookInstallationService();
    service.enable({ ...input, executable }, true);
    rmSync(executable);
    assert.equal(service.status(input).runtime_available, false);
    assert.equal(service.status(input).enabled, true);
});

test('installed executable links resolve to the actual package runtime', (t) => {
    const { root, input } = fixture(t);
    const installed = join(root, 'installed-cli');
    const executable = join(root, 'i9-skills');
    writeFileSync(installed, '# synthetic installed launcher', { mode: 0o755 });
    symlinkSync(installed, executable);
    const service = new HookInstallationService();
    service.enable({ ...input, executable }, true);
    const receipt = JSON.parse(readFileSync(input.file + '.i9-skills.json'));
    assert.deepEqual(receipt.runtime, [installed]);
    assert.equal(service.status(input).runtime_available, true);
    assert.equal(service.disable(input, true).enabled, false);
});

test(
    'non-executable runtime is rejected before preview or settings writes',
    { skip: process.platform === 'win32' },
    (t) => {
        const { root, input, file } = fixture(t, 'copilot');
        const executable = join(root, 'readable-cli');
        writeFileSync(executable, '#!/bin/sh\nexit 0\n', { mode: 0o600 });
        writeFileSync(file, '{"theme":"retained"}\n');
        const before = readFileSync(file);
        const service = new HookInstallationService();
        for (const write of [false, true]) {
            assert.throws(
                () => service.enable({ ...input, executable }, write),
                /must be executable/,
            );
            assert.deepEqual(readFileSync(file), before);
            assert.equal(existsSync(file + '.i9-skills.json'), false);
            assert.equal(existsSync(input.database), false);
        }
    },
);

test(
    'runtime permission loss is reported read-only and does not prevent removal',
    { skip: process.platform === 'win32' },
    (t) => {
        const { root, input, file } = fixture(t, 'copilot');
        const executable = join(root, 'runtime');
        writeFileSync(executable, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
        const service = new HookInstallationService();
        service.enable({ ...input, executable }, true);
        writeFileSync(input.database, 'Existing evidence remains unchanged.\n');
        const before = [file, file + '.i9-skills.json', input.database].map((path) =>
            readFileSync(path),
        );
        chmodSync(executable, 0o600);
        assert.equal(service.status(input).enabled, true);
        assert.equal(service.status(input).runtime_available, false);
        assert.deepEqual(
            [file, file + '.i9-skills.json', input.database].map((path) => readFileSync(path)),
            before,
        );
        assert.equal(service.disable(input, true).enabled, false);
        assert.deepEqual(readFileSync(input.database), before[2]);
    },
);

test('Node launcher only needs read permission', (t) => {
    const { root, input } = fixture(t);
    const launcher = join(root, 'launcher.mjs');
    writeFileSync(launcher, '// Synthetic Node input.\n', { mode: 0o600 });
    const service = new HookInstallationService();
    service.enable({ ...input, launcher }, true);
    assert.equal(service.status(input).runtime_available, true);
});

test(
    'unreadable launcher is rejected and later permission loss is unavailable',
    { skip: process.platform === 'win32' || process.getuid?.() === 0 },
    (t) => {
        const { root, input, file } = fixture(t);
        const launcher = join(root, 'launcher.mjs');
        writeFileSync(launcher, '// Synthetic Node input.\n', { mode: 0o000 });
        const service = new HookInstallationService();
        assert.throws(() => service.enable({ ...input, launcher }, true), /must be readable/);
        assert.equal(existsSync(file), false);
        assert.equal(existsSync(file + '.i9-skills.json'), false);
        chmodSync(launcher, 0o600);
        service.enable({ ...input, launcher }, true);
        const before = readFileSync(file);
        chmodSync(launcher, 0o000);
        assert.equal(service.status(input).runtime_available, false);
        assert.deepEqual(readFileSync(file), before);
        assert.equal(existsSync(input.database), false);
    },
);

test('changed selections and duplicated owned entries require reconciliation', (t) => {
    const { input, file, root } = fixture(t);
    const service = new HookInstallationService();
    service.enable(input, true);
    const before = readFileSync(file);
    assert.throws(
        () => service.enable({ ...input, database: join(root, 'other.db') }, true),
        /options changed/,
    );
    assert.deepEqual(readFileSync(file), before);
    const value = JSON.parse(before);
    value.hooks.PreToolUse.push(value.hooks.PreToolUse[0]);
    writeFileSync(file, JSON.stringify(value));
    assert.equal(service.status(input).registration_changed, true);
    assert.throws(() => service.disable(input, true), /duplicated/);
});
