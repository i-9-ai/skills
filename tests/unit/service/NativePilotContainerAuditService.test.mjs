import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { containerFixture } from '../../helpers/NativePilotContainerFixture.mjs';
import { NativePilotProcessAuditRepository } from '../../../src/repository/NativePilotProcessAuditRepository.ts';

const zombieAudit = (value) => {
    for (const sample of value.samples)
        sample.processes.push({
            pid: 90,
            ppid: 1,
            start_ticks: '3652952',
            state: 'Z',
            comm: 'synthetic-native',
            argv: [],
            role: 'unexpected',
            observation: 'observed',
        });
    value.processes = structuredClone(value.samples.at(-1).processes);
    value.status = 'quiescent-with-observed-zombies';
    value.residual_zombies = NativePilotProcessAuditRepository.zombies(value.samples.at(-1));
    return value;
};

test('controller retains explicit measured non-live residuals and exports before owned cleanup', async (t) => {
    const f = containerFixture(t, {
        audit: zombieAudit,
        bundle: (bundle) => {
            bundle.audit = zombieAudit(bundle.audit);
            return bundle;
        },
    });
    await f.controller.inspectBoundary();
    await f.controller.closeBoundaryInspection();
    const retained = JSON.parse(readFileSync(f.controller.files.verifyRetention().path, 'utf8'));
    assert.equal(retained.audit.status, 'quiescent-with-observed-zombies');
    assert.equal(retained.audit.residual_zombies[0].pid, 90);
    assert.equal(f.volumes.size, 0);
    assert.equal(f.nativeCalls().length, 0);
});

for (const mode of ['live', 'unreadable', 'hidden-zombie-summary'])
    test(`controller preserves rejected ${mode} audit raw bytes and retains stopped volumes`, async (t) => {
        const f = containerFixture(t, {
            audit: (value) => {
                zombieAudit(value);
                if (mode === 'hidden-zombie-summary') value.residual_zombies = [];
                else {
                    for (const sample of value.samples) {
                        const process = sample.processes.at(-1);
                        if (mode === 'live') process.state = 'S';
                        else process.observation = 'unreadable';
                    }
                    value.processes = structuredClone(value.samples.at(-1).processes);
                }
                return value;
            },
        });
        await assert.rejects(f.controller.inspectBoundary(), /absence/);
        assert.equal(f.nativeCalls().length, 0);
        assert.equal(f.volumes.size, 4);
        const traces = readdirSync(f.controller.files.root).filter((name) =>
            /^docker-\d+\.stdout$/.test(name),
        );
        assert(
            traces.some((name) =>
                readFileSync(join(f.controller.files.root, name), 'utf8').includes('3652952'),
            ),
        );
        assert(f.calls.some((call) => call.args.slice(4, 6).join('/') === 'container/stop'));
        assert(!f.calls.some((call) => call.args.slice(4, 6).join('/') === 'volume/rm'));
    });

test('export without its actual quiescent audit cannot authorize retained-state deletion', async (t) => {
    const f = containerFixture(t, {
        bundle: (bundle) => {
            delete bundle.audit;
            return bundle;
        },
    });
    await f.controller.inspectBoundary();
    await assert.rejects(f.controller.closeBoundaryInspection(), /Retention identity/);
    assert.equal(f.volumes.size, 4);
    assert(!f.calls.some((call) => call.args.slice(4, 6).join('/') === 'volume/rm'));
});
