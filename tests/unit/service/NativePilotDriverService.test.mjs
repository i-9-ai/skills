import assert from 'node:assert/strict';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { NativePilotDriverService } from '../../../src/service/NativePilotDriverService.ts';
import { NativePilotPlanService } from '../../../src/service/NativePilotPlanService.ts';
import { NativePilotReportService } from '../../../src/service/NativePilotReportService.ts';
import { pilotDigest } from '../../../src/repository/NativePilotInventoryRepository.ts';
import { fakeAdapter, fixture, selection } from '../../helpers/NativePilotFixture.mjs';

async function exercise(t, host = 'codex', mutate = () => {}, clock) {
    const fx = fixture(t);
    const prepared = fx.prepare();
    const selected = selection(host);
    const fake = fakeAdapter(prepared, fx.root, selected, mutate);
    const result = await new NativePilotDriverService().run(
        prepared,
        selected,
        fake.adapter,
        fake.journalParent,
        fake.evidenceRoot,
        clock,
    );
    return { ...fx, prepared, selected, fake, result };
}

async function transformedExercise(t, host, change) {
    const fx = fixture(t);
    const aliases = [
        { kind: 'omitted-repository-alias', path: '.claude/skills', target: '../.agents/skills' },
        { kind: 'omitted-repository-alias', path: '.github/skills', target: '../.agents/skills' },
        { kind: 'omitted-repository-alias', path: 'CLAUDE.md', target: 'AGENTS.md' },
        { kind: 'omitted-repository-alias', path: 'GEMINI.md', target: 'AGENTS.md' },
    ];
    for (const pin of ['a', 'b']) {
        const source = fx.inputs[`source_${pin}`];
        fx.put(join(source, 'AGENTS.md'), 'synthetic repository instructions\n');
        for (const dir of ['.claude', '.github']) mkdirSync(join(source, dir));
        for (const alias of aliases) symlinkSync(alias.target, join(source, alias.path));
        fx.contract[`source_${pin}`].tree_sha256 = fx.inventory.tree(source).tree_sha256;
    }
    const prepared = fx.prepare();
    const selected = selection(host);
    const fake = fakeAdapter(
        prepared,
        fx.root,
        selected,
        async (value, step, { evidenceRoot, inventory }) => {
            if (!value.loaded) return;
            const expected = step.pin === 'b' ? prepared.trees.source_b : prepared.trees.source_a;
            const entries = expected.entries.filter(
                (entry) => !aliases.some((alias) => alias.path === entry.path),
            );
            const installed = {
                ...expected,
                entries,
                tree_sha256: pilotDigest(JSON.stringify(entries)),
            };
            value.loaded.installed_tree_sha256 = installed.tree_sha256;
            value.loaded.transformations = structuredClone(aliases);
            change?.(value, installed, step);
            const file = join(evidenceRoot, value.loaded.inventory_evidence);
            writeFileSync(file, JSON.stringify(installed));
            const actual = inventory.file(file);
            Object.assign(
                value.evidence.find((item) => item.path === value.loaded.inventory_evidence),
                { bytes: actual.bytes, sha256: actual.sha256 },
            );
        },
    );
    const result = await new NativePilotDriverService().run(
        prepared,
        selected,
        fake.adapter,
        fake.journalParent,
        fake.evidenceRoot,
    );
    return { result, fake };
}

test('an explicitly measured Codex cache may omit only the four selected repository aliases', async (t) => {
    const { result } = await transformedExercise(t, 'codex');
    assert.equal(result.status, 'synthetic-only');
    assert.equal(result.steps.length, 20);
    assert.equal(result.native_acceptance, false);
});

test('the same repository-alias omission is unsupported on Claude', async (t) => {
    const { result, fake } = await transformedExercise(t, 'claude');
    assert.equal(result.status, 'blocked');
    assert.equal(
        result.steps.find((step) => step.id === 'observe-a').reason,
        'invalid-observation',
    );
    assert.equal(fake.calls.includes('update-b'), false);
});

