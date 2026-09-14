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
const MAX_CATALOG_SKILLS = 256;
const MAX_NAME = 64;
const MAX_CATALOG_DESCRIPTION = 220;
const MAX_TAGS = 16;
const CONTROL_CHARACTERS = /[\x00-\x08\x0b-\x1f\x7f]/u;

function requireCatalog(condition, message) {
  if (!condition) throw new TypeError(`session index catalog ${message}`);
}

function exactFields(value, expected, label) {
  requireCatalog(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  const keys = Object.keys(value);
  requireCatalog(keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key)),
    `${label} has missing or unexpected fields`);
  return value;
}

function nonblank(value, label, limit) {
  requireCatalog(typeof value === 'string' && value.trim().length > 0 && value.length <= limit * 2,
    `${label} must be a nonblank string of at most ${limit} characters`);
  requireCatalog(value.isWellFormed() && !CONTROL_CHARACTERS.test(value), `${label} contains invalid Unicode or control characters`);
  requireCatalog([...value].length <= limit, `${label} must be a nonblank string of at most ${limit} characters`);
  return value;
}

function slug(value, label) {
  requireCatalog(typeof value === 'string' && value.length <= MAX_NAME && value.trim() === value
    && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value),
  `${label} must be a lowercase hyphenated slug of at most ${MAX_NAME} characters`);
  return value;
}

function shorten(value) {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return [...normalized].length <= MAX_DESCRIPTION
    ? normalized
    : `${[...normalized].slice(0, MAX_DESCRIPTION - 1).join('')}…`;
}

function validateSkill(entry) {
  exactFields(entry, ['name', 'path', 'status', 'description', 'tags'], 'catalog entry');
  const name = slug(entry.name, 'catalog skill name');
  requireCatalog(entry.path === `.agents/skills/${name}`, 'path must be .agents/skills/<name>');
  requireCatalog(['pilot', 'stable', 'deprecated'].includes(entry.status), `has an invalid status for ${name}`);
  nonblank(entry.description, 'catalog description', MAX_CATALOG_DESCRIPTION);
  requireCatalog(Array.isArray(entry.tags) && entry.tags.length <= MAX_TAGS, 'tags must be a bounded array');
  const tags = entry.tags.map((tag) => slug(tag, 'catalog tag'));
  requireCatalog(new Set(tags).size === tags.length && [...tags].sort().every((tag, index) => tag === tags[index]),
    'tags must be distinct and sorted');
}

export function renderSessionIndex(catalog, { maxEntries = ENTRYPOINTS.length } = {}) {
  exactFields(catalog, ['schema_version', 'skills'], 'catalog');
  requireCatalog(catalog.schema_version === 2, 'has an unsupported schema version');
  requireCatalog(Array.isArray(catalog.skills) && catalog.skills.length > 0 && catalog.skills.length <= MAX_CATALOG_SKILLS,
    `must contain between 1 and ${MAX_CATALOG_SKILLS} packages`);
  requireCatalog(Number.isInteger(maxEntries) && maxEntries > 0 && maxEntries <= ENTRYPOINTS.length, 'requires a valid entry limit');

  const byName = new Map();
  for (const skill of catalog.skills) {
    validateSkill(skill);
    requireCatalog(!byName.has(skill.name), `contains duplicate skill ${skill.name}`);
    byName.set(skill.name, skill);
  }
  requireCatalog([...byName.keys()].sort().every((name, index) => name === catalog.skills[index].name),
    'skills must be sorted by name');

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
  lines.push('', `Catalog: ${catalog.skills.length} packages (${statusSummary}).`, 'For another task, consult `skills-catalog.json` to shortlist and then read the selected package\'s `SKILL.md`.');
  return `${lines.join('\n')}\n`;
}
