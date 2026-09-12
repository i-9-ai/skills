#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Run the official validator against each canonical package, without a shell.
import { lstatSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const slug = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** The repository structural check must run first on the same stable checkout. */
export function validateSkills(root = repository, execute = spawnSync) {
  const container = join(root, '.agents', 'skills');
  for (const directory of [join(root, '.agents'), container]) {
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error('Canonical skill directories must be real directories.');
    }
  }
  const packages = readdirSync(container, { withFileTypes: true })
    .filter((entry) => {
      if (entry.isSymbolicLink()) throw new Error('Canonical packages must not be symlinks.');
      return entry.isDirectory();
    })
    .map((entry) => entry.name).sort();
  if (!packages.length) throw new Error('No canonical skills were found.');
  const results = [];
  for (const name of packages) {
    if (!slug.test(name) || name.length > 64) throw new Error('Invalid skill directory name.');
    const skill = join(container, name);
    const entrypoint = lstatSync(join(skill, 'SKILL.md'));
    if (!entrypoint.isFile() || entrypoint.isSymbolicLink()) {
      throw new Error('A skill entrypoint must be a regular file.');
    }
    const result = execute('skills-ref', ['validate', skill], {
      cwd: root,
      shell: false,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1_048_576,
    });
    results.push({ name, passed: !result.error && result.status === 0,
      diagnostic: result.error ? 'Official validator unavailable or execution failed.'
        : `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() });
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: node scripts/validate_skills.mjs');
    const results = validateSkills();
    for (const result of results) {
      console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}`);
      if (!result.passed && result.diagnostic) console.error(result.diagnostic);
    }
    process.exitCode = results.every((result) => result.passed) ? 0 : 1;
  } catch (error) {
    console.error(`Official skill validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
