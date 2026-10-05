// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

export const BUNDLED_BWRAP_DIAGNOSTIC =
    'Codex could not find bubblewrap on PATH. Install bubblewrap with your OS package manager. ' +
    'See the sandbox prerequisites: https://developers.openai.com/codex/concepts/sandboxing#prerequisites. ' +
    'Codex will use the bundled bubblewrap in the meantime.';

/** Qualifies one exact retained/pinned startup notice; never asserts that a sandbox was used. */
export class NativeCodexDiagnosticValidator {
    private pending = Buffer.alloc(0);
    private readonly notices: Array<{
        code: string;
        sha256: string;
        bytes: number;
    }> = [];

    push(bytes: Uint8Array): void {
        if (!(bytes instanceof Uint8Array) || this.pending.length + bytes.length > 4096)
            throw new Error('native_diagnostic_bound');
        this.pending = Buffer.concat([this.pending, Buffer.from(bytes)]);
        for (;;) {
            const end = this.pending.indexOf(10);
            if (end < 0) return;
            const line = this.pending.subarray(0, end + 1);
            this.pending = this.pending.subarray(end + 1);
            const text = new TextDecoder('utf-8', { fatal: true }).decode(line);
            const prefix =
                /^\x1b\[2m\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\x1b\[0m \x1b\[31mERROR\x1b\[0m \x1b\[2mcodex_app_server\x1b\[0m\x1b\[2m:\x1b\[0m /;
            const message = text.replace(prefix, '');
            if (
                message === text ||
                message !== BUNDLED_BWRAP_DIAGNOSTIC + '\n' ||
                this.notices.length !== 0
            )
                throw new Error('native_diagnostic');
            this.notices.push({
                code: 'bundled-bubblewrap-fallback-reported',
                sha256: createHash('sha256').update(line).digest('hex'),
                bytes: line.length,
            });
        }
    }

    finish(): void {
        if (this.pending.length) throw new Error('native_diagnostic_truncated');
    }

    observed(): readonly { code: string; sha256: string; bytes: number }[] {
        return this.notices.map((notice) => ({ ...notice }));
    }

    configWarning(value: unknown): void {
        const warning = value as Record<string, unknown> | null;
        if (
            !warning ||
            typeof warning !== 'object' ||
            Array.isArray(warning) ||
            Object.keys(warning).some(
                (key) => !['details', 'path', 'range', 'summary'].includes(key),
            ) ||
            warning.summary !== BUNDLED_BWRAP_DIAGNOSTIC ||
            ['details', 'path', 'range'].some(
                (key) => Object.hasOwn(warning, key) && warning[key] !== null,
            )
        )
            throw new Error('native_config_warning');
    }
}
