// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SkillEvidenceService } from '../../../src/service/SkillEvidenceService.ts';
import { SkillMemoryService } from '../../../src/service/SkillMemoryService.ts';
import {
    catalog,
    fixture,
    follow,
    lifecycle,
    member,
    period,
    source,
} from '../../unit/fixture/SkillEvidenceFixture.mjs';
import { snapshot } from '../../unit/fixture/InstalledCatalogFixture.mjs';

const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));
const evidence = new SkillEvidenceService();
const memory = new SkillMemoryService();
const query = { ...period, collection: 'demo' };
const cutoff = '2026-09-15T00:00:00.000Z';
const periodFlags = ['--collection', 'demo', '--from', period.from, '--until', period.until];
const commands = [
    {
        args: ['telemetry', 'lifecycle'],
        expected: (database) => evidence.query(database, 'lifecycle', query),
    },
    {
        args: ['telemetry', 'overlap'],
        expected: (database) => evidence.query(database, 'overlap', query),
    },
    {
        args: ['telemetry', 'inactivity'],
        expected: (database) => evidence.query(database, 'inactivity', query),
    },
    {
        args: ['telemetry', 'catalog-history'],
        expected: (database) => evidence.query(database, 'history', query),
    },
    {
        args: ['skills', 'memory', 'summarize'],
        expected: (database) => memory.summarize(database, query),
    },
    {
        args: ['skills', 'memory', 'retention', '--cutoff', cutoff],
        expected: (database) => memory.retention(database, { ...query, cutoff }),
    },
];

function seed(database, label, observationCount) {
    mkdirSync(dirname(database), { recursive: true });
    const active = `${label}-active`;
    const dormant = `${label}-dormant`;
    for (let index = 0; index < observationCount; index++)
        evidence.recordCatalog(
            database,
            catalog([member(active), member(dormant)], {
                occurred_at: `2026-09-0${index + 1}T00:00:00.000Z`,
            }),
        );
    const session = randomUUID();
    const route = lifecycle('skill.routed', {
        occurred_at: '2026-09-12T00:00:00.000Z',
        session,
        payload: {
            collection: 'demo',
            skill: active,
            reason: null,
            source: { ...source, package_path: `skills/${active}` },
        },
    });
    evidence.recordLifecycle(database, route);
    const activated = follow(route, 'skill.activated', '2026-09-13T00:00:00.000Z');
    evidence.recordLifecycle(database, activated);
    evidence.recordLifecycle(
        database,
        follow(activated, 'skill.completed', '2026-09-14T00:00:00.000Z'),
    );
    evidence.recordLifecycle(database, {
        ...route,
        event_id: randomUUID(),
        payload: {
            collection: 'demo',
            skill: dormant,
            reason: null,
            source: { ...source, package_path: `skills/${dormant}` },
        },
    });
}

function run(target, command, extra = [], environment = {}) {
    return spawnSync(process.execPath, [launcher, ...command.args, ...periodFlags, ...extra], {
        cwd: target.root,
        env: { ...target.environment, ...environment },
        encoding: 'utf8',
        timeout: 15_000,
        maxBuffer: 128 * 1024,
    });
}

for (const scenario of [
    {
        name: 'default queries use disposable HOME/.agents/skills-usage.db',
        selected: 'shared',
        environment: () => ({}),
    },
    {
        name: 'I9_SKILLS_USAGE_DB overrides the shared HOME database',
        selected: 'environment',
        environment: (paths) => ({ I9_SKILLS_USAGE_DB: paths.environment }),
    },
    {
        name: 'explicit --db overrides I9_SKILLS_USAGE_DB',
        selected: 'explicit',
        environment: (paths) => ({ I9_SKILLS_USAGE_DB: paths.environment }),
        explicit: true,
    },
    {
        name: 'explicit --db bypasses invalid environment defaults',
        selected: 'explicit',
        environment: () => ({
            I9_SKILLS_USAGE_DB: 'invalid-relative-database',
            I9_AGENT_STATE_ROOT: 'invalid-relative-root',
        }),
        explicit: true,
    },
]) {
    test(scenario.name, (t) => {
        const target = fixture(t);
        const paths = {
            shared: join(target.environment.HOME, '.agents', 'skills-usage.db'),
            environment: join(target.root, 'environment-state', 'usage.db'),
            explicit: join(target.root, 'explicit-state', 'usage.db'),
        };
        seed(paths.shared, 'shared', 1);
        seed(paths.environment, 'environment', 2);
        seed(paths.explicit, 'explicit', 3);
        const before = snapshot(target.root);
        for (const command of commands) {
            const selected = command.expected(paths[scenario.selected]);
            for (const alternative of Object.keys(paths).filter((key) => key !== scenario.selected))
                assert.notDeepEqual(
                    selected,
                    command.expected(paths[alternative]),
                    'each fixture must distinguish database selection',
                );
            const result = run(
                target,
                command,
                scenario.explicit ? ['--db', paths.explicit] : [],
                scenario.environment(paths),
            );
            assert.equal(result.status, 0, `${command.args.join(' ')}: ${result.stderr}`);
            assert.deepEqual(JSON.parse(result.stdout), selected);
            assert.equal(
                result.stdout.includes(target.root),
                false,
                'reports contain no local database path',
            );
        }
        assert.deepEqual(
            snapshot(target.root),
            before,
            'all queries retain database and directory bytes',
        );
        assert.equal(
            existsSync(target.database),
            false,
            'the former caller-local fixture database is not created',
        );
    });
}

for (const selection of ['shared', 'environment', 'explicit']) {
    test(`read-only ${selection} selection never creates a missing database or parent`, (t) => {
        const target = fixture(t);
        const missing = join(target.root, 'uncreated', 'usage.db');
        const sharedParent = join(target.environment.HOME, '.agents');
        const before = snapshot(target.root);
        for (const command of commands) {
            const result = run(
                target,
                command,
                selection === 'explicit' ? ['--db', missing] : [],
                selection === 'environment' ? { I9_SKILLS_USAGE_DB: missing } : {},
            );
            assert.notEqual(result.status, 0, command.args.join(' '));
            assert.equal(result.stdout, '');
            assert.match(result.stderr, /Usage operation unavailable/u);
            assert.equal(
                result.stderr.includes(target.root),
                false,
                'errors contain no local database path',
            );
        }
        assert.equal(existsSync(sharedParent), false);
        assert.equal(existsSync(dirname(missing)), false);
        assert.deepEqual(snapshot(target.root), before);
    });
}