test('a rehashed loaded inventory cannot conceal omitted package resources', async (t) => {
    const { result } = await transformedExercise(t, 'codex', (_value, installed) => {
        const omitted = installed.entries.find(
            (entry) => entry.path === '.agents/skills/example/references/guide.md',
        );
        installed.entries = installed.entries.filter((entry) => entry !== omitted);
        installed.bytes -= omitted.bytes;
        installed.tree_sha256 = pilotDigest(JSON.stringify(installed.entries));
        _value.loaded.installed_tree_sha256 = installed.tree_sha256;
    });
    assert.equal(result.status, 'blocked');
    assert.equal(
        result.steps.find((step) => step.id === 'observe-a').reason,
        'evidence-integrity-mismatch',
    );
});

for (const [label, change] of [
    [
        'missing declaration',
        (value) => {
            value.loaded.transformations = [];
        },
    ],
    [
        'wrong alias target',
        (value) => {
            value.loaded.transformations[0].target = 'AGENTS.md';
        },
    ],
    [
        'duplicate alias',
        (value) => {
            value.loaded.transformations[1] = value.loaded.transformations[0];
        },
    ],
    [
        'package alias claim',
        (value) => {
            value.loaded.transformations[0].path = '.agents/skills/example/SKILL.md';
        },
    ],
])
    test(`native cache ${label} cannot become a loaded-byte pass`, async (t) => {
        const { result } = await transformedExercise(t, 'codex', change);
        assert.equal(result.status, 'blocked');
    });

for (const host of ['codex', 'claude'])
    test(`${host} command composition fixes stop/switch/restart and keep-data/retention order`, (t) => {
        const fx = fixture(t);
        const prepared = fx.prepare();
        const plan = new NativePilotPlanService().plan(prepared, selection(host));
        const phases = plan.map((step) => step.id);
        assert.ok(phases.indexOf('stop-a') < phases.indexOf('select-b'));
        assert.ok(phases.indexOf('select-b') < phases.indexOf('update-b'));
        assert.ok(phases.indexOf('update-b') < phases.indexOf('observe-b'));
        assert.ok(phases.indexOf('stop-b') < phases.indexOf('select-a'));
        assert.ok(phases.indexOf('rollback-a') < phases.indexOf('observe-restored-a'));
        assert.ok(phases.indexOf('uninstall') < phases.indexOf('verify-preserved'));
        assert.ok(phases.indexOf('verify-preserved') < phases.indexOf('remove-marketplace'));
        assert.ok(phases.indexOf('retain') < phases.indexOf('cleanup-owned'));
        const install = plan.find((step) => step.id === 'install-a');
        assert.ok(
            install.commands.some((command) =>
                command.args.includes(join(prepared.root, 'source')),
            ),
        );
        assert.ok(prepared.root.includes(' '));
        assert.ok(
            plan.every((step) =>
                step.commands.every(
                    (command) => Array.isArray(command.args) && command.timeout_ms <= 90_000,
                ),
            ),
        );
        const encoded = JSON.stringify(plan);
        assert.equal(encoded.includes('HOME='), false);
        assert.equal(encoded.includes('CODEX_HOME'), false);
        assert.equal(encoded.includes('sh -c'), false);
        if (host === 'claude')
            assert.ok(
                plan
                    .find((step) => step.id === 'uninstall')
                    .commands[0].args.includes('--keep-data'),
            );
    });

for (const host of ['codex', 'claude'])
    test(`a complete fake ${host} A/B/A sequence remains synthetic only`, async (t) => {
        const { result, fake, selected } = await exercise(t, host);
        assert.equal(result.status, 'synthetic-only');
        assert.equal(result.native_acceptance, false);
        assert.equal(result.data_compatibility, 'compatible');
        assert.equal(result.steps.length, 20);
        assert.equal(fake.aborts(), 0);
        assert.ok(existsSync(join(fake.journalParent, selected.run_id, 'result.json')));
        const report = new NativePilotReportService().summarize([result]);
        assert.equal(report.exercise_evidence_complete, false);
        assert.equal(report.native_acceptance, false);
        assert.equal(report.status, 'incomplete-native-evidence');
    });

