// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fixture, fakeAdapter } from './NativePilotFixture.mjs';
import { NativePilotDriverService } from '../../src/service/NativePilotDriverService.ts';
import { NativePilotReportService } from '../../src/service/NativePilotReportService.ts';
import { pilotDigest } from '../../src/repository/NativePilotInventoryRepository.ts';

/** Actual producer bytes enter Driver; unrelated lifecycle phases remain explicit test doubles. */
export async function consumeLoadedProjection(
    t,
    producer,
    projected,
    selection,
    evidenceRoot,
    expectedVerdict = 'candidate-pass',
) {
    const f = fixture(t);
    const prepared = f.prepare();
    for (const key of ['source_a', 'source_b']) {
        const destination = join(prepared.root, 'input', key);
        rmSync(destination, { recursive: true });
        f.inventory.copyTree(
            join(producer.root, 'input', key),
            destination,
            producer.prepared.trees[key],
        );
        const tree = f.inventory.tree(destination);
        prepared.trees[key] = tree;
        prepared.contract[key].tree_sha256 = tree.tree_sha256;
        prepared.package_names[key === 'source_a' ? 'a' : 'b'] = tree.entries
            .filter(
                (entry) =>
                    entry.kind === 'file' &&
                    /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(entry.path),
            )
            .map((entry) => entry.path.split('/')[2])
            .sort();
    }
    const path = prepared.trees.source_a.entries.find(
        (entry) =>
            entry.kind === 'file' &&
            prepared.trees.source_b.entries.some(
                (other) =>
                    other.path === entry.path &&
                    other.kind === 'file' &&
                    other.sha256 !== entry.sha256,
            ),
    ).path;
    prepared.contract.witnesses = [
        {
            path,
            a_sha256: f.inventory.file(join(prepared.root, 'input/source_a', path)).sha256,
            b_sha256: f.inventory.file(join(prepared.root, 'input/source_b', path)).sha256,
        },
    ];
    prepared.contract_sha256 = pilotDigest(JSON.stringify(prepared.contract));
    // The fixture owns these markers and rebinds them before any Driver operation.
    writeFileSync(join(prepared.root, 'contract.json'), JSON.stringify(prepared.contract) + '\n');
    writeFileSync(
        join(prepared.root, 'output/.i9-native-pilot-output-owned'),
        JSON.stringify({
            schema_version: 1,
            contract_sha256: prepared.contract_sha256,
            journal: 'journal',
            evidence: 'evidence',
        }) + '\n',
    );
    const inventoryPath = projected.loaded.inventory_evidence;
    const actualBytes = readFileSync(join(evidenceRoot, inventoryPath));
    const receipt = projected.evidence.find(
        (row) => row.path === inventoryPath && row.kind === 'inventory',
    );
    assert.equal(actualBytes.length, receipt.bytes);
    assert.equal(pilotDigest(actualBytes), receipt.sha256);
    const adapter = fakeAdapter(prepared, f.root, selection, (observation, step, owned) => {
        if (step.id !== producer.step.id) return;
        const destination = join(owned.evidenceRoot, inventoryPath);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, actualBytes, { flag: 'wx' });
        observation.evidence.push({ ...receipt });
        observation.loaded = structuredClone(projected.loaded);
        if (step.id === 'observe-restored-a') {
            observation.rollback_state = structuredClone(projected.rollback_state);
            for (const path of projected.rollback_state?.evidence ?? []) {
                const stateReceipt = projected.evidence.find(
                    (row) => row.path === path && row.kind === 'state',
                );
                const bytes = readFileSync(join(evidenceRoot, path));
                assert.equal(bytes.length, stateReceipt.bytes);
                assert.equal(pilotDigest(bytes), stateReceipt.sha256);
                const destination = join(owned.evidenceRoot, path);
                mkdirSync(dirname(destination), { recursive: true });
                writeFileSync(destination, bytes, { flag: 'wx' });
                observation.evidence.push({ ...stateReceipt });
            }
        }
    });
    const lane = await new NativePilotDriverService().run(
        prepared,
        selection,
        adapter.adapter,
        adapter.journalParent,
        adapter.evidenceRoot,
    );
    assert.equal(lane.steps.find((step) => step.id === producer.step.id).verdict, expectedVerdict);
    assert.equal(lane.native_acceptance, false);
    assert.equal(lane.status, expectedVerdict === 'candidate-pass' ? 'synthetic-only' : 'blocked');
    assert.equal(adapter.aborts(), expectedVerdict === 'candidate-pass' ? 0 : 1);
    assert.equal(lane.data_compatibility, 'not-exercised');
    const report = new NativePilotReportService().summarize([lane]);
    assert.equal(report.full_data_compatibility, false);
    const retained = readFileSync(join(adapter.evidenceRoot, inventoryPath));
    assert.deepEqual(retained, actualBytes);
    return lane;
}
