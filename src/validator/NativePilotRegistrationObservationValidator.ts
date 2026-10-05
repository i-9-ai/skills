// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { NativePilotHost } from '../config/NativePilotConfiguration.ts';
import type { NativePilotProcess } from '../repository/NativePilotProcessRepository.ts';

export interface NativePilotRegistrationRecord {
    label: string;
    executable: string;
    argv: string[];
    process: NativePilotProcess;
    pid: number | null;
    start_ticks: string | null;
    stdout: Buffer;
    stderr: Buffer;
}

const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('registration_object');
    return value as Record<string, unknown>;
};
const exact = (value: Record<string, unknown>, keys: string[]) =>
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys.slice().sort());
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const utf8 = (bytes: Buffer) => {
    if (!Buffer.isBuffer(bytes) || bytes.length > 1_048_576 || bytes.includes(0))
        throw new Error('registration_output_bound');
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
};

/** Pure codecs for the declared fresh-profile CLI recipes; unknown output never means absence. */
export class NativePilotRegistrationObservationValidator {
    /** Linux stat is retained as bytes; this parser is shared by collector and trusted projector. */
    childStat(bytes: Buffer, pid: number): { pid: number; start_ticks: string } | null {
        try {
            if (!Number.isSafeInteger(pid) || pid < 2 || bytes.length > 4096) return null;
            const text = utf8(bytes);
            const open = text.indexOf('(');
            const close = text.lastIndexOf(')');
            const fields = text
                .slice(close + 2)
                .trim()
                .split(/\s+/);
            if (
                open < 2 ||
                close <= open ||
                text.slice(0, open) !== `${pid} ` ||
                text.slice(close, close + 2) !== ') ' ||
                close - open > 129 ||
                fields.length < 20 ||
                fields.length > 100 ||
                !/^[RSDTtKWPIN]$/.test(fields[0]) ||
                fields.slice(1).some((field) => !/^-?\d{1,20}$/.test(field)) ||
                !/^[1-9]\d{0,19}$/.test(fields[19])
            )
                return null;
            return { pid, start_ticks: fields[19] };
        } catch {
            return null;
        }
    }

    /** Call only after the projector verifies the exact retained identity file bytes. */
    childIdentity(value: unknown, executable: string): { pid: number; start_ticks: string } | null {
        try {
            const identity = object(value);
            if (
                !exact(identity, [
                    'schema_version',
                    'status',
                    'pid',
                    'start_ticks',
                    'executable',
                    'stat',
                ]) ||
                identity.schema_version !== 1 ||
                identity.status !== 'observed' ||
                identity.executable !== executable ||
                !['node', 'codex', 'claude'].some(
                    (name) => executable === `/pilot/runtime-bin/${name}`,
                )
            )
                return null;
            const stat = object(identity.stat);
            if (!exact(stat, ['bytes', 'sha256', 'base64']) || typeof stat.base64 !== 'string')
                return null;
            const bytes = Buffer.from(stat.base64, 'base64');
            if (
                bytes.toString('base64') !== stat.base64 ||
                bytes.length !== stat.bytes ||
                digest(bytes) !== stat.sha256
            )
                return null;
            const actual = this.childStat(bytes, identity.pid as number);
            return actual?.start_ticks === identity.start_ticks ? actual : null;
        } catch {
            return null;
        }
    }

