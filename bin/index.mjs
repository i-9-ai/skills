#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Keep this launcher free of command policy; Node 24 loads erasable TypeScript.
if (Number(process.versions.node.split('.')[0]) < 24) {
    console.error('Node.js 24+ is required.');
    process.exit(1);
}

const { runCli } = await import('../src/index.ts');
await runCli();