for (const [phase, check, prohibited] of [
    ['preflight', 'measured-network-isolation', 'install-a'],
    ['stop-a', 'owned-native-live-processes-absent', 'select-b'],
    ['observe-b', 'native-session-hook-completed', 'rollback-a'],
    ['verify-preserved', 'prior-state-rows-preserved', 'remove-marketplace'],
    ['retain', 'private-evidence-and-state-retained', 'cleanup-owned'],
])
    test(`a failed ${check} retains the failure and prevents ${prohibited}`, async (t) => {
        const { result, fake, selected } = await exercise(t, 'codex', (value, step) => {
            if (step.id === phase) value.checks.find((item) => item.id === check).satisfied = false;
        });
        assert.equal(result.status, 'failed');
        assert.equal(result.steps.find((step) => step.id === phase).verdict, 'failed');
        assert.equal(fake.calls.includes(prohibited), false);
        assert.equal(fake.aborts(), 1);
        assert.equal(result.abort, 'requested-retention-unverified');
        const journal = readFileSync(
            join(
                fake.journalParent,
                selected.run_id,
                `${String(result.steps.findIndex((step) => step.id === phase)).padStart(2, '0')}.json`,
            ),
            'utf8',
        );
        assert.ok(journal.includes('"satisfied": false'));
    });

test('a zero exit accompanied by timeout is not a native update pass', async (t) => {
    const { result, fake } = await exercise(t, 'codex', (value, step) => {
        if (step.id === 'update-b')
            value.processes[0] = { status: 'timeout', exit_code: 0, signal: 'SIGKILL' };
    });
    assert.equal(result.status, 'failed');
    assert.equal(fake.calls.includes('observe-b'), false);
    assert.equal(result.steps.find((step) => step.id === 'update-b').verdict, 'failed');
});

test('stale B is blocked even if the update process said success', async (t) => {
    let aDigest;
    const { result, fake } = await exercise(t, 'codex', (value, step) => {
        if (step.id === 'observe-a') aDigest = value.loaded.source_tree_sha256;
        if (step.id === 'observe-b') value.loaded.source_tree_sha256 = aDigest;
    });
    assert.equal(result.status, 'blocked');
    assert.equal(
        result.steps.find((step) => step.id === 'observe-b').reason,
        'invalid-observation',
    );
    assert.equal(fake.calls.includes('stop-b'), false);
});

test('a claimed B digest with a retained A inventory still fails the full byte check', async (t) => {
    let aInventory;
    const { result } = await exercise(t, 'codex', (value, step, { evidenceRoot, inventory }) => {
        if (step.id === 'observe-a')
            aInventory = readFileSync(join(evidenceRoot, value.loaded.inventory_evidence));
        if (step.id === 'observe-b') {
            const path = value.loaded.inventory_evidence;
            writeFileSync(join(evidenceRoot, path), aInventory);
            const actual = inventory.file(join(evidenceRoot, path));
            Object.assign(
                value.evidence.find((item) => item.path === path),
                { sha256: actual.sha256, bytes: actual.bytes },
            );
        }
    });
    assert.equal(
        result.steps.find((step) => step.id === 'observe-b').reason,
        'evidence-integrity-mismatch',
    );
});

test('reusing the A process does not count as restarting B', async (t) => {
    let instance;
    const { result } = await exercise(t, 'codex', (value, step) => {
        if (step.id === 'observe-a') instance = value.loaded.process_instance;
        if (step.id === 'observe-b') value.loaded.process_instance = instance;
    });
    assert.equal(result.steps.find((step) => step.id === 'observe-b').verdict, 'blocked');
});

test('a receipt cannot switch run identity or promote the fake executor mode', async (t) => {
    const { result, fake } = await exercise(t, 'claude', (value, step) => {
        if (step.id === 'preflight') value.mode = 'native';
    });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(fake.calls, ['preflight']);
});

test('retained evidence cannot escape by symlink or be replaced without invalidating its hash', async (t) => {
    const { result } = await exercise(t, 'codex', (value, step, { evidenceRoot }) => {
        if (step.id === 'preflight') {
            const path = join(evidenceRoot, value.evidence[0].path);
            rmSync(path);
            symlinkSync(join(evidenceRoot, value.evidence[1].path), path);
        }
    });
    assert.equal(result.steps[0].reason, 'evidence-integrity-mismatch');
});

test('changed prepared executable blocks all adapter calls', async (t) => {
    const fx = fixture(t);
    const prepared = fx.prepare();
    const selected = selection();
    const fake = fakeAdapter(prepared, fx.root, selected);
    writeFileSync(join(prepared.root, 'runtime-bin/codex'), 'changed');
    await assert.rejects(
        new NativePilotDriverService().run(
            prepared,
            selected,
            fake.adapter,
            fake.journalParent,
            fake.evidenceRoot,
        ),
        /executable changed/,
    );
    assert.deepEqual(fake.calls, []);
});

