// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NativePilotContainerWorkerRepository } from '../../../src/repository/NativePilotContainerWorkerRepository.ts';
import { containerFixture } from '../../helpers/NativePilotContainerFixture.mjs';

test('worker launch receipt records actual executor child PID and the running worker PID', (t) => {
    const f = containerFixture(t);
    f.controller.files.stage();
    for (const pid of [60123, 0, undefined, NaN]) {
        const worker = new NativePilotContainerWorkerRepository(f.controller.files.request, () => ({
            pid,
            status: 0,
            signal: null,
            stdout: 'inert',
            stderr: '',
        }));
        worker.context = () => ({});
        worker.nativeEnvironment = () => ({ environment: undefined, evidence: null });
        worker.command = () => ({
            executable: '/pilot/runtime-bin/node',
            args: ['fixed-owned-entry.js'],
            timeout_ms: 45000,
        });
        const result = worker.execute('observe-a', 0);
        assert.deepEqual(result.process_identity, {
            schema_version: 1,
            worker_pid: process.pid,
            child_pid: pid === 60123 ? pid : null,
            executable: '/pilot/runtime-bin/node',
        });
    }
});
