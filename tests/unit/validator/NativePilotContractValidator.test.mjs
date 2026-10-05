import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { NativePilotContractValidator } from '../../../src/validator/NativePilotContractValidator.ts';
import { fixture } from '../../helpers/NativePilotFixture.mjs';

test('the unselected template reports concrete blockers and cannot resolve to execution', () => {
    const input = JSON.parse(
        readFileSync(new URL('../../fixtures/native-pilot/pilot.template.json', import.meta.url)),
    );
    const validator = new NativePilotContractValidator();
    const result = validator.inspect(input);
    assert.equal(result.status, 'blocked');
    for (const required of [
        'source_a.revision',
        'source_b.tree_sha256',
        'binaries.node.sha256',
        'binaries.codex.sha256',
        'binaries.claude.sha256',
        'driver.revision',
        'observer.entrypoint',
        'authority.authorization_sha256',
        'authority.retention_destination',
        'witnesses',
    ]) {
        assert.ok(result.missing.includes(required), required);
    }
    assert.throws(() => validator.resolved(input), /Unresolved execution gates/);
});

test('closed input rejects added commands, promoted scope, weak pins and wrong binary architecture', (t) => {
    const { contract } = fixture(t);
    const validator = new NativePilotContractValidator();
    assert.equal(validator.inspect(contract).status, 'resolved');
    for (const mutate of [
        (value) => {
            value.command = 'arbitrary';
        },
        (value) => {
            value.purpose = 'hosted-upgrade';
        },
        (value) => {
            value.repetitions = 1;
        },
        (value) => {
            value.hosts.push('copilot');
        },
        (value) => {
            value.source_b.revision = 'main';
        },
        (value) => {
            value.driver.tree_sha256 += '\n';
        },
        (value) => {
            value.binaries.node.version = '26.10.0';
        },
        (value) => {
            value.binaries.claude.platform = 'linux/amd64';
        },
        (value) => {
            value.observer.entrypoint = '../outside.ts';
        },
    ]) {
        const value = structuredClone(contract);
        mutate(value);
        assert.throws(() => validator.resolved(value));
    }
});

test('A/B require different bytes and a real changed skill/resource witness', (t) => {
    const { contract } = fixture(t);
    const validator = new NativePilotContractValidator();
    for (const mutate of [
        (value) => {
            value.source_b.revision = value.source_a.revision;
        },
        (value) => {
            value.source_b.tree_sha256 = value.source_a.tree_sha256;
        },
        (value) => {
            value.witnesses[0].b_sha256 = value.witnesses[0].a_sha256;
        },
        (value) => {
            value.witnesses[0].path = 'src/service/RuntimeService.ts';
        },
        (value) => {
            value.witnesses.push(structuredClone(value.witnesses[0]));
        },
    ]) {
        const value = structuredClone(contract);
        mutate(value);
        assert.throws(() => validator.resolved(value));
    }
});
