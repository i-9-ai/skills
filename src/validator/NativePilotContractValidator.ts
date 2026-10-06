// SPDX-License-Identifier: Apache-2.0
import type {
    NativePilotContract,
    NativePilotSelection,
} from '../config/NativePilotConfiguration.ts';
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';

const sha = /^[0-9a-f]{64}$/;
const revision = /^[0-9a-f]{40}$/;
const version = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/;
const match = (expression: RegExp, value: unknown): value is string =>
    typeof value === 'string' && expression.exec(value)?.[0] === value;

export function closedObject(value: unknown, keys: readonly string[], label: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label}: expected an object.`);
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join('|') !== [...keys].sort().join('|')) {
        throw new Error(`${label}: missing or unknown fields.`);
    }
    return record;
}

export function relativePilotPath(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= 1024 &&
        !/[\\\x00-\x1f\x7f]/.test(value) &&
        !value.startsWith('/') &&
        value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
    );
}

/** Drafts may be inspected; unresolved execution identities never become defaults. */
export class NativePilotContractValidator {
    inspect(input: unknown): { status: 'resolved' | 'blocked'; missing: string[] } {
        const raw = closedObject(
            input,
            [
                'schema_version',
                'runtime_layout',
                'purpose',
                'hosts',
                'repetitions',
                'authority',
                'source_a',
                'source_b',
                'driver',
                'observer',
                'binaries',
                'witnesses',
                'mcp',
            ],
            'contract',
        );
        if (
            raw.schema_version !== 2 ||
            raw.purpose !== 'local-source-a-b-a' ||
            JSON.stringify(raw.hosts) !== '["codex","claude"]' ||
            raw.repetitions !== 2
        )
            throw new Error(
                'Only two fresh repetitions of the fixed Codex/Claude matrix are supported.',
            );

        const missing: string[] = [];
        const field = (label: string, value: unknown, valid: (item: unknown) => boolean) => {
            if (value === null) missing.push(label);
            else if (!valid(value)) throw new Error(`${label}: invalid resolved value.`);
        };
        field(
            'runtime_layout',
            raw.runtime_layout,
            (v) => v === NativePilotConfiguration.runtime_layout,
        );

        const identifier = (value: unknown) => match(/^[a-z0-9][a-z0-9._:/-]{0,199}$/, value);
        const platform = (value: unknown) => value === 'linux/arm64';
        const authority = closedObject(
            raw.authority,
            [
                'lane',
                'destination',
                'authorization_sha256',
                'retention_destination',
                'retention_authorization_sha256',
                'environment_sha256',
                'platform',
            ],
            'authority',
        );
        field(
            'authority.lane',
            authority.lane,
            (v) => v === 'private-ci-vm' || v === 'local-container',
        );
        for (const key of ['destination', 'retention_destination']) {
            field(`authority.${key}`, authority[key], identifier);
        }
        for (const key of [
            'authorization_sha256',
            'retention_authorization_sha256',
            'environment_sha256',
        ]) {
            field(`authority.${key}`, authority[key], (v) => match(sha, v));
        }
        field('authority.platform', authority.platform, platform);
        for (const key of ['source_a', 'source_b', 'driver', 'observer']) {
            const candidate = raw[key] as Record<string, unknown> | null;
            const executable = key === 'driver' || key === 'observer';
            const origin =
                executable && candidate && 'origin' in candidate ? candidate.origin : undefined;
            const privateTree = origin === 'reviewed-private-tree';
            if (origin !== undefined && origin !== 'git' && !privateTree)
                throw new Error(`${key}: unknown executable tree origin.`);
            const keys = [
                'revision',
                'tree_sha256',
                ...(key === 'observer' ? ['entrypoint'] : []),
                ...(origin === undefined ? [] : ['origin']),
                ...(privateTree ? ['review_path', 'review_sha256'] : []),
            ];
            const pin = closedObject(raw[key], keys, key);
            if (privateTree) {
                if (pin.revision !== null)
                    throw new Error(`${key}: reviewed private trees cannot claim a Git revision.`);
                field(`${key}.review_sha256`, pin.review_sha256, (v) => match(sha, v));
                field(
                    `${key}.review_path`,
                    pin.review_path,
                    (v) =>
                        typeof v === 'string' &&
                        v.startsWith('/') &&
                        v.length < 4096 &&
                        !/[\\\x00-\x1f\x7f]/.test(v) &&
                        !v.split('/').some((p) => p === '.' || p === '..'),
                );
            } else field(`${key}.revision`, pin.revision, (v) => match(revision, v));
            field(`${key}.tree_sha256`, pin.tree_sha256, (v) => match(sha, v));
            if (key === 'observer')
                field(
                    'observer.entrypoint',
                    pin.entrypoint,
                    (v) =>
                        relativePilotPath(v) &&
                        new RegExp(
                            `^${NativePilotConfiguration.runtime_directory}/transport/[A-Za-z]+Runner\\.${NativePilotConfiguration.runtime_extension}$`,
                        ).test(v),
                );
        }
        const binaries = closedObject(raw.binaries, ['node', 'codex', 'claude'], 'binaries');
        for (const key of ['node', 'codex', 'claude']) {
            const pin = closedObject(
                binaries[key],
                ['version', 'sha256', 'platform'],
                `binaries.${key}`,
            );
            field(
                `binaries.${key}.version`,
                pin.version,
                (v) => match(version, v) && (key !== 'node' || v.startsWith('24.')),
            );
            field(`binaries.${key}.sha256`, pin.sha256, (v) => match(sha, v));
            field(`binaries.${key}.platform`, pin.platform, platform);
            if (
                pin.platform !== null &&
                authority.platform !== null &&
                pin.platform !== authority.platform
            ) {
                throw new Error('Every binary must match the selected runner architecture.');
            }
        }
        if (raw.witnesses === null) missing.push('witnesses');
        else {
            if (
                !Array.isArray(raw.witnesses) ||
                raw.witnesses.length < 1 ||
                raw.witnesses.length > 128
            ) {
                throw new Error('One to 128 real changed witnesses are required.');
            }
            const paths = new Set();
            for (const item of raw.witnesses) {
                const witness = closedObject(item, ['path', 'a_sha256', 'b_sha256'], 'witness');
                if (
                    !relativePilotPath(witness.path) ||
                    !match(sha, witness.a_sha256) ||
                    !match(sha, witness.b_sha256) ||
                    witness.a_sha256 === witness.b_sha256 ||
                    paths.has(witness.path)
                ) {
                    throw new Error(
                        'Changed witnesses require unique confined paths and different complete hashes.',
                    );
                }
                paths.add(witness.path);
            }
            if (![...paths].some((value) => String(value).startsWith('.agents/skills/'))) {
                throw new Error('At least one changed skill or bundled resource is required.');
            }
        }
        const mcp = closedObject(raw.mcp, ['codex', 'claude'], 'mcp');
        for (const host of ['codex', 'claude']) {
            const mapping = closedObject(mcp[host], ['a', 'b'], `mcp.${host}`);
            for (const pin of ['a', 'b'])
                field(`mcp.${host}.${pin}`, mapping[pin], (v) =>
                    match(/^[a-z0-9][a-z0-9:._-]{0,99}$/, v),
                );
        }
        const a = raw.source_a as Record<string, unknown>;
        const b = raw.source_b as Record<string, unknown>;
        if (
            (a.revision !== null && a.revision === b.revision) ||
            (a.tree_sha256 !== null && a.tree_sha256 === b.tree_sha256)
        ) {
            throw new Error('A and B must identify distinct source revisions and bytes.');
        }
        return { status: missing.length ? 'blocked' : 'resolved', missing };
    }

    resolved(input: unknown): NativePilotContract {
        const assessment = this.inspect(input);
        if (assessment.missing.length)
            throw new Error(`Unresolved execution gates: ${assessment.missing.join(', ')}.`);
        return structuredClone(input) as NativePilotContract;
    }

    selection(input: unknown): NativePilotSelection {
        const value = closedObject(input, ['run_id', 'host', 'repetition'], 'selection');
        if (
            !match(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
                value.run_id,
            ) ||
            !['codex', 'claude'].includes(String(value.host)) ||
            ![1, 2].includes(Number(value.repetition)) ||
            typeof value.repetition !== 'number'
        )
            throw new Error('Invalid run identity, host or repetition.');
        return value as unknown as NativePilotSelection;
    }
}
