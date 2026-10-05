import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, renameSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { NativePilotLifecycleService } from '../../../src/service/NativePilotLifecycleService.ts';
import { NativePilotConfiguration } from '../../../src/config/NativePilotConfiguration.ts';
import { fixture, fakeAdapter, selection } from '../../helpers/NativePilotFixture.mjs';

function laneAdapter(f, prepared, selected, mutate = () => {}) {
    const fake = fakeAdapter(prepared, f.root, selected, mutate);
    const original = fake.adapter.perform;
    const prefix = selected.run_id;
    mkdirSync(join(fake.evidenceRoot, prefix));
    fake.adapter.perform = async (step) => {
        const observation = await original(step);
        const mappings = new Map(
            observation.evidence.map((item) => [item.path, `${prefix}/${item.path}`]),
        );
        for (const item of observation.evidence) {
            renameSync(
                join(fake.evidenceRoot, item.path),
                join(fake.evidenceRoot, mappings.get(item.path)),
            );
            item.path = mappings.get(item.path);
        }
        for (const check of observation.checks)
            check.evidence = check.evidence.map((path) => mappings.get(path));
        if (observation.loaded)
            observation.loaded.inventory_evidence = mappings.get(
                observation.loaded.inventory_evidence,
            );
        if (observation.rollback_state)
            observation.rollback_state.evidence = observation.rollback_state.evidence.map((path) =>
                mappings.get(path),
            );
        return observation;
    };
    return fake;
}

test('one operator call records all four synthetic lanes sequentially without granting native acceptance', async (t) => {
    const f = fixture(t);
    const prepared = f.prepare();
    const lanes = [
        selection('codex', 1),
        selection('codex', 2),
        selection('claude', 1),
        selection('claude', 2),
    ];
    const calls = [];
    let active = 0;
    const result = await new NativePilotLifecycleService().run(
        prepared,
        lanes,
        async (selected) => {
            assert.equal(active, 0);
            active++;
            const fake = laneAdapter(f, prepared, selected);
            const perform = fake.adapter.perform;
            fake.adapter.perform = async (step) => {
                calls.push(`${selected.host}/${selected.repetition}/${step.id}`);
                const value = await perform(step);
                if (step.id === 'cleanup-owned') active--;
                return value;
            };
            return fake.adapter;
        },
    );
    assert.equal(active, 0);
    assert.equal(calls.length, 80);
    assert.deepEqual(
        calls.slice(0, 20).map((value) => value.split('/')[2]),
        NativePilotConfiguration.phases,
    );
    assert.equal(result.report.all_declared_lanes_attempted, true);
    assert.equal(result.report.declared_lanes_attempted, 4);
    assert.equal(result.report.native_acceptance, false);
    assert.equal(result.report.summary.exercise_evidence_complete, false);
    assert(
        result.report.summary.lanes.every(
            (lane) => lane.mode === 'synthetic' && lane.status === 'synthetic-only',
        ),
    );
    assert.equal(result.report.lane_results.length, 4);
    for (const receipt of result.report.lane_results)
        assert.equal(
            f.inventory.file(join(prepared.root, 'output', receipt.path)).sha256,
            receipt.sha256,
        );
    assert.deepEqual(JSON.parse(readFileSync(result.receipt.path, 'utf8')), result.report);
});

test('a rejected actual-shaped phase remains failed, dependent work remains not-run and a distinct next lane is still attempted', async (t) => {
    const f = fixture(t);
    const prepared = f.prepare();
    const lanes = [selection('codex', 1), selection('claude', 1)];
    const result = await new NativePilotLifecycleService().run(
        prepared,
        lanes,
        async (selected) =>
            laneAdapter(f, prepared, selected, (value, step) => {
                if (selected.host === 'codex' && step.id === 'observe-a')
                    value.checks[0].satisfied = false;
            }).adapter,
    );
    assert.equal(result.report.summary.lanes[0].status, 'failed');
    assert.deepEqual(result.report.summary.lanes[0].failed, [
        { phase: 'observe-a', reason: 'process-or-observed-gate-failed' },
    ]);
    assert(result.report.summary.lanes[0].not_run.includes('update-b'));
    assert.equal(result.report.summary.lanes[1].status, 'synthetic-only');
    assert.equal(result.report.all_declared_lanes_attempted, true);
    assert.equal(result.report.native_acceptance, false);
    const phase = JSON.parse(
        readFileSync(join(prepared.root, 'output/journal', lanes[0].run_id, '03.json'), 'utf8'),
    );
    assert.equal(phase.observation.checks[0].satisfied, false);
});

test('invalid projection stays blocked and preserves its original phase journal classification', async (t) => {
    const f = fixture(t);
    const prepared = f.prepare();
    const lane = selection();
    const result = await new NativePilotLifecycleService().run(
        prepared,
        [lane],
        async () =>
            laneAdapter(f, prepared, lane, (value, step) => {
                if (step.id === 'observe-a') value.loaded.source_tree_sha256 = '0'.repeat(64);
            }).adapter,
    );
    assert.equal(result.report.summary.lanes[0].status, 'blocked');
    assert.deepEqual(result.report.summary.lanes[0].failed, [
        { phase: 'observe-a', reason: 'invalid-observation' },
    ]);
    assert.equal(
        JSON.parse(
            readFileSync(join(prepared.root, 'output/journal', lane.run_id, '03.json'), 'utf8'),
        ).reason,
        'invalid-observation',
    );
});

test('adapter construction failure retains a bounded operator failure without inventing a lane result', async (t) => {
    const f = fixture(t);
    const prepared = f.prepare();
    const lanes = [selection('codex', 1), selection('claude', 1)];
    const result = await new NativePilotLifecycleService().run(prepared, lanes, async () => {
        throw new Error('private exception text must not be copied');
    });
    assert.deepEqual(result.report.lane_results, []);
    assert.equal(result.report.operator_failure.reason, 'operator-or-adapter-blocked');
    assert.deepEqual(result.report.unattempted_lanes, [lanes[1]]);
    assert.equal(result.report.all_declared_lanes_attempted, false);
    assert(!JSON.stringify(result).includes('private exception text'));
    assert(!existsSync(join(prepared.root, 'output/journal', lanes[0].run_id)));
});

test('duplicate lanes are rejected without effects and a completed operator request cannot overwrite its prior report', async (t) => {
    const f = fixture(t);
    const prepared = f.prepare();
    const lane = selection();
    const service = new NativePilotLifecycleService();
    const before = readdirSync(join(prepared.root, 'output/evidence'));
    await assert.rejects(
        service.run(prepared, [lane, lane], async () => {
            throw new Error('must not reach');
        }),
        /distinct/,
    );
    assert.deepEqual(readdirSync(join(prepared.root, 'output/evidence')), before);
    const result = await service.run(
        prepared,
        [lane],
        async () => laneAdapter(f, prepared, lane).adapter,
    );
    const bytes = readFileSync(result.receipt.path);
    await assert.rejects(
        service.run(prepared, [lane], async () => {
            throw new Error('must not reach');
        }),
        /EEXIST/,
    );
    assert.deepEqual(readFileSync(result.receipt.path), bytes);
});