    validate(host: NativePilotHost, phase: string, records: NativePilotRegistrationRecord[]) {
        const result = {
            unauthenticated: false,
            owned_plugin_and_marketplace_absent: false,
            owned_hooks_and_mcp_absent: false,
            fresh_native_process: false,
            reason: 'registration-records-unrecognized',
        };
        try {
            if (
                !['codex', 'claude'].includes(host) ||
                !['baseline', 'verify-absent'].includes(phase) ||
                !Array.isArray(records) ||
                records.length !== 3
            )
                return result;
            const recipes = [
                ['native-auth-status', host === 'codex' ? ['login', 'status'] : ['auth', 'status']],
                [
                    'native-plugin-list',
                    host === 'codex'
                        ? ['plugin', 'list', '--marketplace', 'i9-skills', '--json']
                        : ['plugin', 'list', '--json'],
                ],
                ['native-marketplace-list', ['plugin', 'marketplace', 'list', '--json']],
            ];
            for (const [index, record] of records.entries()) {
                if (
                    record.label !== recipes[index][0] ||
                    record.executable !== `/pilot/runtime-bin/${host}` ||
                    JSON.stringify(record.argv) !== JSON.stringify(recipes[index][1])
                )
                    return result;
                if (
                    !Buffer.isBuffer(record.stdout) ||
                    !Buffer.isBuffer(record.stderr) ||
                    record.stdout.length + record.stderr.length > 1_048_576
                )
                    return result;
            }
            const identities = records.map((record) =>
                Number.isSafeInteger(record.pid) &&
                record.pid! >= 2 &&
                /^[1-9]\d{0,19}$/.test(record.start_ticks ?? '')
                    ? `${record.pid}:${record.start_ticks}`
                    : null,
            );
            result.fresh_native_process =
                identities.every((id) => id !== null) &&
                new Set(identities).size === records.length;
            const completed = (record: NativePilotRegistrationRecord, exit: number) =>
                record.process?.status === 'completed' &&
                record.process.exit_code === exit &&
                record.process.signal === null;
            const [auth, plugin, marketplace] = records;
            if (completed(auth, 1)) {
                if (host === 'codex') {
                    result.unauthenticated =
                        auth.stdout.length === 0 && utf8(auth.stderr) === 'Not logged in\n';
                } else if (auth.stderr.length === 0) {
                    const status = object(JSON.parse(utf8(auth.stdout)));
                    // Only these documented fields assert absence; optional account metadata stays raw.
                    result.unauthenticated =
                        status.loggedIn === false &&
                        status.authMethod === 'none' &&
                        status.configDirectory === join('/', 'home', 'node', '.claude');
                }
            }
            if (!result.unauthenticated) {
                result.reason = 'native-authentication-unrecognized';
                return result;
            }
            if (
                !completed(plugin, 0) ||
                !completed(marketplace, 0) ||
                plugin.stderr.length !== 0 ||
                marketplace.stderr.length !== 0
            ) {
                result.reason = 'native-registration-process-or-diagnostic-unrecognized';
                return result;
            }
            const plugins = JSON.parse(utf8(plugin.stdout));
            const marketplaces = JSON.parse(utf8(marketplace.stdout));
            // The selected fixture has no unrelated installations or marketplaces. Nonempty
            // registries are retained and blocked, rather than interpreted by a guessed codec.
            if (host === 'codex') {
                const p = object(plugins);
                const m = object(marketplaces);
                result.owned_plugin_and_marketplace_absent =
                    exact(p, ['installed', 'available']) &&
                    exact(m, ['marketplaces']) &&
                    Array.isArray(p.installed) &&
                    p.installed.length === 0 &&
                    Array.isArray(p.available) &&
                    p.available.length === 0 &&
                    Array.isArray(m.marketplaces) &&
                    m.marketplaces.length === 0;
            } else {
                result.owned_plugin_and_marketplace_absent =
                    Array.isArray(plugins) &&
                    plugins.length === 0 &&
                    Array.isArray(marketplaces) &&
                    marketplaces.length === 0;
            }
            result.reason = !result.owned_plugin_and_marketplace_absent
                ? 'native-registration-absence-unrecognized'
                : !result.fresh_native_process
                  ? 'native-child-identity-unavailable'
                  : 'registration-observed-hooks-and-mcp-require-native-inventory';
            return result;
        } catch {
            result.reason = 'native-registration-output-unrecognized';
            return result;
        }
    }
}
