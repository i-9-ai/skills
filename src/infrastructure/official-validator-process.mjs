// SPDX-License-Identifier: Apache-2.0
// Filesystem/process adapters for the external official tool used by CI.
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export function readOfficialConfiguration(root) {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).config?.officialSkillValidator;
}

export function installOfficialValidator(root, requirements, execute = spawnSync) {
  const python = join(root, '.work', 'validation-env', 'bin', 'python');
  const run = (args) => {
    const result = execute(python, args, {
      cwd: root, shell: false, stdio: 'inherit', timeout: 120_000,
    });
    if (result.error || result.status !== 0) {
      throw new Error('Official validator setup failed; later phases were not run.');
    }
  };
  run(['-I', '-c', 'import sys; sys.exit(0 if sys.prefix != sys.base_prefix and sys.version_info >= (3, 11) else 1)']);
  const temporary = mkdtempSync(join(tmpdir(), 'i9-validation-install-'));
  try {
    for (const [index, phase] of requirements.phases.entries()) {
      const requirement = join(temporary, `phase-${index}.txt`);
      writeFileSync(requirement, phase.content, { flag: 'wx', mode: 0o600 });
      run(['-I', '-m', 'pip', '--isolated', 'install', '--require-hashes', ...phase.flags, '-r', requirement]);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/** Run the stricter collection check first, on the same stable checkout. */
export function canonicalSkills(root) {
  const container = join(root, '.agents', 'skills');
  for (const directory of [join(root, '.agents'), container]) {
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error('Canonical skill directories must be real directories.');
    }
  }
  const packages = readdirSync(container, { withFileTypes: true }).filter((entry) => {
    if (entry.isSymbolicLink()) throw new Error('Canonical packages must not be symlinks.');
    return entry.isDirectory();
  }).map((entry) => entry.name).sort();
  if (!packages.length) throw new Error('No canonical skills were found.');
  for (const name of packages) {
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) || name.trim() !== name || name.length > 64) {
      throw new Error('Invalid skill directory name.');
    }
    const entrypoint = lstatSync(join(container, name, 'SKILL.md'));
    if (!entrypoint.isFile() || entrypoint.isSymbolicLink()) {
      throw new Error('A skill entrypoint must be a regular file.');
    }
  }
  return packages.map((name) => ({ name, path: join(container, name) }));
}

export function runOfficialValidator(root, packages, expectedVersion, execute = spawnSync) {
  const executable = join(root, '.work', 'validation-env', 'bin', 'skills-ref');
  const options = { cwd: root, shell: false, encoding: 'utf8', timeout: 30_000, maxBuffer: 1_048_576 };
  const identity = execute(executable, ['--version'], options);
  if (identity.error || identity.status !== 0
      || identity.stdout?.trim() !== `skills-ref, version ${expectedVersion}`) {
    throw new Error('Official validator unavailable or version does not match the reviewed source.');
  }
  return packages.map(({ name, path }) => {
    const result = execute(executable, ['validate', path], options);
    return { name, passed: !result.error && result.status === 0,
      diagnostic: result.error ? 'Official validation execution failed.'
        : `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
  });
}