test('forged source inventory or package metadata is rejected before creating a journal', async (t) => {
    const fx = fixture(t);
    const prepared = fx.prepare();
    const selected = selection();
    const fake = fakeAdapter(prepared, fx.root, selected);
    const sourceA = fx.inventory.tree(join(prepared.root, 'input/source_a')).tree_sha256;
    const sourceB = fx.inventory.tree(join(prepared.root, 'input/source_b')).tree_sha256;
    for (const mutate of [
        (value) => {
            value.trees.source_b = structuredClone(value.trees.source_a);
        },
        (value) => {
            value.trees.source_b.entries = structuredClone(value.trees.source_a.entries);
        },
        (value) => {
            value.package_names.b = ['fabricated-package'];
        },
    ]) {
        const supplied = structuredClone(prepared);
        mutate(supplied);
        await assert.rejects(
            new NativePilotDriverService().run(
                supplied,
                selected,
                fake.adapter,
                fake.journalParent,
                fake.evidenceRoot,
            ),
            /metadata differs/,
        );
    }
    assert.deepEqual(fake.calls, []);
    assert.deepEqual(readdirSync(fake.journalParent), []);
    assert.deepEqual(readdirSync(fake.evidenceRoot), []);
    assert.equal(fx.inventory.tree(join(prepared.root, 'input/source_a')).tree_sha256, sourceA);
    assert.equal(fx.inventory.tree(join(prepared.root, 'input/source_b')).tree_sha256, sourceB);
});

test('journal and evidence roots cannot mutate protected input, runtime or restore trees before preflight', async (t) => {
    const fx = fixture(t);
    const prepared = fx.prepare();
    const selected = selection();
    const fake = fakeAdapter(prepared, fx.root, selected);
    const before = fx.inventory.tree(prepared.root).tree_sha256;
    for (const relative of [
        'input/source_a',
        'input/source_b',
        'input/driver',
        'input/observer',
        'runtime-bin',
        'restore-drill-a',
        'restore-drill-a-copy',
        'source',
        'consumer',
    ]) {
        await assert.rejects(
            new NativePilotDriverService().run(
                prepared,
                selected,
                fake.adapter,
                join(prepared.root, relative),
                fake.evidenceRoot,
            ),
            /separate owned output roots/,
        );
    }
    await assert.rejects(
        new NativePilotDriverService().run(
            prepared,
            selected,
            fake.adapter,
            fake.journalParent,
            join(prepared.root, 'input/source_a'),
        ),
        /separate owned output roots/,
    );
    assert.deepEqual(fake.calls, []);
    assert.equal(fx.inventory.tree(prepared.root).tree_sha256, before);
    assert.deepEqual(readdirSync(fake.journalParent), []);
});

test('a linked output root cannot redirect journal creation into an immutable input', async (t) => {
    const fx = fixture(t);
    const prepared = fx.prepare();
    const selected = selection();
    const fake = fakeAdapter(prepared, fx.root, selected);
    const source = join(prepared.root, 'input/source_a');
    const before = fx.inventory.tree(source).tree_sha256;
    rmSync(fake.journalParent, { recursive: true });
    symlinkSync(source, fake.journalParent);
    await assert.rejects(
        new NativePilotDriverService().run(
            prepared,
            selected,
            fake.adapter,
            fake.journalParent,
            fake.evidenceRoot,
        ),
        /canonical existing directory/,
    );
    assert.deepEqual(fake.calls, []);
    assert.equal(fx.inventory.tree(source).tree_sha256, before);
    assert.equal(existsSync(join(source, selected.run_id)), false);
});

test('an output ownership marker for another contract is rejected without journal effects', async (t) => {
    const fx = fixture(t);
    const prepared = fx.prepare();
    const selected = selection();
    const fake = fakeAdapter(prepared, fx.root, selected);
    writeFileSync(
        join(prepared.root, 'output/.i9-native-pilot-output-owned'),
        JSON.stringify({
            schema_version: 1,
            contract_sha256: 'f'.repeat(64),
            journal: 'journal',
            evidence: 'evidence',
        }),
    );
    await assert.rejects(
        new NativePilotDriverService().run(
            prepared,
            selected,
            fake.adapter,
            fake.journalParent,
            fake.evidenceRoot,
        ),
        /ownership or preparation contract changed/,
    );
    assert.deepEqual(fake.calls, []);
    assert.deepEqual(readdirSync(fake.journalParent), []);
});

