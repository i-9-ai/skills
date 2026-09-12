#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Install the single repository requirements declaration in a precreated venv.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const marker = '# BEGIN OFFICIAL VALIDATOR SOURCE';

export function installValidation(root = repository, execute = spawnSync) {
  const sections = readFileSync(join(root, 'requirements.txt'), 'utf8').split(marker);
  if (sections.length !== 2 || sections.some((section) => !section.trim())) {
    throw new Error('requirements.txt must declare dependencies and one official source section.');
  }
  const python = join(root, '.work', 'validation-env', 'bin', 'python');
  const run = (args) => {
    const result = execute(python, args, {
      cwd: root, shell: false, stdio: 'inherit', timeout: 120_000,
    });
    if (result.error || result.status !== 0) {
      throw new Error('Validation environment setup failed; later installation phases were not run.');
    }
  };
  run(['-c', 'import sys; sys.exit(0 if sys.prefix != sys.base_prefix and sys.version_info >= (3, 11) else 1)']);
  const temporary = mkdtempSync(join(tmpdir(), 'i9-validation-install-'));
  try {
    const phases = [
      { content: sections[0], flags: ['--only-binary=:all:'] },
      { content: sections[1], flags: ['--no-deps', '--no-build-isolation'] },
    ];
    for (const [index, phase] of phases.entries()) {
      const requirement = join(temporary, `phase-${index}.txt`);
      writeFileSync(requirement, phase.content, { flag: 'wx', mode: 0o600 });
      run(['-m', 'pip', '--isolated', 'install', '--require-hashes', ...phase.flags, '-r', requirement]);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: node scripts/install_validation.mjs');
    installValidation();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
