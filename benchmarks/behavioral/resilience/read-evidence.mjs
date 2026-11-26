// SPDX-License-Identifier: Apache-2.0
import { readFileSync, writeFileSync } from 'node:fs';

const [filename, ...extra] = process.argv.slice(2);
if (extra.length || !['process-policy.md', 'consumers.json'].includes(filename)) {
    process.stderr.write('Usage: node inputs/read-evidence.mjs <process-policy.md|consumers.json>\n');
    process.exit(64);
}

try {
    // Exclusive creation gives each disposable workspace exactly one failed attempt.
    writeFileSync(new URL('../.read-evidence-attempted', import.meta.url), '', { flag: 'wx' });
    process.stderr.write('EVIDENCE_TEMPORARILY_UNAVAILABLE: read returned no bytes.\n');
    process.exit(75);
} catch (error) {
    if (error.code !== 'EEXIST') throw error;
}

process.stdout.write(readFileSync(new URL(filename, import.meta.url)));
