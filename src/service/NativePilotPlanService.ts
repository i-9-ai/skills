// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import type { NativePilotPreparation } from '../repository/NativePilotPreparationRepository.ts';
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';
import type { NativePilotPin, NativePilotStep } from '../config/NativePilotConfiguration.ts';
import { NativePilotContractValidator } from '../validator/NativePilotContractValidator.ts';

/** Composes one closed host lane; no shell, arbitrary commands, host homes or models. */
export class NativePilotPlanService {
    plan(
        prepared: Pick<NativePilotPreparation, 'root' | 'contract'>,
        input: unknown,
        boundary?: 'disposable-container-v1',
    ): NativePilotStep[] {
        const selection = new NativePilotContractValidator().selection(input);
        const { host } = selection;
        const root = prepared.root;
        const source = join(root, 'source');
        const plugin = 'i9-skills@i9-skills';
        const binary = join(root, 'runtime-bin', host);
        const limits = NativePilotConfiguration.limits;
        const native = (
            id: string,
            pin: NativePilotPin | null,
            commands: string[][],
            checks: string[] = [],
        ) => ({
            id,
            pin,
            operation: 'native' as const,
            commands: commands.map((args) => ({
                executable: binary,
                args,
                timeout_ms: limits.command_ms,
            })),
            checks,
        });
        const observe = (
            id: string,
            pin: NativePilotPin | null,
            checks: string[],
        ): NativePilotStep => ({
            id,
            pin,
            operation: 'observe',
            checks,
            commands: [
                {
                    executable: join(root, 'runtime-bin', 'node'),
                    args: [
                        join(
                            root,
                            'input',
                            'driver',
                            NativePilotConfiguration.entrypoint('NativePilotCommonObserverRunner'),
                        ),
                        '--contract',
                        join(root, 'contract.json'),
                        '--root',
                        root,
                        '--run-id',
                        selection.run_id,
                        '--host',
                        host,
                        '--repetition',
                        String(selection.repetition),
                        '--phase',
                        id,
                        ...(pin ? ['--pin', pin] : []),
                    ],
                    timeout_ms:
                        id === 'preflight'
                            ? limits.observe_ms
                            : [
                                    'stop-a',
                                    'stop-b',
                                    'stop-restored-a',
                                    'cleanup-processes',
                                    'retain',
                                    'cleanup-owned',
                                ].includes(id)
                              ? limits.cleanup_ms
                              : limits.observe_ms,
                },
            ],
        });
        const switchTo = (pin: 'a' | 'b'): NativePilotStep => ({
            id: `select-${pin}`,
            pin,
            operation: 'switch',
            commands: [],
            checks: [
                'owned-native-live-processes-absent',
                'active-source-matches-pin',
                'snapshots-preserved',
            ],
        });
        const runtime = (id: string, pin: NativePilotPin) =>
            observe(id, pin, [
                'fresh-native-process',
                'enabled-native-registration',
                'complete-loaded-skill-inventory',
                'loaded-source-matches-pin',
                'native-session-hook-completed',
                'native-hook-output-observed',
                'native-mcp-initialized',
                'read-only-mcp-preserved-state',
                'source-and-consumer-unchanged',
                'prior-state-rows-preserved',
                'unrelated-data-preserved',
                ...(host === 'codex'
                    ? [
                          'exact-hook-trust',
                          'native-mcp-catalog-and-resource',
                          'one-local-response-no-auth-no-tools-no-provider',
                      ]
                    : ['init-only-no-model', 'native-plugin-data-preserved']),
            ]);
        const stop = (id: string, pin: NativePilotPin) =>
            observe(id, pin, [
                'owned-native-live-processes-absent',
                'state-closed-and-snapshotted',
                'source-and-consumer-unchanged',
            ]);
        const refresh =
            host === 'codex'
                ? [['plugin', 'add', plugin, '--json']]
                : [
                      ['plugin', 'marketplace', 'update', 'i9-skills'],
                      ['plugin', 'update', plugin, '--scope', 'user', '--json'],
                  ];
        const steps = [
            observe('preflight', null, [
                'fresh-disposable-account',
                'normal-home-unchanged',
                'no-home-overrides',
                'no-credentials',
                'input-and-binary-pins-match',
                'exact-native-and-node-versions',
                'approved-native-schema',
                'measured-network-isolation',
                'measured-readonly-source-consumer-runtime',
                'measured-owned-writes',
                'measured-outside-write-denial',
                'privileged-sockets-inaccessible',
                'controller-and-native-permissions-separated',
            ]),
            observe('baseline', null, [
                'unauthenticated',
                'owned-plugin-and-marketplace-absent',
                'unrelated-settings-and-file-sentinels-recorded',
                'state-baseline-recorded',
            ]),
            native(
                'install-a',
                'a',
                host === 'codex'
                    ? [
                          ['plugin', 'marketplace', 'add', source, '--json'],
                          ['plugin', 'add', plugin, '--json'],
                      ]
                    : [
                          ['plugin', 'validate', source, '--json'],
                          ['plugin', 'marketplace', 'add', source, '--scope', 'user'],
                          ['plugin', 'install', plugin, '--scope', 'user', '--json'],
                      ],
            ),
            runtime('observe-a', 'a'),
            stop('stop-a', 'a'),
            switchTo('b'),
            native('update-b', 'b', refresh),
            runtime('observe-b', 'b'),
            stop('stop-b', 'b'),
            switchTo('a'),
            native('rollback-a', 'restored-a', refresh),
            runtime('observe-restored-a', 'restored-a'),
            stop('stop-restored-a', 'restored-a'),
            native(
                'uninstall',
                null,
                host === 'codex'
                    ? [['plugin', 'remove', plugin, '--json']]
                    : [['plugin', 'uninstall', plugin, '--scope', 'user', '--keep-data', '--json']],
            ),
            observe('verify-preserved', null, [
                'prior-state-rows-preserved',
                'unrelated-data-preserved',
                ...(host === 'claude' ? ['native-plugin-data-preserved'] : []),
            ]),
            native(
                'remove-marketplace',
                null,
                host === 'codex'
                    ? [['plugin', 'marketplace', 'remove', 'i9-skills', '--json']]
                    : [['plugin', 'marketplace', 'remove', 'i9-skills', '--scope', 'user']],
            ),
            observe('verify-absent', null, [
                'fresh-native-process',
                'owned-plugin-and-marketplace-absent',
                'owned-hooks-and-mcp-absent',
                'unauthenticated',
                'prior-state-rows-preserved',
                'unrelated-data-preserved',
                ...(host === 'claude' ? ['native-plugin-data-preserved'] : []),
            ]),
            observe('cleanup-processes', null, [
                'owned-native-live-processes-absent',
                'owned-listeners-absent',
            ]),
            observe('retain', null, [
                'private-evidence-and-state-retained',
                'retention-digest-verified',
            ]),
            observe('cleanup-owned', null, [
                'retention-receipt-rechecked',
                'only-owned-resources-removed',
                'disposable-profile-destroyed',
                'retained-evidence-still-present',
            ]),
        ];
        if (boundary === 'disposable-container-v1') {
            // The selected OS controller owns retention and destruction. Its facts
            // must not pretend the native observer destroyed its own container.
            steps.find((step) => step.id === 'retain')!.commands = [
                {
                    executable: join(root, 'runtime-bin', 'node'),
                    args: [
                        join(
                            root,
                            'input',
                            'driver',
                            NativePilotConfiguration.entrypoint('NativePilotContainerWorkerRunner'),
                        ),
                        'export',
                        join(root, 'control', 'worker.json'),
                    ],
                    timeout_ms: limits.cleanup_ms,
                },
            ];
            steps.find((step) => step.id === 'cleanup-owned')!.commands = [];
        }
        return steps;
    }
}
