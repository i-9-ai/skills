// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

export interface NativeClaudeStatReceipt {
    bytes: number;
    sha256: string;
    base64: string;
}

export interface NativeClaudeChildIdentity {
    schema_version: 2;
    status: 'observed' | 'unavailable' | 'invalid';
    pid: number | null;
    observer_pid: number;
    start_ticks: string | null;
    executable: string | null;
    stat_before: NativeClaudeStatReceipt | null;
    stat_after: NativeClaudeStatReceipt | null;
}

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('claude_child_identity_object');
    return value as Record<string, unknown>;
};
const exact = (value: Record<string, unknown>, keys: string[]) =>
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys.slice().sort());

/** Pure dual-sample ownership proof. The expected parent comes from the measured outer process. */
export class NativeClaudeProcessIdentityValidator {
    static readonly executable = '/pilot/runtime-bin/claude';
    static readonly statBytes = 4096;

    receipt(bytes: Buffer): NativeClaudeStatReceipt {
        if (
            !Buffer.isBuffer(bytes) ||
            bytes.length < 1 ||
            bytes.length > NativeClaudeProcessIdentityValidator.statBytes
        )
            throw new Error('claude_child_stat_bound');
        return { bytes: bytes.length, sha256: digest(bytes), base64: bytes.toString('base64') };
    }

    private decode(value: unknown): Buffer {
        const receipt = record(value);
        if (
            !exact(receipt, ['bytes', 'sha256', 'base64']) ||
            !Number.isSafeInteger(receipt.bytes) ||
            Number(receipt.bytes) < 1 ||
            Number(receipt.bytes) > NativeClaudeProcessIdentityValidator.statBytes ||
            typeof receipt.sha256 !== 'string' ||
            !/^[a-f0-9]{64}$/.test(receipt.sha256) ||
            typeof receipt.base64 !== 'string' ||
            receipt.base64.length > 5464
        )
            throw new Error('claude_child_stat_receipt');
        const bytes = Buffer.from(receipt.base64, 'base64');
        if (
            bytes.toString('base64') !== receipt.base64 ||
            bytes.length !== receipt.bytes ||
            digest(bytes) !== receipt.sha256
        )
            throw new Error('claude_child_stat_integrity');
        return bytes;
    }

    private liveStat(bytes: Buffer, pid: number, observerPid: number) {
        if (bytes.includes(0)) throw new Error('claude_child_stat_nul');
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        const open = text.indexOf('(');
        const close = text.lastIndexOf(')');
        const fields = text
            .slice(close + 2)
            .trim()
            .split(/\s+/);
        if (
            open < 2 ||
            close <= open ||
            close - open > 129 ||
            text.slice(0, open) !== `${pid} ` ||
            text.slice(close, close + 2) !== ') ' ||
            fields.length < 20 ||
            fields.length > 100 ||
            !/^[RSDTtKWPIN]$/.test(fields[0]) ||
            fields.slice(1).some((field) => !/^-?\d{1,20}$/.test(field)) ||
            fields[1] !== String(observerPid) ||
            !/^[1-9]\d{0,19}$/.test(fields[19])
        )
            throw new Error('claude_child_stat_ownership');
        return fields[19];
    }

    validate(
        value: unknown,
        expectedObserverPid: number,
    ): { pid: number; observer_pid: number; start_ticks: string } | null {
        try {
            const identity = record(value);
            if (
                !exact(identity, [
                    'schema_version',
                    'status',
                    'pid',
                    'observer_pid',
                    'start_ticks',
                    'executable',
                    'stat_before',
                    'stat_after',
                ]) ||
                identity.schema_version !== 2 ||
                identity.status !== 'observed' ||
                !Number.isSafeInteger(expectedObserverPid) ||
                expectedObserverPid < 2 ||
                identity.observer_pid !== expectedObserverPid ||
                !Number.isSafeInteger(identity.pid) ||
                Number(identity.pid) < 2 ||
                identity.pid === expectedObserverPid ||
                identity.executable !== NativeClaudeProcessIdentityValidator.executable ||
                typeof identity.start_ticks !== 'string'
            )
                return null;
            const pid = identity.pid as number;
            const before = this.liveStat(
                this.decode(identity.stat_before),
                pid,
                expectedObserverPid,
            );
            const after = this.liveStat(this.decode(identity.stat_after), pid, expectedObserverPid);
            if (before !== after || identity.start_ticks !== before) return null;
            return { pid, observer_pid: expectedObserverPid, start_ticks: before };
        } catch {
            return null;
        }
    }

    /** Derive the assertion only after both retained samples satisfy the same rules as replay. */
    observed(identity: NativeClaudeChildIdentity): NativeClaudeChildIdentity {
        try {
            const ticks = this.liveStat(
                this.decode(identity.stat_before),
                identity.pid!,
                identity.observer_pid,
            );
            const candidate = { ...identity, status: 'observed' as const, start_ticks: ticks };
            if (this.validate(candidate, identity.observer_pid)) return candidate;
        } catch {
            // Invalid or incomplete samples remain retained but cannot establish an observation.
        }
        return { ...identity, status: 'invalid', start_ticks: null };
    }
}
