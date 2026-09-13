// SPDX-License-Identifier: Apache-2.0
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSessionIndex } from '../domain/session-index-policy.mjs';

const MAX_CATALOG_BYTES = 1_048_576;

function readCatalog(root) {
  const filename = join(root, 'catalog.json');
  const info = lstatSync(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_CATALOG_BYTES) {
    throw new Error('catalog is not a bounded regular file');
  }
  return JSON.parse(readFileSync(filename, 'utf8'));
}

export function renderRepositorySessionIndex(root) {
  return renderSessionIndex(readCatalog(root));
}

export function unavailableSessionIndex() {
  return 'Skill index unavailable. Consult `catalog.json` to shortlist packages, then read the selected `SKILL.md`.\n';
}
