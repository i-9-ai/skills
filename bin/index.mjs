#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Keep this launcher free of command policy; Node 24 loads erasable TypeScript.
import { existsSync } from 'node:fs';
if (Number(process.versions.node.split('.')[0]) < 24) {
    console.error('Node.js 24+ is required.');
    process.exit(1);
}

const source = new URL('../src/index.ts', import.meta.url);
const entry = existsSync(source) ? source : new URL('../dist/index.js', import.meta.url);
const { runCli } = await import(entry.href);
await runCli();
