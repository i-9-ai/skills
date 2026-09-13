// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSessionIndex } from '../domain/session-index-policy.mjs';

export function renderRepositorySessionIndex(root) {
  const catalog = JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8'));
  return renderSessionIndex(catalog);
}

export function unavailableSessionIndex() {
  return 'Skill index unavailable. Consult `catalog.json` to shortlist packages, then read the selected `SKILL.md`.\n';
}
