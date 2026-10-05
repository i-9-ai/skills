// SPDX-License-Identifier: Apache-2.0
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { NativePilotSelection } from '../config/NativePilotConfiguration.ts';
import type { NativePilotPreparation } from '../repository/NativePilotPreparationRepository.ts';
import { NativePilotInventoryRepository } from '../repository/NativePilotInventoryRepository.ts';
import { NativePilotEvidenceRepository } from '../repository/NativePilotEvidenceRepository.ts';
import { NativePilotContractValidator } from '../validator/NativePilotContractValidator.ts';
import type {
    NativePilotBoundaryAdapter,
    NativePilotLaneResult,
} from './NativePilotDriverService.ts';
import { NativePilotDriverService } from './NativePilotDriverService.ts';
import { NativePilotReportService } from './NativePilotReportService.ts';

export type NativePilotLaneAdapterFactory = (
    selection: NativePilotSelection,
) => Promise<NativePilotBoundaryAdapter>;

/** Sequential declared lanes, unchanged phase journals and bounded compact projections. */
export class NativePilotLifecycleService {
    readonly inventory = new NativePilotInventoryRepository();

    selections(input: unknown) {
        if (!Array.isArray(input) || input.length < 1 || input.length > 4)
            throw new Error('Select one to four bounded host/repetition lanes.');
        const lanes = input.map((item) => new NativePilotContractValidator().selection(item));
        if (
            new Set(lanes.map((lane) => lane.run_id)).size !== lanes.length ||
            new Set(lanes.map((lane) => `${lane.host}/${lane.repetition}`)).size !== lanes.length
        )
            throw new Error('Each declared lane requires a distinct UUID and host/repetition.');
        return lanes;
    }

    async run(
        prepared: NativePilotPreparation,
        input: unknown,
        createAdapter: NativePilotLaneAdapterFactory,
    ) {
        const lanes = this.selections(input);
        const journalRoot = join(prepared.root, 'output', 'journal');
        const evidenceRoot = join(prepared.root, 'output', 'evidence');
        new NativePilotEvidenceRepository().preflightOutput(
            prepared.root,
            prepared.contract_sha256,
            journalRoot,
            evidenceRoot,
        );
        const root = join(evidenceRoot, `operator-${lanes[0].run_id}`);
        // Exclusive creation prevents a repeated request from replacing an earlier report.
        mkdirSync(root, { mode: 0o700 });
        const results: NativePilotLaneResult[] = [];
        const laneReceipts: Array<{ run_id: string; path: string; sha256: string; bytes: number }> =
            [];
        let setupFailure: {
            selection: NativePilotSelection;
            reason: 'operator-or-adapter-blocked';
            phase_journal_may_exist: true;
        } | null = null;
        for (const [index, selection] of lanes.entries()) {
            try {
                const adapter = await createAdapter(selection);
                const result = await new NativePilotDriverService().run(
                    prepared,
                    selection,
                    adapter,
                    journalRoot,
                    evidenceRoot,
                );
                const path = join(journalRoot, selection.run_id, 'result.json');
                const receipt = this.inventory.file(path);
                if (JSON.stringify(this.inventory.readJson(path)) !== JSON.stringify(result))
                    throw new Error('Retained lane result differs from returned result.');
                results.push(result);
                laneReceipts.push({
                    run_id: selection.run_id,
                    path: `journal/${selection.run_id}/result.json`,
                    sha256: receipt.sha256,
                    bytes: receipt.bytes,
                });
                this.inventory.writeJson(
                    join(root, `${String(index).padStart(2, '0')}-lane.json`),
                    {
                        schema_version: 1,
                        selection,
                        result: laneReceipts.at(-1),
                        status: result.status,
                        native_acceptance: false,
                    },
                );
            } catch {
                // The coordinator/controller independently retain any partially reached phase.
                // Do not replace that evidence with a made-up complete lane result.
                setupFailure = {
                    selection,
                    reason: 'operator-or-adapter-blocked',
                    phase_journal_may_exist: true,
                };
                this.inventory.writeJson(
                    join(root, `${String(index).padStart(2, '0')}-operator-blocked.json`),
                    { schema_version: 1, ...setupFailure, native_acceptance: false },
                );
                break;
            }
        }
        const summary = new NativePilotReportService().summarize(results);
        const attempted = results.length + (setupFailure ? 1 : 0);
        const report = {
            schema_version: 1,
            kind: 'disposable-native-lifecycle-operator',
            native_acceptance: false,
            contract_sha256: prepared.contract_sha256,
            selected_lanes: lanes,
            declared_lanes_attempted: attempted,
            all_declared_lanes_attempted: attempted === lanes.length,
            lane_results: laneReceipts,
            operator_failure: setupFailure,
            unattempted_lanes: lanes.slice(attempted),
            summary,
        };
        const path = join(root, 'operator-result.json');
        const receipt = this.inventory.writeJson(path, report);
        return { report, receipt: { path, ...receipt } };
    }
}
