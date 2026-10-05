// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { NativeCodexSchemaRepository } from '../../../src/repository/NativeCodexSchemaRepository.ts';
import { NativeCodexProtocolValidator } from '../../../src/validator/NativeCodexProtocolValidator.ts';
import { CodexJsonlCodec } from '../../../src/transport/CodexJsonlCodec.ts';
const root = fileURLToPath(new URL('../../../assets/native-pilot/codex/', import.meta.url));
const validator = new NativeCodexProtocolValidator(
    new NativeCodexSchemaRepository(join(root, 'schemas')),
);
const frame = () => ({
    method: 'account/rateLimits/updated',
    params: {
        rateLimits: {
            limitId: 'codex',
            limitName: null,
            normalModelSlug: null,
            primary: null,
            secondary: null,
            credits: null,
            individualLimit: null,
            spendControlReached: null,
            planType: null,
            rateLimitReachedType: null,
        },
    },
    emittedAtMs: 1,
});
test('the selected passive notification validates its exact pinned schema without adding any RPC', () => {
    const value = CodexJsonlCodec.json(Buffer.from(JSON.stringify(frame())));
    validator.notification(value.method, value.params);
    assert.throws(() => validator.request('account/rateLimits/updated', value.params));
});
test('unknown methods, fields, missing payload and invalid rate-limit values remain rejected', () => {
    assert.throws(
        () => validator.notification('account/rateLimits/unknown', frame().params),
        /unexpected_notification/,
    );
    const extra = frame().params;
    extra.ignoreDiagnostic = true;
    assert.throws(() => validator.notification(frame().method, extra), /schema_mismatch/);
    assert.throws(() => validator.notification(frame().method, {}), /schema_mismatch/);
    const invalid = frame().params;
    invalid.rateLimits.primary = 'ignored';
    assert.throws(() => validator.notification(frame().method, invalid), /schema_mismatch/);
});
