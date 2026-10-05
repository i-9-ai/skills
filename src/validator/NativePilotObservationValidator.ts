// SPDX-License-Identifier: Apache-2.0
import type {
    NativePilotMode,
    NativePilotSelection,
    NativePilotStep,
} from '../config/NativePilotConfiguration.ts';
import type { NativePilotProcess } from '../repository/NativePilotProcessRepository.ts';
import type { NativePilotEvidence } from '../repository/NativePilotEvidenceRepository.ts';
import type { NativePilotPreparation } from '../repository/NativePilotPreparationRepository.ts';
import { closedObject } from './NativePilotContractValidator.ts';

export interface NativePilotObservation {
    schema_version: 2;
    run_id: string;
    host: 'codex' | 'claude';
    repetition: 1 | 2;
    phase: string;
    mode: NativePilotMode;
    processes: NativePilotProcess[];
    checks: Array<{ id: string; satisfied: boolean; evidence: string[] }>;
    evidence: NativePilotEvidence[];
    environment: { instance_sha256: string; profile_sha256: string } | null;
    rollback_state: {
        preservation: 'observed';
        compatibility: 'not-exercised';
        before_sha256: string;
        after_sha256: string;
        evidence: string[];
    } | null;
    loaded: {
        process_instance: string;
        source_tree_sha256: string;
        installed_tree_sha256: string;
        inventory_evidence: string;
        transformations: Array<{ kind: 'omitted-repository-alias'; path: string; target: string }>;
    } | null;
}

