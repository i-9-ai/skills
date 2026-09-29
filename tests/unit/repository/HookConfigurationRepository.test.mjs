// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { linkSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { HookConfigurationRepository } from '../../../src/repository/HookConfigurationRepository.ts';

test('configuration reads reject links, oversized files and duplicate fields', (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'hook-config-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const repository = new HookConfigurationRepository();
    const original = join(directory, 'original.json');
    writeFileSync(original, '{"hooks":{}}');
    assert.deepEqual(repository.readHookConfiguration(original), { hooks: {} });

    const linked = join(directory, 'linked.json');
    symlinkSync(original, linked);
    assert.throws(() => repository.readHookConfiguration(linked));
    linkSync(original, join(directory, 'hard.json'));
    assert.throws(() => repository.readHookConfiguration(original), /regular hook configuration/);

    const duplicate = join(directory, 'duplicate.json');
    writeFileSync(duplicate, '{"hooks":{},"hooks":{}}');
    assert.throws(() => repository.readHookConfiguration(duplicate));
    const oversized = join(directory, 'oversized.json');
    writeFileSync(oversized, ' '.repeat(1_048_577));
    assert.throws(() => repository.readHookConfiguration(oversized), /regular hook configuration/);
});
