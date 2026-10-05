// SPDX-License-Identifier: Apache-2.0
import { posix } from 'node:path';
export type NativePilotHost = 'codex' | 'claude';
export type NativePilotPin = 'a' | 'b' | 'restored-a';
export type NativePilotMode = 'synthetic' | 'native';

export interface NativePilotTreePin {
    revision: string;
    tree_sha256: string;
}

export type NativePilotExecutableTreePin =
    | NativePilotTreePin
    | (NativePilotTreePin & { origin: 'git' })
    | {
          origin: 'reviewed-private-tree';
          revision: null;
          tree_sha256: string;
          review_path: string;
          review_sha256: string;
      };

export interface NativePilotBinaryPin {
    version: string;
    sha256: string;
    platform: 'linux/arm64' | 'linux/amd64';
}

export interface NativePilotContract {
    schema_version: 2;
    runtime_layout: 'source-ts' | 'compiled-js';
    purpose: 'local-source-a-b-a';
    hosts: ['codex', 'claude'];
    repetitions: 2;
    authority: {
        lane: 'private-ci-vm' | 'local-container';
        destination: string;
        authorization_sha256: string;
        retention_destination: string;
        retention_authorization_sha256: string;
        environment_sha256: string;
        platform: 'linux/arm64' | 'linux/amd64';
    };
    source_a: NativePilotTreePin;
    source_b: NativePilotTreePin;
    driver: NativePilotExecutableTreePin;
    observer: NativePilotExecutableTreePin & { entrypoint: string };
    binaries: Record<'node' | NativePilotHost, NativePilotBinaryPin>;
    witnesses: Array<{ path: string; a_sha256: string; b_sha256: string }>;
    mcp: Record<NativePilotHost, { a: string; b: string }>;
}

export interface NativePilotInputs {
    source_a: string;
    source_b: string;
    driver: string;
    observer: string;
    node: string;
    codex: string;
    claude: string;
}

export interface NativePilotSelection {
    run_id: string;
    host: NativePilotHost;
    repetition: 1 | 2;
}

export interface NativePilotStep {
    id: string;
    pin: NativePilotPin | null;
    operation: 'native' | 'observe' | 'switch';
    commands: Array<{ executable: string; args: string[]; timeout_ms: number }>;
    checks: string[];
}

/** Fixed scope and bounds, not caller-editable command templates. */
export class NativePilotConfiguration {
    /** Fixed ordinary image account; this never selects or redirects a host profile. */
    static readonly accountHome = posix.join('/', 'home', 'node');
    static readonly runtime_layout = import.meta.url.endsWith('.ts') ? 'source-ts' : 'compiled-js';
    static readonly runtime_directory =
        NativePilotConfiguration.runtime_layout === 'source-ts' ? 'src' : 'dist';
    static readonly runtime_extension =
        NativePilotConfiguration.runtime_layout === 'source-ts' ? 'ts' : 'js';
    static entrypoint(
        name: 'NativePilotContainerWorkerRunner' | 'NativePilotCommonObserverRunner',
    ) {
        return `${this.runtime_directory}/transport/${name}.${this.runtime_extension}`;
    }
    static readonly phases = Object.freeze([
        'preflight',
        'baseline',
        'install-a',
        'observe-a',
        'stop-a',
        'select-b',
        'update-b',
        'observe-b',
        'stop-b',
        'select-a',
        'rollback-a',
        'observe-restored-a',
        'stop-restored-a',
        'uninstall',
        'verify-preserved',
        'remove-marketplace',
        'verify-absent',
        'cleanup-processes',
        'retain',
        'cleanup-owned',
    ]);
    static readonly limits = Object.freeze({
        job_ms: 1_800_000,
        command_ms: 90_000,
        observe_ms: 45_000,
        cleanup_ms: 30_000,
        output_bytes: 1_048_576,
        tree_files: 10_000,
        tree_bytes: 536_870_912,
        file_bytes: 33_554_432,
        binary_bytes: 536_870_912,
    });

    /** Nested observation reserves fit within observe_ms; none extend the container deadline. */
    static readonly observation = Object.freeze({
        ordinary_child_ms: 12_000,
        native_lifetime_ms: 40_000,
        selected_setup_ms: 1_000,
        selected_drain_ms: 500,
        selected_report_ms: 500,
        child_rescue_ms: 1_000,
        phase_finish_ms: 1_000,
    });

    static observationBudget(label: string, elapsedMs: number) {
        const selected = ['selected-native-observer', 'selected-native-absence-observer'].includes(
            label,
        );
        const reserves = this.observation;
        const minimum = selected
            ? reserves.native_lifetime_ms +
              reserves.selected_setup_ms +
              reserves.selected_drain_ms +
              reserves.selected_report_ms
            : 1;
        const available =
            Number.isFinite(elapsedMs) && elapsedMs >= 0
                ? Math.max(
                      0,
                      Math.floor(this.limits.observe_ms - elapsedMs) -
                          reserves.child_rescue_ms -
                          reserves.phase_finish_ms,
                  )
                : 0;
        return {
            phase_limit_ms: this.limits.observe_ms,
            elapsed_ms: Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : null,
            selected,
            minimum_child_ms: minimum,
            timeout_ms:
                available < minimum
                    ? 0
                    : selected
                      ? available
                      : Math.min(available, reserves.ordinary_child_ms),
            child_rescue_ms: reserves.child_rescue_ms,
            phase_finish_ms: reserves.phase_finish_ms,
        };
    }

    static readonly unclaimed = Object.freeze([
        'real-model-or-provider',
        'native-read-tool-telemetry',
        'hosted-git-update',
        'semantic-version-cache-upgrade',
        'interactive-trust-ui',
        'claude-native-mcp-tool-call',
        'official-skill-conformance',
        'independent-native-acceptance',
        'publication',
    ]);
}
