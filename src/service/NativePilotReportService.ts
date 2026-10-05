// SPDX-License-Identifier: Apache-2.0
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';
import type { NativePilotLaneResult } from './NativePilotDriverService.ts';
import {
    closedObject,
    NativePilotContractValidator,
} from '../validator/NativePilotContractValidator.ts';

/** A compact metadata projection; it cannot certify imported assertions as native proof. */
export class NativePilotReportService {
    summarize(input: unknown) {
        if (!Array.isArray(input) || input.length > 4)
            throw new Error('Only four fixed host/repetition lanes belong to one pilot.');
        const lanes = input as NativePilotLaneResult[];
        const keys = new Set<string>();
        const runs = new Set<string>();
        const environments = new Set<string>();
        const profiles = new Set<string>();
        const contracts = new Set<string>();
        for (const lane of lanes) {
            closedObject(
                lane,
                [
                    'schema_version',
                    'selection',
                    'mode',
                    'contract_sha256',
                    'status',
                    'native_acceptance',
                    'data_compatibility',
                    'environment',
                    'steps',
                    'abort',
                ],
                'lane',
            );
            new NativePilotContractValidator().selection(lane.selection);
            if (
                lane.schema_version !== 1 ||
                lane.native_acceptance !== false ||
                !['native', 'synthetic'].includes(lane.mode) ||
                !/^[0-9a-f]{64}$/.test(lane.contract_sha256) ||
                lane.contract_sha256.length !== 64 ||
                ![
                    'synthetic-only',
                    'evidence-ready-for-independent-review',
                    'data-compatibility-blocked',
                    'failed',
                    'blocked',
                ].includes(lane.status) ||
                !['not-observed', 'compatible', 'blocked-newer-schema'].includes(
                    lane.data_compatibility,
                ) ||
                !['not-needed', 'requested-retention-unverified', 'adapter-error'].includes(
                    lane.abort,
                ) ||
                !Array.isArray(lane.steps) ||
                JSON.stringify(lane.steps.map((step) => step.id)) !==
                    JSON.stringify(NativePilotConfiguration.phases)
            ) {
                throw new Error('Malformed lane result.');
            }
            for (const step of lane.steps) {
                closedObject(step, ['id', 'verdict', 'reason'], 'step result');
                if (
                    !['candidate-pass', 'failed', 'blocked', 'not-run'].includes(step.verdict) ||
                    ![
                        'earlier-stage-did-not-pass',
                        'process-or-observed-gate-failed',
                        'synthetic-driver-check-only',
                        'retained-adapter-assertions-require-independent-review',
                        'adapter-timeout-or-error',
                        'job-bound-exceeded',
                        'invalid-observation',
                        'evidence-integrity-mismatch',
                        'prepared-input-changed',
                    ].includes(step.reason)
                )
                    throw new Error('Unknown status or unsafe projection reason.');
            }
            if (lane.environment !== null) {
                closedObject(
                    lane.environment,
                    ['instance_sha256', 'profile_sha256'],
                    'environment',
                );
                if (
                    Object.values(lane.environment).some(
                        (value) =>
                            typeof value !== 'string' ||
                            value.length !== 64 ||
                            !/^[0-9a-f]{64}$/.test(value),
                    )
                )
                    throw new Error('Malformed environment identity.');
            }
            if (
                [
                    'synthetic-only',
                    'evidence-ready-for-independent-review',
                    'data-compatibility-blocked',
                ].includes(lane.status) &&
                (!lane.environment ||
                    lane.abort !== 'not-needed' ||
                    lane.steps.some((step) => step.verdict !== 'candidate-pass') ||
                    (lane.status === 'synthetic-only' && lane.mode !== 'synthetic') ||
                    (lane.status === 'evidence-ready-for-independent-review' &&
                        (lane.mode !== 'native' || lane.data_compatibility !== 'compatible')) ||
                    (lane.status === 'data-compatibility-blocked' &&
                        lane.data_compatibility !== 'blocked-newer-schema'))
            ) {
                throw new Error('A completed lane cannot omit or promote its observations.');
            }
            const key = `${lane.selection.host}/${lane.selection.repetition}`;
            if (
                keys.has(key) ||
                runs.has(lane.selection.run_id) ||
                (lane.environment &&
                    (environments.has(lane.environment.instance_sha256) ||
                        profiles.has(lane.environment.profile_sha256)))
            ) {
                throw new Error(
                    'Host/repetition, run, disposable instance and profile must be distinct.',
                );
            }
            keys.add(key);
            runs.add(lane.selection.run_id);
            contracts.add(lane.contract_sha256);
            if (lane.environment) {
                environments.add(lane.environment.instance_sha256);
                profiles.add(lane.environment.profile_sha256);
            }
        }
        if (contracts.size > 1)
            throw new Error('The matrix must use the same frozen execution contract.');
        const expected = ['codex/1', 'codex/2', 'claude/1', 'claude/2'];
        const missing = expected.filter((key) => !keys.has(key));
        const complete =
            !missing.length &&
            lanes.every(
                (lane) =>
                    lane.mode === 'native' &&
                    [
                        'evidence-ready-for-independent-review',
                        'data-compatibility-blocked',
                    ].includes(lane.status),
            );
        const compatible =
            complete && lanes.every((lane) => lane.data_compatibility === 'compatible');
        return {
            schema_version: 1,
            status: complete
                ? compatible
                    ? 'evidence-ready-for-independent-review'
                    : 'evidence-ready-with-observed-compatibility-limit'
                : 'incomplete-native-evidence',
            native_acceptance: false,
            exercise_evidence_complete: complete,
            full_data_compatibility: compatible,
            assurance: 'local-evidence-integrity-and-adapter-assertions-only',
            missing_lanes: missing,
            lanes: lanes.map((lane) => ({
                host: lane.selection.host,
                repetition: lane.selection.repetition,
                mode: lane.mode,
                status: lane.status,
                data_compatibility: lane.data_compatibility,
                failed: lane.steps
                    .filter((step) => step.verdict === 'failed' || step.verdict === 'blocked')
                    .map((step) => ({ phase: step.id, reason: step.reason })),
                not_run: lane.steps
                    .filter((step) => step.verdict === 'not-run')
                    .map((step) => step.id),
            })),
            unclaimed: NativePilotConfiguration.unclaimed,
        };
    }
}
