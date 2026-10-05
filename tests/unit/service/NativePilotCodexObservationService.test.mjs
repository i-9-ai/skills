import { posix as syntheticPath } from 'node:path';
const syntheticContainerHome = syntheticPath.join('/', 'home', 'node');
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
    input,
    fakeRun,
    fixtureRequest,
    validator,
} from '../../helpers/NativeCodexTranscriptFixture.mjs';
import { NativeCodexObservationService } from '../../../src/service/NativeCodexObservationService.ts';
import { NativePilotCodexObservationService } from '../../../src/service/NativePilotCodexObservationService.ts';
import { NativePilotStateSnapshotRepository } from '../../../src/repository/NativePilotStateSnapshotRepository.ts';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

import { fixture } from '../../helpers/NativeCodexMeasuredFixture.mjs';

test('static transcript projection revalidates all 51 packages, native trust, MCP pages and exact resource without native execution', async () => {
    const f = await fixture();
    try {
        const observed = await new NativePilotCodexObservationService(validator).validate(
            f.selected,
        );
        assert.equal(observed.loaded_skills.length, 51);
        assert.equal(observed.mcp.catalog_count, 51);
        assert.equal(observed.read_only_mcp.branch, 'existing_unchanged');
        assert.equal(observed.session_start.fixture.requests, 1);
        assert.deepEqual(observed.process_identity, { pid: 50123, start_ticks: '12345' });
    } finally {
        f.remove();
    }
});

test('missing headers, authenticated fixture metadata, foreign child ownership and forced exit never produce projected success', async () => {
    for (const mutate of [
        (selected) => {
            selected.fixture_metadata.request_count = 2;
        },
        (selected) => {
            selected.fixture_metadata.exchanges = [];
        },
        (selected) => {
            selected.fixture_metadata.exchanges[0].raw_headers = [
                'Authorization',
                'synthetic-control-value',
            ];
        },
        (selected) => {
            selected.identity.processes[0].identity.expected_ppid = 101;
        },
        (selected) => {
            selected.events.events[3].signal = 'SIGKILL';
            selected.events.events[3].exit_code = null;
        },
        (selected) => {
            selected.request = Buffer.from(
                selected.request.toString().replace('forceReload":true', 'forceReload":false'),
            );
        },
        (selected) => {
            selected.states[1].snapshot = {
                ...selected.states[1].snapshot,
                state_sha256: sha('changed'),
            };
        },
    ]) {
        const f = await fixture(1);
        try {
            mutate(f.selected);
            await assert.rejects(
                new NativePilotCodexObservationService(validator).validate(f.selected),
            );
        } finally {
            f.remove();
        }
    }
});

test('unknown native notification and extra unmatched response remain rejected', async () => {
    for (const extra of [
        { method: 'unexpected/notification', params: {} },
        { id: 99, result: {} },
    ]) {
        const f = await fixture(1);
        try {
            f.selected.stdout = Buffer.concat([
                f.selected.stdout,
                Buffer.from(JSON.stringify(extra) + '\n'),
            ]);
            await assert.rejects(
                new NativePilotCodexObservationService(validator).validate(f.selected),
            );
        } finally {
            f.remove();
        }
    }
});

test('native cache permits exactly the four outside-package aliases while reconciling every installed byte', async () => {
    const f = await fixture(1);
    try {
        const s = f.selected,
            normal = ['.claude/skills', '.github/skills', 'CLAUDE.md', 'GEMINI.md'];
        const aliases = normal.map((path) => {
            const target = path.endsWith('/skills') ? '../.agents/skills' : 'AGENTS.md';
            return {
                path,
                kind: 'symlink',
                bytes: Buffer.byteLength(target),
                sha256: sha(target),
                executable: false,
                target,
            };
        });
        const entries = [...s.input.artifactInventory.entries, ...aliases].sort((a, b) =>
            a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
        );
        s.input.artifactInventory = {
            ...s.input.artifactInventory,
            entries,
            tree_sha256: sha(JSON.stringify(entries)),
        };
        const cache = `${syntheticContainerHome}/.codex/plugins/cache/i9-skills/i9-skills/synthetic-version`;
        s.stdout = Buffer.from(s.stdout.toString().replaceAll('/pilot/source', cache));
        s.report = JSON.parse(JSON.stringify(s.report).replaceAll('/pilot/source', cache));
        s.report.observation.source_artifact_tree_sha256 = s.input.artifactInventory.tree_sha256;
        s.report.observation.transformations = aliases.map(({ path, target }) => ({
            kind: 'omitted-repository-alias',
            path,
            target,
        }));
        const actual = s.report.observation.installed_artifact_inventory;
        s.home = new Map(
            actual.entries.map((entry) => {
                const path = cache.slice(`${syntheticContainerHome}/`.length) + '/' + entry.path;
                return [
                    path,
                    {
                        ...entry,
                        path,
                        base64:
                            entry.kind === 'file'
                                ? Buffer.from('Synthetic selected resource.\n').toString('base64')
                                : null,
                    },
                ];
            }),
        );
        const result = await new NativePilotCodexObservationService(validator).validate(s);
        assert.equal(result.transformations.length, 4);
        const missing = structuredClone(s);
        missing.home.delete([...s.home.keys()].find((path) => path.endsWith('SKILL.md')));
        await assert.rejects(
            new NativePilotCodexObservationService(validator).validate(missing),
            /projection_loaded_inventory/,
        );
        const unsafe = structuredClone(s);
        unsafe.input.artifactInventory.entries.find((entry) => entry.path === 'CLAUDE.md').target =
            'different-target';
        unsafe.input.artifactInventory.tree_sha256 = sha(
            JSON.stringify(unsafe.input.artifactInventory.entries),
        );
        await assert.rejects(new NativePilotCodexObservationService(validator).validate(unsafe));
    } finally {
        f.remove();
    }
});

export { fixture };
