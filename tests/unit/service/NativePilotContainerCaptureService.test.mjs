import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { containerFixture } from '../../helpers/NativePilotContainerFixture.mjs';
import { containerPath } from '../../../src/validator/NativePilotContainerValidator.ts';

const recipe = (request) => {
    const args = request.args.slice(4);
    const offset = args.indexOf(containerPath.worker);
    return { phase: args[offset + 3], index: Number(args[offset + 4]) };
};

for (const host of ['codex', 'claude'])
    test(`${host} raw capture measures a fresh boundary, executes only initial recipes, retains and cleans without acceptance`, async (t) => {
        const f = containerFixture(t, { host });
        const before = f.inventory.tree(join(f.prepared.root, 'input'));
        const report = await f.controller.captureInitialInstallation();
        assert.equal(report.status, 'captured');
        assert.equal(report.native_acceptance, false);
        assert.equal(report.lifecycle_phase_approval, false);
        assert.deepEqual(
            report.phases.map((phase) => phase.phase),
            ['install-a', 'observe-a'],
        );
        assert.deepEqual(
            f.nativeCalls().map(recipe),
            [...Array(host === 'codex' ? 2 : 3)]
                .map((_, index) => ({ phase: 'install-a', index }))
                .concat({ phase: 'observe-a', index: 0 }),
        );
        assert.equal(report.observed_recipe_process_records, host === 'codex' ? 3 : 4);
        assert.deepEqual(report.skipped_native_calls, []);
        assert(report.unrun.includes('baseline'));
        assert(report.unrun.includes('preservation-acceptance'));
        assert(report.unrun.includes('host-semantic-acceptance'));
        assert(
            f.calls.findIndex((call) => call.args.includes('probe')) <
                f.calls.findIndex((call) => call.args.includes('execute')),
        );
        assert.equal(f.volumes.size, 0);
        assert.equal(report.cleanup.phase, 'capture-cleanup');
        assert(f.controller.files.verifyRetention().sha256);
        assert.deepEqual(f.inventory.tree(join(f.prepared.root, 'input')), before);
        await assert.rejects(f.controller.captureInitialInstallation(), /fresh unused/);
        await assert.rejects(f.controller.perform(f.controller.plan[0]), /Closed phase/);
        await assert.rejects(f.controller.closeBoundaryInspection(), /probe-only/);
    });

for (const phase of ['install-a', 'observe-a'])
    test(`completed nonzero ${phase} is retained and stops subsequent native calls, then permits measured retention and cleanup`, async (t) => {
        const f = containerFixture(t, {
            command: (value) => {
                if (value.phase === phase) {
                    value.process.exit_code = 7;
                    value.stdout = 'actual synthetic diagnostic bytes\n';
                    value.stderr = 'synthetic nonzero detail\n';
                }
                return value;
            },
        });
        const report = await f.controller.captureInitialInstallation();
        assert.equal(report.status, 'completed-nonzero');
        assert.deepEqual(report.failure, { phase, index: 0, reason: 'completed-nonzero' });
        assert.equal(report.native_acceptance, false);
        assert.equal(f.nativeCalls().length, phase === 'install-a' ? 1 : 3);
        assert.equal(report.skipped_native_calls.length, phase === 'install-a' ? 2 : 0);
        assert.equal(f.volumes.size, 0);
        const last = report.phases.at(-1).commands.at(-1);
        assert.equal(last.process.exit_code, 7);
        assert.equal(last.stdout, 'actual synthetic diagnostic bytes\n');
        const records = readdirSync(f.controller.files.root)
            .filter((name) => name.endsWith('-native-process.json'))
            .map((name) => readFileSync(join(f.controller.files.root, name), 'utf8'));
        assert(records.some((value) => value.includes('synthetic nonzero detail')));
        assert(report.cleanup.evidence.some((item) => item.kind === 'retention'));
    });

for (const status of ['timeout', 'interrupted', 'execution-error', 'output-limit', 'unavailable'])
    test(`raw ${status} never permits another native call or volume deletion`, async (t) => {
        const f = containerFixture(t, {
            command: (value) => {
                value.process.status = status;
                return value;
            },
        });
        const report = await f.controller.captureInitialInstallation();
        assert.equal(report.status, 'blocked');
        assert.equal(report.failure.reason, 'control-or-process-state-unverified');
        assert.equal(report.native_acceptance, false);
        assert.equal(report.observed_recipe_process_records, 1);
        assert.equal(f.nativeCalls().length, 1);
        assert.equal(f.volumes.size, 4);
        assert.equal(report.cleanup, null);
        assert(!f.calls.some((call) => call.args.slice(4, 6).join('/') === 'volume/rm'));
        assert(
            f.calls.some(
                (call) =>
                    call.args.slice(4, 6).join('/') === 'container/stop' &&
                    call.args.at(-1) === f.id,
            ),
        );
    });

test('failed measured boundary prevents initial native capture and keeps owned resources', async (t) => {
    const f = containerFixture(t, {
        probe: (value) => {
            value.uid = 0;
            return value;
        },
    });
    const report = await f.controller.captureInitialInstallation();
    assert.equal(report.status, 'blocked');
    assert.equal(report.failure.phase, 'boundary');
    assert.equal(report.observed_recipe_process_records, 0);
    assert.equal(f.nativeCalls().length, 0);
    assert.equal(f.volumes.size, 4);
});

test('retention failure after raw capture preserves all volumes and does not claim cleanup', async (t) => {
    const f = containerFixture(t, {
        bundle: (value) => {
            value.roots[0].entries[0].sha256 = '0'.repeat(64);
            return value;
        },
    });
    const report = await f.controller.captureInitialInstallation();
    assert.equal(report.status, 'blocked');
    assert.equal(report.failure.phase, 'capture-cleanup');
    assert.equal(report.cleanup, null);
    assert.equal(f.volumes.size, 4);
});

test('an already probed lane cannot be relabelled as a fresh initial capture', async (t) => {
    const f = containerFixture(t);
    await f.controller.inspectBoundary();
    await assert.rejects(f.controller.captureInitialInstallation(), /fresh unused/);
    assert.equal(f.nativeCalls().length, 0);
    await f.controller.closeBoundaryInspection();
});
