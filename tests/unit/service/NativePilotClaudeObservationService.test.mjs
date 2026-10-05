// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { posix } from 'node:path';
import { fixture } from '../../helpers/NativeClaudeObservationFixture.mjs';
import { NativePilotClaudeObservationService } from '../../../src/service/NativePilotClaudeObservationService.ts';
import { NativeClaudeObservationValidator } from '../../../src/validator/NativeClaudeObservationValidator.ts';
import { NativePilotNpmEnvironmentRepository } from '../../../src/repository/NativePilotNpmEnvironmentRepository.ts';

function selected(phase = 'observe-a') {
    const f = fixture(phase);
    const environment = [
        'HOME=' + posix.join('/', 'home', 'node'),
        'PATH=/pilot/runtime-bin:/usr/bin:/bin',
        'LANG=C.UTF-8',
        'HOSTNAME=synthetic',
        'NODE_VERSION=24.21.0',
        'YARN_VERSION=1.22.22',
    ];
    const context = {
        schema_version: 1,
        mode: 'native',
        contract: f.contract,
        nonce: 'a'.repeat(32),
        selection: f.selection,
        account: { name: 'node', uid: 1000, gid: 1000, home: posix.join('/', 'home', 'node') },
        environment: [
            ...environment,
            ...Object.entries(NativePilotNpmEnvironmentRepository.additions).map(
                ([key, value]) => `${key}=${value}`,
            ),
        ].sort(),
        platform: 'linux/arm64',
        observer_pid: 42,
        observer_start_ticks: '999',
        no_new_privileges: '1',
        seccomp: '2',
        capabilities: {
            CapEff: '0000000000000000',
            CapPrm: '0000000000000000',
            CapBnd: '0000000000000000',
        },
        routes: [],
        inputs: { source: f.contract.source_a.tree_sha256 },
        evidence_scope: 'context-measurement-only',
    };
    const report = {
        schema_version: 2,
        selection: f.selection,
        mode: 'native',
        status: 'captured',
        reason: 'retained',
        native_acceptance: false,
        diagnostic_status: f.diagnostic ? 'retained' : 'not-run',
        init_attempted: !!f.diagnostic,
        processes: f.records.map((record) => {
            const { stdout, stderr, ...p } = record.process;
            return { label: record.command.label, ...p };
        }),
        semantic_checks: new NativeClaudeObservationValidator().project(f),
        mcp_state: {},
        lifecycle_checks: 'not-run',
        unmeasured: [],
    };
    return {
        ...f,
        source: f.before?.selected_inventory,
        context,
        report,
        observer_start_ticks: '999',
        expected_nonce: context.nonce,
        expected_inputs: { ...context.inputs },
        expected_environment: environment,
    };
}

test('pure host binding rederives supported Claude facts from exact commands, raw identity and selected manifests', () => {
    const f = selected();
    const result = new NativePilotClaudeObservationService().validate(f);
    assert.equal(result.status, 'observed');
    assert.equal(result.native_acceptance, false);
    assert.ok(result.checks.mcp_initial_health && result.checks.session_start_output);
});

test('collector booleans, detached process metadata, wrong outer identity and changed confinement cannot establish facts', () => {
    for (const change of [
        (f) => (f.report.semantic_checks.checks.session_start_output = false),
        (f) => f.report.processes[0].pid++,
        (f) => (f.observer_pid = 99),
        (f) => (f.context.observer_start_ticks = '1000'),
        (f) => (f.context.inputs.source = 'b'.repeat(64)),
        (f) => (f.context.account.uid = 0),
        (f) => f.context.routes.push('external'),
        (f) => f.context.environment.push('NPM_CONFIG_REGISTRY=https://example.invalid'),
        (f) =>
            (f.context.environment = f.context.environment.filter(
                (value) => !value.startsWith('NPM_CONFIG_OFFLINE='),
            )),
        (f) => (f.after.actual_inventory.entries[0].sha256 = 'b'.repeat(64)),
        (f) => (f.records[0].command.argv = ['-p', 'synthetic']),
    ]) {
        const f = selected();
        change(f);
        assert.throws(() => new NativePilotClaudeObservationService().validate(f));
    }
});

test('no-init Claude recipe preserves the unsupported native hook/MCP absence limit', () => {
    const f = selected('verify-absent');
    const result = new NativePilotClaudeObservationService().validate(f);
    assert.equal(result.status, 'partial');
    assert.equal(result.checks.owned_plugin_and_marketplace_absent, true);
    assert.equal(result.checks.owned_hooks_and_mcp_absent, false);
    assert.equal(f.report.init_attempted, false);
});