/** Closed observation assertions, not a substitute for independent native-log review. */
export class NativePilotObservationValidator {
    validate(
        raw: unknown,
        step: NativePilotStep,
        selection: NativePilotSelection,
        mode: NativePilotMode,
        prepared: NativePilotPreparation,
        priorInstances: ReadonlySet<string>,
    ) {
        const item = closedObject(
            raw,
            [
                'schema_version',
                'run_id',
                'host',
                'repetition',
                'phase',
                'mode',
                'processes',
                'checks',
                'evidence',
                'loaded',
                'environment',
                'rollback_state',
            ],
            'observation',
        );
        if (
            item.schema_version !== 2 ||
            item.run_id !== selection.run_id ||
            item.host !== selection.host ||
            item.repetition !== selection.repetition ||
            item.phase !== step.id ||
            item.mode !== mode ||
            !Array.isArray(item.processes) ||
            item.processes.length !== step.commands.length ||
            !Array.isArray(item.checks) ||
            item.checks.length !== step.checks.length ||
            !Array.isArray(item.evidence)
        ) {
            throw new Error('Observation identity or phase coverage mismatch.');
        }
        for (const rawProcess of item.processes) {
            const process = closedObject(rawProcess, ['status', 'exit_code', 'signal'], 'process');
            if (
                ![
                    'completed',
                    'timeout',
                    'unavailable',
                    'interrupted',
                    'execution-error',
                    'output-limit',
                ].includes(String(process.status)) ||
                !(
                    process.exit_code === null ||
                    (Number.isSafeInteger(process.exit_code) && Number(process.exit_code) >= 0)
                ) ||
                ![null, 'SIGTERM', 'SIGKILL', 'SIGINT', 'other'].includes(
                    process.signal as never,
                ) ||
                (process.status === 'completed' &&
                    (process.exit_code === null || process.signal !== null)) ||
                (process.status === 'unavailable' &&
                    (process.exit_code !== null || process.signal !== null))
            ) {
                throw new Error('Invalid process classification.');
            }
        }
        const paths = new Set<string>();
        for (const rawEvidence of item.evidence) {
            const file = closedObject(rawEvidence, ['path', 'sha256', 'bytes', 'kind'], 'evidence');
            if (
                typeof file.path !== 'string' ||
                typeof file.sha256 !== 'string' ||
                !/^[0-9a-f]{64}$/.test(file.sha256) ||
                file.sha256.length !== 64 ||
                !Number.isSafeInteger(file.bytes) ||
                Number(file.bytes) < 0 ||
                ![
                    'native-log',
                    'process',
                    'inventory',
                    'state',
                    'confinement',
                    'retention',
                ].includes(String(file.kind)) ||
                paths.has(file.path)
            ) {
                throw new Error('Malformed evidence receipt.');
            }
            paths.add(file.path);
        }
        const seen = new Set<string>();
        for (const rawCheck of item.checks) {
            const check = closedObject(rawCheck, ['id', 'satisfied', 'evidence'], 'check');
            if (
                typeof check.id !== 'string' ||
                !step.checks.includes(check.id) ||
                seen.has(check.id) ||
                typeof check.satisfied !== 'boolean' ||
                !Array.isArray(check.evidence) ||
                !check.evidence.length ||
                check.evidence.some((path) => typeof path !== 'string' || !paths.has(path))
            ) {
                throw new Error(
                    'A gate requires its exact identity and retained evidence references.',
                );
            }
            seen.add(check.id);
        }
        const kinds = new Set(item.evidence.map((value) => (value as NativePilotEvidence).kind));
        if (step.operation === 'native' && !kinds.has('native-log'))
            throw new Error('Native commands require retained native output.');
        if (step.id === 'preflight' && !kinds.has('confinement'))
            throw new Error('Measured confinement evidence is required.');
        if (step.id === 'preflight') {
            const environment = closedObject(
                item.environment,
                ['instance_sha256', 'profile_sha256'],
                'environment',
            );
            if (
                Object.values(environment).some(
                    (value) =>
                        typeof value !== 'string' ||
                        value.length !== 64 ||
                        !/^[0-9a-f]{64}$/.test(value),
                )
            ) {
                throw new Error('Fresh environment and profile identities must be retained.');
            }
        } else if (item.environment !== null)
            throw new Error('Environment identity is only accepted at measured preflight.');
        if (step.id === 'retain' && !kinds.has('retention'))
            throw new Error('A private retention receipt is required before cleanup.');
        const runtime = ['observe-a', 'observe-b', 'observe-restored-a'].includes(step.id);
        if (step.id === 'observe-restored-a') {
            const state = closedObject(
                item.rollback_state,
                ['preservation', 'compatibility', 'before_sha256', 'after_sha256', 'evidence'],
                'rollback_state',
            );
            if (
                state.preservation !== 'observed' ||
                state.compatibility !== 'not-exercised' ||
                [state.before_sha256, state.after_sha256].some(
                    (value) =>
                        typeof value !== 'string' ||
                        value.length !== 64 ||
                        !/^[0-9a-f]{64}$/.test(value),
                ) ||
                !Array.isArray(state.evidence) ||
                state.evidence.length !== 2 ||
                state.evidence[0] === state.evidence[1] ||
                state.evidence.some((path) => !paths.has(String(path)))
            ) {
                throw new Error(
                    'Rollback preservation requires retained state evidence; selected-source compatibility is not exercised.',
                );
            }
            const before = item.evidence.find(
                (value) => (value as NativePilotEvidence).path === (state.evidence as unknown[])[0],
            ) as NativePilotEvidence | undefined;
            const after = item.evidence.find(
                (value) => (value as NativePilotEvidence).path === (state.evidence as unknown[])[1],
            ) as NativePilotEvidence | undefined;
            if (
                before?.kind !== 'state' ||
                after?.kind !== 'state' ||
                before.sha256 !== state.before_sha256 ||
                after.sha256 !== state.after_sha256
            ) {
                throw new Error(
                    'Rollback state digests must bind the two actual retained state snapshots.',
                );
            }
        } else if (item.rollback_state !== null)
            throw new Error('Rollback state is only accepted after restored A initializes.');
        if (runtime) {
            const loaded = closedObject(
                item.loaded,
                [
                    'process_instance',
                    'source_tree_sha256',
                    'installed_tree_sha256',
                    'inventory_evidence',
                    'transformations',
                ],
                'loaded',
            );
            const tree = step.pin === 'b' ? prepared.trees.source_b : prepared.trees.source_a;
            if (
                typeof loaded.process_instance !== 'string' ||
                !/^[0-9a-f]{64}$/.test(loaded.process_instance) ||
                loaded.process_instance.length !== 64 ||
                priorInstances.has(loaded.process_instance) ||
                loaded.source_tree_sha256 !== tree.tree_sha256 ||
                typeof loaded.installed_tree_sha256 !== 'string' ||
                !/^[a-f0-9]{64}$/.test(loaded.installed_tree_sha256) ||
                !Array.isArray(loaded.transformations) ||
                loaded.transformations.length > 4 ||
                !paths.has(String(loaded.inventory_evidence)) ||
                !item.evidence.some(
                    (value) =>
                        (value as NativePilotEvidence).path === loaded.inventory_evidence &&
                        (value as NativePilotEvidence).kind === 'inventory',
                ) ||
                !kinds.has('native-log') ||
                !kinds.has('state')
            ) {
                throw new Error(
                    'Fresh native process, complete loaded pin and state evidence are required.',
                );
            }
            const allowed = new Map([
                ['.claude/skills', '../.agents/skills'],
                ['.github/skills', '../.agents/skills'],
                ['CLAUDE.md', 'AGENTS.md'],
                ['GEMINI.md', 'AGENTS.md'],
            ]);
            const seenAliases = new Set<string>();
            for (const rawAlias of loaded.transformations as unknown[]) {
                const alias = closedObject(
                    rawAlias,
                    ['kind', 'path', 'target'],
                    'native alias transformation',
                );
                const source = tree.entries.find((entry) => entry.path === alias.path);
                if (
                    selection.host !== 'codex' ||
                    alias.kind !== 'omitted-repository-alias' ||
                    typeof alias.path !== 'string' ||
                    seenAliases.has(alias.path) ||
                    allowed.get(alias.path) !== alias.target ||
                    source?.kind !== 'symlink' ||
                    source.target !== alias.target
                )
                    throw new Error(
                        'Only the selected Codex repository aliases may be explicitly omitted.',
                    );
                seenAliases.add(alias.path);
            }
        } else if (item.loaded !== null)
            throw new Error('Loaded-runtime proof is only accepted at the three restart stages.');
        const observation = structuredClone(raw) as NativePilotObservation;
        const failed =
            observation.processes.some(
                (process) =>
                    process.status !== 'completed' ||
                    process.exit_code !== 0 ||
                    process.signal !== null,
            ) || observation.checks.some((check) => !check.satisfied);
        return { observation, verdict: failed ? ('failed' as const) : ('candidate-pass' as const) };
    }
}
