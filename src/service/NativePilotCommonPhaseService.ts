// SPDX-License-Identifier: Apache-2.0
import type {
    NativePilotContract,
    NativePilotSelection,
} from '../config/NativePilotConfiguration.ts';
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';
import type { NativePilotProcess } from '../repository/NativePilotProcessRepository.ts';
import { NativePilotContractValidator } from '../validator/NativePilotContractValidator.ts';

export interface NativePilotCommonSelection extends NativePilotSelection {
    phase: string;
    pin: 'a' | 'b' | 'restored-a' | null;
}
export interface NativePilotCommonCall {
    label: string;
    executable: string;
    argv: string[];
}
export interface NativePilotCommonTransport {
    context(selection: NativePilotCommonSelection): {
        contract: NativePilotContract;
        evidence: unknown;
    };
    seed(): void;
    snapshot(label: string): Array<{ role: string; path: string; bytes: number; sha256: string }>;
    run(call: NativePilotCommonCall): Promise<{
        process: NativePilotProcess;
        pid: number | null;
        start_ticks: string | null;
        identity: { path: string; bytes: number; sha256: string };
        stdout: { path: string; bytes: number; sha256: string };
        stderr: { path: string; bytes: number; sha256: string };
        text: string | null;
    }>;
    finish(value: unknown): unknown;
}

/** Closed phase recipes produce evidence, never lifecycle gate approval. */
export class NativePilotCommonPhaseService {
    selection(args: string[]): NativePilotCommonSelection {
        if (
            ![12, 14].includes(args.length) ||
            args[0] !== '--contract' ||
            args[1] !== '/pilot/contract.json' ||
            args[2] !== '--root' ||
            args[3] !== '/pilot' ||
            args[4] !== '--run-id' ||
            args[6] !== '--host' ||
            args[8] !== '--repetition' ||
            args[10] !== '--phase' ||
            (args.length === 14 && args[12] !== '--pin')
        )
            throw new Error('common_closed_arguments');
        const selected = new NativePilotContractValidator().selection({
            run_id: args[5],
            host: args[7],
            repetition: Number(args[9]),
        });
        const phase = args[11];
        const pin = args.length === 14 ? args[13] : null;
        const allowed = new Set([
            'preflight',
            'baseline',
            'observe-a',
            'observe-b',
            'observe-restored-a',
            'stop-a',
            'stop-b',
            'stop-restored-a',
            'verify-preserved',
            'verify-absent',
            'cleanup-processes',
        ]);
        const expected = phase.endsWith('restored-a')
            ? 'restored-a'
            : ['observe-a', 'stop-a'].includes(phase)
              ? 'a'
              : ['observe-b', 'stop-b'].includes(phase)
                ? 'b'
                : null;
        if (!allowed.has(phase) || pin !== expected) throw new Error('common_phase_or_pin');
        return { ...selected, phase, pin: pin as NativePilotCommonSelection['pin'] };
    }

    calls(
        selection: NativePilotCommonSelection,
        contract: NativePilotContract,
    ): NativePilotCommonCall[] {
        const native = `/pilot/runtime-bin/${selection.host}`;
        if (selection.phase === 'preflight')
            return [
                {
                    label: 'node-version',
                    executable: '/pilot/runtime-bin/node',
                    argv: ['--version'],
                },
                { label: 'native-version', executable: native, argv: ['--version'] },
            ];
        if (['baseline', 'verify-absent'].includes(selection.phase)) {
            const calls: NativePilotCommonCall[] = [
                {
                    label: 'native-auth-status',
                    executable: native,
                    argv: selection.host === 'codex' ? ['login', 'status'] : ['auth', 'status'],
                },
                {
                    label: 'native-plugin-list',
                    executable: native,
                    argv:
                        selection.host === 'codex'
                            ? ['plugin', 'list', '--marketplace', 'i9-skills', '--json']
                            : ['plugin', 'list', '--json'],
                },
                {
                    label: 'native-marketplace-list',
                    executable: native,
                    argv: ['plugin', 'marketplace', 'list', '--json'],
                },
            ];
            calls.push({
                label: 'selected-native-absence-observer',
                executable: '/pilot/runtime-bin/node',
                argv: [
                    `/pilot/input/observer/${contract.observer.entrypoint}`,
                    '--contract',
                    '/pilot/contract.json',
                    '--root',
                    '/pilot',
                    '--run-id',
                    selection.run_id,
                    '--host',
                    selection.host,
                    '--repetition',
                    String(selection.repetition),
                    '--phase',
                    selection.phase,
                ],
            });
            return calls;
        }
        if (['observe-a', 'observe-b', 'observe-restored-a'].includes(selection.phase))
            return [
                {
                    label: 'selected-native-observer',
                    executable: '/pilot/runtime-bin/node',
                    argv: [
                        `/pilot/input/observer/${contract.observer.entrypoint}`,
                        '--contract',
                        '/pilot/contract.json',
                        '--root',
                        '/pilot',
                        '--run-id',
                        selection.run_id,
                        '--host',
                        selection.host,
                        '--repetition',
                        String(selection.repetition),
                        '--phase',
                        selection.phase,
                        '--pin',
                        selection.pin!,
                    ],
                },
            ];
        // Native registration/auth codecs are supplied by the selected native observer.
        // Ordinary filesystem snapshots below do not claim their absence or success.
        return [];
    }

    async run(args: string[], transport: NativePilotCommonTransport) {
        const selection = this.selection(args);
        const { contract, evidence: context } = transport.context(selection);
        const processes = [];
        const snapshots = [];
        let blocked: string | null = null;
        if (selection.phase === 'baseline') transport.seed();
        snapshots.push(...transport.snapshot('before'));
        const calls = this.calls(selection, contract);
        for (const call of calls) {
            const observed = await transport.run(call);
            const { text, ...record } = observed;
            processes.push({ ...call, ...record });
            const authStatusCandidate =
                call.label === 'native-auth-status' && observed.process.exit_code === 1;
            if (
                observed.process.status !== 'completed' ||
                (observed.process.exit_code !== 0 && !authStatusCandidate) ||
                observed.process.signal !== null
            ) {
                blocked = `${call.label}-process-not-successful`;
                break;
            }
            if (selection.phase === 'preflight') {
                const wanted =
                    call.label === 'node-version'
                        ? [`v${contract.binaries.node.version}`]
                        : selection.host === 'codex'
                          ? [`codex-cli ${contract.binaries.codex.version}`]
                          : [`${contract.binaries.claude.version} (Claude Code)`];
                if (text === null || !wanted.includes(text.replace(/\r?\n$/, ''))) {
                    blocked = `${call.label}-response-unrecognized`;
                    break;
                }
            }
        }
        snapshots.push(...transport.snapshot('after'));
        return transport.finish({
            schema_version: 2,
            kind: 'native-common-phase-evidence',
            selection: {
                run_id: selection.run_id,
                host: selection.host,
                repetition: selection.repetition,
            },
            phase: selection.phase,
            pin: selection.pin,
            native_acceptance: false,
            context,
            processes,
            snapshots,
            result: blocked ? 'blocked' : 'observed',
            blocked_gate: blocked,
            unclaimed: [
                'native-authentication-or-registration-from-filesystem-snapshot',
                'native-absent-store-coverage',
                'all-processes-absent-from-this-dispatcher',
                ...NativePilotConfiguration.unclaimed,
            ],
        });
    }
}
