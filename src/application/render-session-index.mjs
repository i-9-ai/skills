// SPDX-License-Identifier: Apache-2.0
import { closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { strictJson } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';
import { renderSessionIndex } from '../domain/session-index-policy.mjs';

const MAX_CATALOG_BYTES = 1_048_576;

function readCatalog(root) {
  const filename = join(root, 'skills-catalog.json');
  const before = lstatSync(filename);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_CATALOG_BYTES) {
    throw new Error('catalog is not a bounded regular file');
  }
  let descriptor;
  try {
    descriptor = openSync(filename, 'r');
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs || opened.ctimeMs !== before.ctimeMs) {
      throw new Error('catalog changed before reading');
    }
    const bytes = Buffer.alloc(MAX_CATALOG_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = readSync(descriptor, bytes, length, bytes.length - length, length);
      if (read === 0) break;
      length += read;
    }
    if (length > MAX_CATALOG_BYTES) throw new Error('catalog exceeds the read limit');
    const after = lstatSync(filename);
    if (after.nlink !== 1 || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
      throw new Error('catalog changed during reading');
    }
    return strictJson(bytes.subarray(0, length));
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

export function renderRepositorySessionIndex(root) {
  return renderSessionIndex(readCatalog(root));
}

export function unavailableSessionIndex() {
  return 'Skill index unavailable. Consult `skills-catalog.json` to shortlist packages, then read the selected `SKILL.md`.\n';
}
