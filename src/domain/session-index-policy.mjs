// SPDX-License-Identifier: Apache-2.0

const ENTRYPOINTS = Object.freeze([
  'skill-routing',
  'skills-audit',
  'skills-discovery',
  'skill-design',
  'skill-authoring',
  'skill-evolution',
  'skill-installation',
  'skills-host-compatibility',
]);

const MAX_DESCRIPTION = 120;

function requireCatalog(condition, message) {
  if (!condition) throw new TypeError(`session index catalog ${message}`);
}

function shorten(value) {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return [...normalized].length <= MAX_DESCRIPTION
    ? normalized
    : `${[...normalized].slice(0, MAX_DESCRIPTION - 1).join('')}…`;
}

function validateSkill(entry) {
  requireCatalog(entry !== null && typeof entry === 'object' && !Array.isArray(entry), 'contains an invalid skill entry');
  requireCatalog(typeof entry.name === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(entry.name), 'contains an invalid skill name');
  requireCatalog(typeof entry.description === 'string' && entry.description.trim().length > 0, `has no description for ${entry.name}`);
  requireCatalog(['pilot', 'stable', 'deprecated'].includes(entry.status), `has an invalid status for ${entry.name}`);
}

export function renderSessionIndex(catalog, { maxEntries = ENTRYPOINTS.length } = {}) {
  requireCatalog(catalog !== null && typeof catalog === 'object' && !Array.isArray(catalog), 'must be an object');
  requireCatalog(catalog.schema_version === 2, 'has an unsupported schema version');
  requireCatalog(Array.isArray(catalog.skills) && catalog.skills.length > 0, 'must contain at least one skill');
  requireCatalog(Number.isInteger(maxEntries) && maxEntries > 0 && maxEntries <= ENTRYPOINTS.length, 'requires a valid entry limit');

  const byName = new Map();
  for (const skill of catalog.skills) {
    validateSkill(skill);
    requireCatalog(!byName.has(skill.name), `contains duplicate skill ${skill.name}`);
    byName.set(skill.name, skill);
  }

  const selected = ENTRYPOINTS
    .map((name) => byName.get(name))
    .filter(Boolean)
    .filter((skill) => skill.status !== 'deprecated')
    .slice(0, maxEntries);
  const omitted = catalog.skills.length - selected.length;
  const statuses = new Map();
  for (const skill of catalog.skills) statuses.set(skill.status, (statuses.get(skill.status) ?? 0) + 1);
  const statusSummary = [...statuses.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${count} ${status}`).join(', ');

  const lines = [
    '# I-9 Skills session index',
    '',
    '**Start here:** `skill-routing` chooses the smallest suitable route; it does not invoke or install anything.',
    '',
    'Recommended entry points:',
  ];
  for (const skill of selected) lines.push(`- \`${skill.name}\` (${skill.status}): ${shorten(skill.description)}`);
  if (omitted > 0) {
    const singular = omitted === 1;
    lines.push(`- ${omitted} additional catalogued package${singular ? '' : 's'} ${singular ? 'is' : 'are'} not shown in this compact index.`);
  }
  lines.push('', `Catalog: ${catalog.skills.length} packages (${statusSummary}).`, 'For another task, consult `catalog.json` to shortlist and then read the selected package\'s `SKILL.md`.');
  return `${lines.join('\n')}\n`;
}
