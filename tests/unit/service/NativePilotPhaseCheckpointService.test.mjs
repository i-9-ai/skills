import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { containerFixture } from '../../helpers/NativePilotContainerFixture.mjs';

test('phase checkpoint retains actual inert export but cannot authorize final deletion', async (t) => {
    const f = containerFixture(t);
    const facts = await f.controller.perform(f.controller.plan[0]);
    const checkpoint = facts.evidence.find((entry) =>
        entry.path.endsWith('phase-preflight-export.json'),
    );
    assert(checkpoint);
    const path = join(f.prepared.root, 'output', 'evidence', checkpoint.path);
    assert.equal(f.inventory.file(path).sha256, checkpoint.sha256);
    const bundle = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(bundle.operation, 'export');
    assert.equal(bundle.roots.length, 4);
    assert.throws(() => f.controller.files.verifyRetention(), /No verified private retention/);
    assert.throws(
        () => f.controller.files.retain(JSON.stringify(f.bundle()), 'unknown-phase'),
        /Unknown phase/,
    );
    assert.equal(f.volumes.size, 4);
});

test('completed nonzero direct native call still exports state and skips later calls in its phase', async (t) => {
    let fail = false;
    const f = containerFixture(t, {
        host: 'claude',
        command: (value) => {
            if (fail && value.phase === 'install-a' && value.index === 0)
                value.process.exit_code = 2;
            return value;
        },
    });
    await f.through('baseline');
    fail = true;
    const facts = await f.controller.perform(
        f.controller.plan.find((step) => step.id === 'install-a'),
    );
    assert.equal(facts.commands.length, 1);
    assert.equal(facts.commands[0].process.exit_code, 2);
    assert(facts.evidence.some((entry) => entry.path.endsWith('phase-install-a-export.json')));
    assert.equal(f.volumes.size, 4);
    assert.equal(facts.native_acceptance, false);
});
