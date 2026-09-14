#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRepository } from './application/validate-repository.mjs';
import { validateOfficial } from './application/validate-official.mjs';
import { renderRepositorySessionIndex, unavailableSessionIndex } from './application/render-session-index.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24+ is required.');
  if (process.argv.length !== 3) throw new Error('Usage: node src/cli.mjs validate|ci-official|session-index');
  switch (process.argv[2]) {
    case 'validate':
      console.log(JSON.stringify(validateRepository(repository)));
      console.log('Collection checks passed; official CI validation and behavioral evaluation remain separate.');
      break;
    case 'ci-official': {
      const results = validateOfficial(repository);
      for (const result of results) {
        console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}`);
        if (!result.passed && result.diagnostic) console.error(result.diagnostic);
      }
      process.exitCode = results.every((result) => result.passed) ? 0 : 1;
      break;
    }
    case 'session-index':
      try {
        process.stdout.write(renderRepositorySessionIndex(repository));
      } catch {
        process.stdout.write(unavailableSessionIndex());
      }
      break;
    default:
      throw new Error('Usage: node src/cli.mjs validate|ci-official|session-index');
  }
} catch (error) {
  console.error(`Validation failed: ${error.message}`);
  process.exitCode = 1;
}
