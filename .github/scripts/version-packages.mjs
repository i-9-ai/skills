// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const options = { cwd: root, stdio: 'inherit' };

execFileSync(process.execPath, [require.resolve('@changesets/cli/bin.js'), 'version'], options);
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