test('an exhausted job budget stops before a new native phase', async (t) => {
    let tick = 0;
    const { result, fake } = await exercise(
        t,
        'codex',
        () => {},
        () => (tick++ === 0 ? 0 : 1_800_001),
    );
    assert.equal(result.steps[0].reason, 'job-bound-exceeded');
    assert.deepEqual(fake.calls, []);
    assert.equal(fake.aborts(), 1);
});

test('newer-schema refusal with unchanged bytes is observed separately and safe unregister still runs', async (t) => {
    const { result, fake } = await exercise(
        t,
        'claude',
        (value, step, { evidenceRoot, inventory }) => {
            if (step.id === 'observe-restored-a') {
                const [before, after] = value.rollback_state.evidence;
                writeFileSync(join(evidenceRoot, after), readFileSync(join(evidenceRoot, before)));
                const retained = inventory.file(join(evidenceRoot, after));
                Object.assign(
                    value.evidence.find((item) => item.path === after),
                    { sha256: retained.sha256, bytes: retained.bytes },
                );
                value.rollback_state.result = 'newer-schema-rejected-unchanged';
                value.rollback_state.after_sha256 = retained.sha256;
            }
        },
    );
    assert.equal(result.status, 'data-compatibility-blocked');
    assert.equal(result.data_compatibility, 'blocked-newer-schema');
    assert.ok(fake.calls.includes('uninstall'));
    assert.ok(fake.calls.includes('retain'));
    assert.ok(fake.calls.includes('cleanup-owned'));
    assert.equal(result.native_acceptance, false);
});

test('newer-schema refusal cannot conceal changed database bytes', async (t) => {
    const { result, fake } = await exercise(t, 'claude', (value, step) => {
        if (step.id === 'observe-restored-a')
            value.rollback_state.result = 'newer-schema-rejected-unchanged';
    });
    assert.equal(result.steps.find((step) => step.id === 'observe-restored-a').verdict, 'blocked');
    assert.equal(fake.calls.includes('uninstall'), false);
});

test('matrix projection refuses duplicate profiles and arbitrary diagnostic leakage', async (t) => {
    const { result } = await exercise(t);
    const report = new NativePilotReportService();
    const copied = structuredClone(result);
    copied.selection = selection('claude', 2);
    assert.throws(() => report.summarize([result, copied]), /distinct/);
    copied.environment.profile_sha256 = pilotDigest('different profile');
    copied.environment.instance_sha256 = pilotDigest('different instance');
    copied.steps[0].reason = '/private/raw-path';
    assert.throws(() => report.summarize([copied]), /unsafe projection reason/);
});

test('four native-assertion lanes can be complete with an explicitly blocked compatibility outcome', async (t) => {
    const { result } = await exercise(t);
    // Pure projection fixtures, never actual native execution or upgraded assurance.
    const lanes = ['codex', 'claude'].flatMap((host) =>
        [1, 2].map((repetition) => {
            const lane = structuredClone(result);
            lane.selection = selection(host, repetition);
            lane.mode = 'native';
            lane.status = 'data-compatibility-blocked';
            lane.data_compatibility = 'blocked-newer-schema';
            lane.environment = {
                instance_sha256: pilotDigest(`instance ${lane.selection.run_id}`),
                profile_sha256: pilotDigest(`profile ${lane.selection.run_id}`),
            };
            for (const step of lane.steps)
                step.reason = 'retained-adapter-assertions-require-independent-review';
            return lane;
        }),
    );
    const report = new NativePilotReportService().summarize(lanes);
    assert.equal(report.exercise_evidence_complete, true);
    assert.equal(report.full_data_compatibility, false);
    assert.equal(report.status, 'evidence-ready-with-observed-compatibility-limit');
    assert.equal(report.assurance, 'local-evidence-integrity-and-adapter-assertions-only');
    assert.equal(report.native_acceptance, false);
    assert.equal(JSON.stringify(report).includes('profile_sha256'), false);
});
