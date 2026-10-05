// SPDX-License-Identifier: Apache-2.0
/** Retains cleanup diagnostics without replacing the primary observation failure. */
export class NativeCodexObservationError extends Error {
    readonly cleanup_failure: string;

    constructor(primary: unknown, cleanup: unknown) {
        super(primary instanceof Error ? primary.message : 'observer_blocked');
        this.cleanup_failure = NativeCodexObservationError.reason(cleanup);
    }

    private static reason(value: unknown): string {
        if (value instanceof Error && /^[a-z][a-z0-9_:-]{0,160}$/.test(value.message)) {
            return value.message;
        }

        return 'observer_blocked';
    }
}
