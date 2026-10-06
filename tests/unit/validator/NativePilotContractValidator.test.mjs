import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { NativePilotContractValidator } from '../../../src/validator/NativePilotContractValidator.ts';
import { NativePilotPreparationService } from '../../../src/service/NativePilotPreparationService.ts';
import { fixture } from '../../helpers/NativePilotFixture.mjs';

test('the unselected template reports concrete blockers and cannot resolve to execution', () => {
    const input = JSON.parse(
        readFileSync(new URL('../../fixtures/native-pilot/pilot.template.json', import.meta.url)),
    );
    const validator = new NativePilotContractValidator();
    const result = validator.inspect(input);
    assert.equal(result.status, 'blocked');
    for (const required of [
        'runtime_layout',
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

test('the bundled draft requires an explicit source layout and refuses mismatches before preparation', (t) => {
    const template = JSON.parse(
        readFileSync(new URL('../../../assets/native-pilot/pilot.template.json', import.meta.url)),
    );
    assert.deepEqual(
        template,
        JSON.parse(
            readFileSync(
                new URL('../../fixtures/native-pilot/pilot.template.json', import.meta.url),
            ),
        ),
    );
    const { contract: selection, inputs, root } = fixture(t);
    const fillUnresolved = (value, selected) => {
        if (value === null) return structuredClone(selected);
        if (typeof value !== 'object' || Array.isArray(value)) return value;

        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, fillUnresolved(item, selected[key])]),
        );
    };
    const contract = fillUnresolved(template, selection);
    const service = new NativePilotPreparationService();
    assert.ok(service.validator.inspect(template).missing.includes('runtime_layout'));
    assert.deepEqual(service.validator.resolved(contract), contract);
    let prepared = 0;
    service.repository.prepare = () => {
        prepared++;
    };

    for (const layout of [null, 'compiled-js', 'unknown']) {
        assert.throws(() => service.prepare({ ...contract, runtime_layout: layout }, inputs, root));
    }
    assert.throws(
        () =>
            service.prepare(
                {
                    ...contract,
                    observer: {
                        ...contract.observer,
                        entrypoint: 'dist/transport/NativePilotNativeObserverRunner.js',
                    },
                },
                inputs,
                root,
            ),
        /observer.entrypoint: invalid resolved value/,
    );
    assert.equal(prepared, 0);
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

test('a consistently pinned unsupported architecture is rejected before execution', (t) => {
    const { contract } = fixture(t);
    contract.authority.platform = 'linux/amd64';
    for (const binary of Object.values(contract.binaries)) {
        binary.platform = 'linux/amd64';
    }

    const validator = new NativePilotContractValidator();
    assert.throws(() => validator.inspect(contract), /authority\.platform: invalid resolved value/);
    assert.throws(
        () => validator.resolved(contract),
        /authority\.platform: invalid resolved value/,
    );
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
