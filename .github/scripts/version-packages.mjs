// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const options = { cwd: root, stdio: 'inherit' };
const changelogPath = join(root, 'CHANGELOG.md');
const previous = readFileSync(changelogPath, 'utf8');
const historyStart = previous.match(/^#{1,6}\s+\d+\.\d+/mu)?.index ?? previous.length;
const preamble = previous.slice(0, historyStart);
const history = previous.slice(historyStart);

execFileSync(process.execPath, [require.resolve('@changesets/cli/bin.js'), 'version'], options);

const generated = readFileSync(changelogPath, 'utf8');
if (!generated.startsWith(preamble) || !generated.endsWith(history)) {
    throw new Error('Changesets must preserve existing changelog bytes verbatim.');
}
// The generator indents blank continuation lines; normalize only the new entries.
const entries = generated.slice(preamble.length, generated.length - history.length);
writeFileSync(changelogPath, preamble + entries.replace(/^[\t ]+(?=\r?$)/gmu, '') + history);

execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts'], options);

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const file of [
    '.codex-plugin/plugin.json',
    '.claude-plugin/plugin.json',
    '.github/plugin/plugin.json',
]) {
    const path = join(root, file);
    const plugin = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ ...plugin, version }, null, 2) + '\n');
}
