import assert from 'node:assert/strict';
import {
    existsSync,
    linkSync,
    mkdirSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { NativePilotPreparationService } from '../../../src/service/NativePilotPreparationService.ts';
import { fixture } from '../../helpers/NativePilotFixture.mjs';

test('preparation copies complete inert inputs, aliases and resources with a verified independent restore copy', (t) => {
    const fx = fixture(t);
    const before = fx.inventory.tree(fx.inputs.source_a);
    const result = fx.prepare();
    assert.equal(fx.inventory.tree(fx.inputs.source_a).tree_sha256, before.tree_sha256);
    assert.equal(
        fx.inventory.tree(join(result.root, 'input/source_a')).tree_sha256,
        before.tree_sha256,
    );
    assert.equal(
        fx.inventory.tree(join(result.root, 'restore-drill-a-copy')).tree_sha256,
        before.tree_sha256,
    );
    assert.deepEqual(result.package_names, { a: ['example'], b: ['example'] });
    assert.equal(
        readFileSync(join(result.root, 'runtime-bin/codex'), 'utf8'),
        'not an executable program: synthetic codex\n',
    );
    for (const path of [
        '.codex/skills/example/SKILL.md',
        '.agents/skills/example/LICENSE',
        '.agents/skills/example/assets/icon.png',
        '.agents/skills/example/references/guide.md',
    ]) {
        assert.ok(existsSync(join(result.root, 'input/source_a', path)), path);
    }
    assert.equal(
        JSON.parse(readFileSync(join(result.root, 'preparation.json'))).native_observations,
        0,
    );
});

test('all pin checks precede output creation and an existing output is preserved', (t) => {
    const fx = fixture(t);
    const output = join(fx.root, 'prepared');
    fx.contract.binaries.codex.sha256 = 'e'.repeat(64);
    assert.throws(() => fx.prepare(), /executable pin mismatch/);
    assert.equal(existsSync(output), false);
    fx.contract.binaries.codex.sha256 = fx.inventory.file(fx.inputs.codex).sha256;
    mkdirSync(output);
    writeFileSync(join(output, 'sentinel'), 'preserve');
    assert.throws(() => fx.prepare());
    assert.equal(readFileSync(join(output, 'sentinel'), 'utf8'), 'preserve');
});

test('unsupported architecture is refused before materializing a preparation', (t) => {
    const fx = fixture(t);
    fx.contract.authority.platform = 'linux/amd64';
    for (const binary of Object.values(fx.contract.binaries)) {
        binary.platform = 'linux/amd64';
    }

    assert.throws(() => fx.prepare(), /authority\.platform: invalid resolved value/);
    assert.equal(existsSync(join(fx.root, 'prepared')), false);
});

test('inventory refuses escaping aliases, hardlinks, Git metadata and linked input roots', (t) => {
    const fx = fixture(t);
    const source = fx.inputs.source_a;
    symlinkSync('../../source_b', join(source, '.codex/escape'));
    assert.throws(() => fx.inventory.tree(source), /relative internal/);
    rmSync(join(source, '.codex/escape'));
    linkSync(join(source, 'LICENSE'), join(source, 'hardlink'));
    assert.throws(() => fx.inventory.tree(source), /hardlinks/);
    rmSync(join(source, 'hardlink'));
    mkdirSync(join(source, '.git'));
    assert.throws(() => fx.inventory.tree(source), /clean exports/);
    rmSync(join(source, '.git'), { recursive: true });
    symlinkSync(source, join(fx.root, 'linked-input'));
    assert.throws(
        () =>
            new NativePilotPreparationService().prepare(
                fx.contract,
                { ...fx.inputs, source_a: join(fx.root, 'linked-input') },
                join(fx.root, 'output'),
            ),
        /canonical/,
    );
});

test('matching a tree hash cannot hide missing notices or an incorrect witness', (t) => {
    const fx = fixture(t);
    rmSync(join(fx.inputs.source_b, 'NOTICE'));
    fx.contract.source_b.tree_sha256 = fx.inventory.tree(fx.inputs.source_b).tree_sha256;
    assert.throws(() => fx.prepare(), /incomplete source/);
    writeFileSync(join(fx.inputs.source_b, 'NOTICE'), 'synthetic NOTICE\n');
    fx.contract.source_b.tree_sha256 = fx.inventory.tree(fx.inputs.source_b).tree_sha256;
    fx.contract.witnesses[0].b_sha256 = 'e'.repeat(64);
    assert.throws(() => fx.prepare(), /witness/);
});

test('preparation verifies selected MCP identity and the observer entrypoint before writing', (t) => {
    const fx = fixture(t);
    fx.contract.mcp.claude.b = 'plugin:i9-skills:wrong-server';
    assert.throws(() => fx.prepare(), /MCP identity/);
    assert.equal(existsSync(join(fx.root, 'prepared')), false);
    fx.contract.mcp.claude.b = 'plugin:i9-skills:i9-skills';
    fx.contract.observer.entrypoint = 'src/transport/MissingRunner.ts';
    assert.throws(() => fx.prepare(), /entrypoint is absent/);
});
