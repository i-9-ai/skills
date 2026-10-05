// SPDX-License-Identifier: Apache-2.0
import { NativePilotContractValidator } from '../validator/NativePilotContractValidator.ts';
import type { NativePilotSelection } from './NativePilotConfiguration.ts';

export interface NativeClaudeRawSelection extends NativePilotSelection {
    host: 'claude';
    phase: 'baseline' | 'observe-a' | 'observe-b' | 'observe-restored-a' | 'verify-absent';
    pin: 'a' | 'b';
}
export interface NativeClaudeRawCommand {
    label: string;
    executable: '/pilot/runtime-bin/claude';
    argv: string[];
    cwd: '/pilot/consumer';
    stdin: null;
    timeout_ms: number;
    output_bytes: number;
}

/** Closed no-conversation recipes; supported observations never imply lifecycle acceptance. */
export class NativeClaudeRawConfiguration {
    static readonly phaseMs = 40_000;
    static readonly commandMs = 12_000;
    static readonly outputBytes = 1_048_576;
    static readonly diagnosticBytes = 1_048_576;
    static readonly path = '/pilot/runtime-bin:/usr/local/bin:/usr/bin:/bin';

    selection(argv: string[]): NativeClaudeRawSelection {
        const keys = [
            '--contract',
            '--root',
            '--run-id',
            '--host',
            '--repetition',
            '--phase',
            '--pin',
        ];
        const fields = new Map<string, string>();
        if (argv.length !== 14) throw new Error('raw_selection');
        for (let index = 0; index < argv.length; index += 2) {
            if (!keys.includes(argv[index]) || fields.has(argv[index]))
                throw new Error('raw_selection');
            fields.set(argv[index], argv[index + 1]);
        }
        if (
            fields.get('--contract') !== '/pilot/contract.json' ||
            fields.get('--root') !== '/pilot' ||
            fields.get('--host') !== 'claude' ||
            !['baseline', 'observe-a', 'observe-b', 'observe-restored-a', 'verify-absent'].includes(
                fields.get('--phase') ?? '',
            ) ||
            fields.get('--pin') !== (fields.get('--phase') === 'observe-b' ? 'b' : 'a') ||
            !['1', '2'].includes(fields.get('--repetition') ?? '')
        )
            throw new Error('raw_selection');
        const selection = new NativePilotContractValidator().selection({
            run_id: fields.get('--run-id'),
            host: 'claude',
            repetition: Number(fields.get('--repetition')),
        });
        return {
            ...selection,
            host: 'claude',
            phase: fields.get('--phase') as NativeClaudeRawSelection['phase'],
            pin: fields.get('--pin') as NativeClaudeRawSelection['pin'],
        };
    }

    diagnostic(selection: NativeClaudeRawSelection): string {
        return `/pilot/native-output/${selection.run_id}-${selection.repetition}-${selection.phase}.claude.debug.log`;
    }

    commands(
        mcp: string,
        diagnostic: string,
        phase: NativeClaudeRawSelection['phase'] = 'observe-a',
    ): NativeClaudeRawCommand[] {
        if (
            !/^plugin:i9-skills:[a-z0-9][a-z0-9_-]{0,79}$/.test(mcp) ||
            !/^\/pilot\/native-output\/[0-9a-f-]{36}-[12]-(?:baseline|observe-a|observe-b|observe-restored-a|verify-absent)\.claude\.debug\.log$/.test(
                diagnostic,
            ) ||
            !diagnostic.endsWith(`-${phase}.claude.debug.log`)
        )
            throw new Error('raw_recipe');
        const absence = phase === 'baseline' || phase === 'verify-absent';
        return [
            ['version', ['--version']],
            ['auth-before', ['auth', 'status']],
            ['plugins', ['plugin', 'list', '--json']],
            ...(absence ? [['marketplaces', ['plugin', 'marketplace', 'list', '--json']]] : []),
            ['mcp-list', ['mcp', 'list']],
            ['mcp-get', ['mcp', 'get', mcp]],
            ...(!absence ? [['init-only', ['--init-only', '--debug-file', diagnostic]]] : []),
            ['auth-after', ['auth', 'status']],
        ].map(([label, argv]) => ({
            label: label as string,
            executable: '/pilot/runtime-bin/claude',
            argv: argv as string[],
            cwd: '/pilot/consumer',
            stdin: null,
            timeout_ms: NativeClaudeRawConfiguration.commandMs,
            output_bytes: NativeClaudeRawConfiguration.outputBytes,
        }));
    }
}
