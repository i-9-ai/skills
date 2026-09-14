// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { validateRepository } from '../src/application/validate-repository.mjs';
import {
  checkPublicHygiene, CollectionValidationError, validateCatalog, validateLock,
} from '../src/domain/collection-policy.mjs';
import { parseSkillSummary, syncCatalog } from '../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';
import { DEFAULT_LICENSE_PATH, LIMITS, STAGES } from '../.agents/skills/skill-authoring/scripts/skill_tools.mjs';

const EFFORT_METADATA = 'metadata:\n  reasoning-effort: medium\n';
const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const writeJson = (path, value) => fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

function pngCrc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, content) {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + content.length);
  chunk.writeUInt32BE(content.length, 0);
  name.copy(chunk, 4);
  content.copy(chunk, 8);
  chunk.writeUInt32BE(pngCrc(Buffer.concat([name, content])), 8 + content.length);
  return chunk;
}

function transparentPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 0]))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function indexedPng({ palette = true, bitDepth = 8, paletteEntries = 1, pixel = 0 } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = bitDepth;
  header[9] = 3;
  const chunks = [
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
  ];
  if (palette) chunks.push(pngChunk('PLTE', Buffer.alloc(paletteEntries * 3)));
  chunks.push(pngChunk('IDAT', deflateSync(Buffer.from([0, pixel]))), pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function makeRepository(t) {
  const temporary = fs.mkdtempSync(join(tmpdir(), 'collection-test-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = join(temporary, 'collection');
  const name = 'example-skill';
  const packagePath = join(root, '.agents', 'skills', name);
  fs.mkdirSync(packagePath, { recursive: true });
  const description = 'Use when a synthetic example is requested.';
  fs.writeFileSync(join(packagePath, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\nlicense: Apache-2.0\n${EFFORT_METADATA}---\n\n# Example\n\nProduce one synthetic example.\n`);
  fs.copyFileSync(DEFAULT_LICENSE_PATH, join(packagePath, 'LICENSE'));
  fs.mkdirSync(join(packagePath, 'agents'));
  fs.mkdirSync(join(packagePath, 'assets'));
  fs.writeFileSync(join(packagePath, 'agents', 'openai.yaml'), `interface:
  display_name: "Example Skill"
  short_description: "Produce one synthetic example"
  icon_small: "./assets/icon.svg"
  icon_large: "./assets/icon.png"
  default_prompt: "Use $${name} to produce one synthetic example."
`);
  fs.writeFileSync(join(packagePath, 'assets', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title">
  <title id="title">Example Skill</title><path d="M1 1h62v62H1z"/>
</svg>
`);
  fs.writeFileSync(join(packagePath, 'assets', 'icon.png'), transparentPng());
  writeJson(join(root, 'catalog.json'), { schema_version: 2, skills: [
    { name, path: `.agents/skills/${name}`, status: 'pilot', description, tags: [] },
  ] });
  fs.writeFileSync(join(root, 'README.md'), `# Collection\n\n[Example](.agents/skills/${name}/SKILL.md)\n`);
  fs.writeFileSync(join(root, 'AGENTS.md'), '# Repository instructions\n\nConsult `catalog.json` for available skills.\n');
  fs.symlinkSync('AGENTS.md', join(root, 'CLAUDE.md'));
  for (const directory of ['.claude', '.github']) {
    fs.mkdirSync(join(root, directory));
    fs.symlinkSync('../.agents/skills', join(root, directory, 'skills'), 'dir');
  }
  return { root, packagePath, temporary };
}

function guardContentReads(paths, callback) {
  const forbidden = new Set(paths.map((path) => {
    const info = fs.statSync(path);
    return `${info.dev}:${info.ino}`;
  }));
  const original = fs.readSync;
  fs.readSync = function guardedRead(descriptor, ...args) {
    const info = fs.fstatSync(descriptor);
    assert.ok(!forbidden.has(`${info.dev}:${info.ino}`), 'validator attempted to read private root scratch');
    return original.call(this, descriptor, ...args);
  };
  try { return callback(); } finally { fs.readSync = original; }
}

function fixtureGit(root, ...args) {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE']) delete env[key];
  const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false',
    '-c', 'init.templateDir=', '-C', root, ...args], {
    env, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
}

function makeLock() {
  const files = [{ path: 'SKILL.md', sha256: sha256('Synthetic source.') }];
  return { schema_version: 1, observed_on: '2026-09-12', hash_algorithm: 'sha256', sources: [{
    id: 'synthetic-source', repository: 'https://example.org/skills', revision: 'a'.repeat(40),
    package_path: 'skills/example-skill', license: 'Apache-2.0', license_path: 'LICENSE',
    license_sha256: 'b'.repeat(64), reuse: 'pattern', consumers: ['example-skill'], files,
    package_sha256: sha256(files.map(({ path, sha256: digest }) => `${path}\0${digest}\n`).join('')),
  }] };
}

test('collection discovers canonical packages and cross-directory Markdown links', (t) => {
  const { root } = makeRepository(t);
  fs.mkdirSync(join(root, 'docs'));
  fs.writeFileSync(join(root, 'docs', 'guide.md'), '[Readme](../README.md)\n');
  assert.deepEqual(validateRepository(root), {
    packages: 1, text_files: 8, local_links: 2, locked_sources: 0, example_runs: 0,
  });
});

test('collection validates local links in published HTML', (t) => {
  const { root } = makeRepository(t);
  const assets = join(root, 'docs', 'assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(join(assets, 'index.html'), '<a href="guide.html">Guide</a>\n');
  fs.writeFileSync(join(assets, 'guide.html'), '<p>Guide</p>\n');
  assert.equal(validateRepository(root).local_links, 2);
  fs.unlinkSync(join(assets, 'guide.html'));
  assert.throws(() => validateRepository(root), /docs\/assets\/index\.html:1: invalid local link/);
});

test('collection validates local resource sources in published HTML', (t) => {
  const { root } = makeRepository(t);
  const assets = join(root, 'docs', 'assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(join(assets, 'index.html'), '<img src="preview.png"><script src="app.js"></script>\n');
  fs.writeFileSync(join(assets, 'preview.png'), Buffer.from([0]));
  fs.writeFileSync(join(assets, 'app.js'), 'console.log("fixture");\n');
  assert.equal(validateRepository(root).local_links, 3);
  fs.unlinkSync(join(assets, 'preview.png'));
  assert.throws(() => validateRepository(root), /docs\/assets\/index\.html:1: invalid local link/);
});

test('collection validates unquoted local links in published HTML', (t) => {
  const { root } = makeRepository(t);
  const assets = join(root, 'docs', 'assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(join(assets, 'index.html'), '<a href=guide.html>Guide</a>\n');
  fs.writeFileSync(join(assets, 'guide.html'), '<p>Guide</p>\n');
  assert.equal(validateRepository(root).local_links, 2);
  fs.unlinkSync(join(assets, 'guide.html'));
  assert.throws(() => validateRepository(root), /docs\/assets\/index\.html:1: invalid local link/);
});

test('catalog rejects missing packages and uncataloged immediate directories', (t) => {
  const { root, packagePath } = makeRepository(t);
  const orphan = join(root, '.agents', 'skills', 'orphan');
  fs.mkdirSync(orphan);
  assert.throws(() => validateRepository(root), /catalog and package directories do not agree/);
  fs.rmdirSync(orphan);
  fs.unlinkSync(join(packagePath, 'SKILL.md'));
  assert.throws(() => validateRepository(root), /catalog package is missing/);
});

test('catalog accepts packages without effort advice and rejects unsupported optional advice', (t) => {
  const { root, packagePath } = makeRepository(t);
  const skill = join(packagePath, 'SKILL.md');
  const original = fs.readFileSync(skill, 'utf8');
  fs.writeFileSync(skill, original.replace(EFFORT_METADATA, ''));
  assert.equal(validateRepository(root).packages, 1);
  fs.writeFileSync(skill, original.replace('reasoning-effort: medium', 'reasoning-effort: automatic'));
  assert.throws(() => validateRepository(root), /effort/);
});

test('catalog parser supports folded and literal skill descriptions', () => {
  for (const indicator of ['>-', '|-']) {
    const summary = parseSkillSummary(Buffer.from(`---\nname: example-skill\ndescription: ${indicator}\n  Use when a synthetic\n  example is requested.\n---\n`, 'utf8'), 'example-skill');
    assert.equal(summary.description, 'Use when a synthetic example is requested.');
  }
});

test('catalog parser rejects malformed single-quoted scalars', () => {
  assert.throws(() => parseSkillSummary(Buffer.from("---\nname: example-skill\ndescription: 'Bob's invalid YAML description'\n---\n", 'utf8'), 'example-skill'));
});

test('README advertises every cataloged skill', () => {
  const readme = fs.readFileSync(join(process.cwd(), 'README.md'), 'utf8');
  const catalog = JSON.parse(fs.readFileSync(join(process.cwd(), 'catalog.json'), 'utf8'));
  assert.match(readme, new RegExp(`\\*\\*${catalog.skills.length} focused skills\\.`));
  for (const skill of catalog.skills) assert.ok(readme.includes('[`' + skill.name + '`]'));
});

test('collection rejects malformed SVG icons', (t) => {
  const { root, packagePath } = makeRepository(t);
  fs.writeFileSync(join(packagePath, 'assets', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <title id="title">Broken</title><path d="M1 1h62v62H1z">
  </svg>`);
  assert.throws(() => validateRepository(root), /not well-formed XML/);
});

test('collection validates SVG title and viewBox from the parsed structure', (t) => {
  const { root, packagePath } = makeRepository(t);
  fs.writeFileSync(join(packagePath, 'assets', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><!-- <title id="title">Comment</title> viewBox="0 0 64 64" --><path d="M1 1h30v30H1z"/></svg>`);
  assert.throws(() => validateRepository(root), /titled 64x64 SVG/);
});

test('collection rejects namespaced SVG scripts and empty accessible titles', (t) => {
  const { root, packagePath } = makeRepository(t); const icon = join(packagePath, 'assets', 'icon.svg');
  const valid = fs.readFileSync(icon, 'utf8');
  fs.writeFileSync(icon, valid.replace('<path', '<s:script xmlns:s="http://www.w3.org/2000/svg"/> <path'));
  assert.throws(() => validateRepository(root), /active or external SVG content/);
  fs.writeFileSync(icon, valid.replace('>Example Skill</title>', '>   </title>'));
  assert.throws(() => validateRepository(root), /titled 64x64 SVG/);
});

test('collection rejects unbound SVG namespace prefixes', (t) => {
  const { root, packagePath } = makeRepository(t);
  const icon = join(packagePath, 'assets', 'icon.svg');
  const valid = fs.readFileSync(icon, 'utf8');
  fs.writeFileSync(icon, valid.replace('<path', '<x:g/> <path'));
  assert.throws(() => validateRepository(root), /not well-formed XML/);
  fs.writeFileSync(icon, valid.replace('<path', '<x:g xmlns:x="urn:example"/> <path'));
  assert.equal(validateRepository(root).packages, 1);
});

test('collection rejects SVG names with multiple namespace separators', (t) => {
  const { root, packagePath } = makeRepository(t);
  const icon = join(packagePath, 'assets', 'icon.svg');
  const valid = fs.readFileSync(icon, 'utf8');
  fs.writeFileSync(icon, valid.replace('<path', '<x:g:y xmlns:x="urn:example"/> <path'));
  assert.throws(() => validateRepository(root), /not well-formed XML/);
});

test('collection rejects SVG icons with malformed UTF-8', (t) => {
  const { root, packagePath } = makeRepository(t);
  const icon = join(packagePath, 'assets', 'icon.svg');
  const valid = fs.readFileSync(icon);
  fs.writeFileSync(icon, Buffer.concat([valid.subarray(0, -7), Buffer.from([0xff]), valid.subarray(-7)]));
  assert.throws(() => validateRepository(root), /must be valid UTF-8/);
});

test('collection rejects SVG icons with external CSS imports', (t) => {
  const { root, packagePath } = makeRepository(t);
  fs.writeFileSync(join(packagePath, 'assets', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title">
    <title id="title">Example Skill</title><style>@import url("https://example.org/icon.css");</style><path d="M1 1h62v62H1z"/>
  </svg>`);
  assert.throws(() => validateRepository(root), /(?:active or external SVG content|external SVG paint reference)/);
});

test('collection rejects SVG icons with embedded foreign content', (t) => {
  const { root, packagePath } = makeRepository(t);
  fs.writeFileSync(join(packagePath, 'assets', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title">
    <title id="title">Example Skill</title><foreignObject><div>foreign</div></foreignObject><path d="M1 1h62v62H1z"/>
  </svg>`);
  assert.throws(() => validateRepository(root), /active or external SVG content/);
});

test('collection rejects SVG icons with invalid numeric XML character references', (t) => {
  const { root, packagePath } = makeRepository(t);
  const icon = join(packagePath, 'assets', 'icon.svg');
  const valid = fs.readFileSync(icon, 'utf8');
  for (const reference of ['&#0;', '&#xD800;']) {
    fs.writeFileSync(icon, valid.replace('Example Skill', reference));
    assert.throws(() => validateRepository(root), /not well-formed XML/);
  }
});

test('collection rejects external SVG paint URLs in style blocks', (t) => {
  const { root, packagePath } = makeRepository(t);
  fs.writeFileSync(join(packagePath, 'assets', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title">
    <title id="title">Example Skill</title><style>.shape { fill: url(https://example.org/paint.svg#gradient); }</style><path class="shape" d="M1 1h62v62H1z"/>
  </svg>`);
  assert.throws(() => validateRepository(root), /external SVG paint reference/);
});

test('collection rejects CSS imports after escape normalization', (t) => {
  const { root, packagePath } = makeRepository(t);
  fs.writeFileSync(join(packagePath, 'assets', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title"><title id="title">Example Skill</title><style>@\\69mport "https://example.invalid/icon.css";</style><path d="M1 1h62v62H1z"/></svg>`);
  assert.throws(() => validateRepository(root), /active or external SVG content/);
});

test('collection rejects external SVG paint references while allowing fragments', (t) => {
  const { root, packagePath } = makeRepository(t);
  const icon = join(packagePath, 'assets', 'icon.svg');
  const valid = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title">
    <title id="title">Example Skill</title><defs><linearGradient id="gradient"/></defs><path fill="url(#gradient)" d="M1 1h62v62H1z"/>
  </svg>`;
  fs.writeFileSync(icon, valid);
  assert.equal(validateRepository(root).packages, 1);
  for (const reference of ['url(https://example.invalid/paint.svg#gradient)', 'url(paint.svg#gradient)', "url('https://example.invalid/paint.svg#gradient')", 'u\\72l(https://example.invalid/paint.svg#gradient)', 'u&#x72;l(https://example.invalid/paint.svg#gradient)', 'url(https://example.invalid/paint.svg#gradient /* comment */)', 'url(paint.svg#gradient /* comment */)', "url('/*padding*/#gradient')"]) {
    fs.writeFileSync(icon, valid.replace('url(#gradient)', reference));
    assert.throws(() => validateRepository(root), /external SVG paint reference/);
  }
});

test('collection rejects malformed PNG icons', (t) => {
  const { root, packagePath } = makeRepository(t);
  fs.writeFileSync(join(packagePath, 'assets', 'icon.png'), Buffer.from('not a png'));
  assert.throws(() => validateRepository(root), /valid PNG/);
});

test('collection rejects PNG icons with duplicate IHDR chunks', (t) => {
  const { root, packagePath } = makeRepository(t);
  const valid = transparentPng();
  const ihdr = valid.subarray(8, 33);
  fs.writeFileSync(join(packagePath, 'assets', 'icon.png'), Buffer.concat([valid.subarray(0, 33), ihdr, valid.subarray(33)]));
  assert.throws(() => validateRepository(root), /valid PNG/);
});

test('collection rejects PNG icons with unknown critical chunks', (t) => {
  const { root, packagePath } = makeRepository(t);
  const valid = transparentPng();
  const malformed = Buffer.concat([valid.subarray(0, 33), pngChunk('ABCD', Buffer.alloc(0)), valid.subarray(33)]);
  fs.writeFileSync(join(packagePath, 'assets', 'icon.png'), malformed);
  assert.throws(() => validateRepository(root), /valid PNG/);
});

test('collection rejects indexed PNG icons without a palette', (t) => {
  const { root, packagePath } = makeRepository(t);
  const icon = join(packagePath, 'assets', 'icon.png');
  fs.writeFileSync(icon, indexedPng());
  assert.equal(validateRepository(root).packages, 1);
  fs.writeFileSync(icon, indexedPng({ palette: false }));
  assert.throws(() => validateRepository(root), /valid PNG/);
});

test('collection rejects indexed PNG pixels outside the palette', (t) => {
  const { root, packagePath } = makeRepository(t);
  const icon = join(packagePath, 'assets', 'icon.png');
  fs.writeFileSync(icon, indexedPng({ paletteEntries: 1, pixel: 1 }));
  assert.throws(() => validateRepository(root), /valid PNG/);
  fs.writeFileSync(icon, indexedPng({ bitDepth: 1, paletteEntries: 1, pixel: 0x7f }));
  assert.equal(validateRepository(root).packages, 1);
});

test('collection rejects indexed PNG palettes that exceed the bit depth or PNG maximum', (t) => {
  const { root, packagePath } = makeRepository(t); const icon = join(packagePath, 'assets', 'icon.png');
  fs.writeFileSync(icon, indexedPng({ bitDepth: 1, paletteEntries: 3 }));
  assert.throws(() => validateRepository(root), /valid PNG/);
  fs.writeFileSync(icon, indexedPng({ paletteEntries: 257 }));
  assert.throws(() => validateRepository(root), /valid PNG/);
});

test('collection rejects palettes for grayscale PNG color types', (t) => {
  const { root, packagePath } = makeRepository(t); const icon = join(packagePath, 'assets', 'icon.png');
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8;
  const valid = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(Buffer.from([0, 0]))), pngChunk('IEND', Buffer.alloc(0))]);
  const palette = pngChunk('PLTE', Buffer.from([0, 0, 0]));
  fs.writeFileSync(icon, Buffer.concat([valid.subarray(0, 33), palette, valid.subarray(33)]));
  assert.throws(() => validateRepository(root), /valid PNG/);
});

test('collection rejects IDAT chunks separated by ancillary PNG data', (t) => {
  const { root, packagePath } = makeRepository(t); const icon = join(packagePath, 'assets', 'icon.png');
  const valid = transparentPng(); const size = valid.readUInt32BE(33); const content = valid.subarray(41, 41 + size);
  const split = Buffer.concat([valid.subarray(0, 33), pngChunk('IDAT', content.subarray(0, 1)), pngChunk('tEXt', Buffer.from('key\0value')), pngChunk('IDAT', content.subarray(1)), valid.subarray(45 + size)]);
  fs.writeFileSync(icon, split);
  assert.throws(() => validateRepository(root), /valid PNG/);
});

test('collection rejects transparency chunks for alpha PNGs', (t) => {
  const { root, packagePath } = makeRepository(t);
  const valid = transparentPng();
  const malformed = Buffer.concat([valid.subarray(0, 33), pngChunk('tRNS', Buffer.alloc(0)), valid.subarray(33)]);
  fs.writeFileSync(join(packagePath, 'assets', 'icon.png'), malformed);
  assert.throws(() => validateRepository(root), /valid PNG/);
});

test('collection validates parsed OpenAI icon paths instead of YAML comments', (t) => {
  const { root, packagePath } = makeRepository(t);
  const metadata = join(packagePath, 'agents', 'openai.yaml');
  fs.copyFileSync(join(packagePath, 'assets', 'icon.svg'), join(packagePath, 'assets', 'alternate.svg'));
  fs.writeFileSync(metadata, fs.readFileSync(metadata, 'utf8').replace(
    '  icon_small: "./assets/icon.svg"',
    '# icon_small: "./assets/icon.svg"\n  icon_small: "./assets/alternate.svg"',
  ));
  assert.throws(() => validateRepository(root), /required small SVG and large PNG icons/);
});

test('catalog rejects invalid identities, duplicate names, paths, and lifecycle states', () => {
  const value = { schema_version: 2, skills: [{
    name: 'example-skill', path: '.agents/skills/example-skill', status: 'pilot',
    description: 'Use for a synthetic example.', tags: [],
  }] };
  const files = new Set(['.agents/skills/example-skill/SKILL.md']);
  const directories = new Set(['.agents/skills/example-skill']);
  for (const [field, invalid] of [['name', 'example-skill\n'], ['name', '9-example'], ['path', 'skills/example-skill'], ['status', 'unknown']]) {
    const candidate = structuredClone(value);
    candidate.skills[0][field] = invalid;
    assert.throws(() => validateCatalog(candidate, files, directories), CollectionValidationError);
  }
  value.skills.push({ ...value.skills[0] });
  assert.throws(() => validateCatalog(value, files, directories), /distinct/);
});

test('the three reviewed aliases resolve links without double-counting packages or text', (t) => {
  const { root } = makeRepository(t);
  const beforeAliases = validateRepository(root);
  fs.appendFileSync(join(root, 'README.md'), '[Guidance](CLAUDE.md)\n[Claude alias](.claude/skills/example-skill/SKILL.md)\n[GitHub alias](.github/skills/example-skill/SKILL.md)\n');
  assert.equal(validateRepository(root).local_links, beforeAliases.local_links + 3);
});

test('declared discovery aliases are required', (t) => {
  const { root } = makeRepository(t);
  fs.unlinkSync(join(root, 'CLAUDE.md'));
  assert.throws(() => validateRepository(root));
});

test('wrong targets and additional symlinks are rejected', (t) => {
  const { root } = makeRepository(t);
  fs.unlinkSync(join(root, 'CLAUDE.md'));
  fs.symlinkSync('README.md', join(root, 'CLAUDE.md'));
  assert.throws(() => validateRepository(root), /unexpected alias target/);
  fs.unlinkSync(join(root, 'CLAUDE.md'));
  fs.symlinkSync('README.md', join(root, 'unexpected.md'));
  assert.throws(() => validateRepository(root), /symlink is forbidden/);
});

test('root scratch is never read, while similarly named package directories are checked', (t) => {
  const { root, packagePath } = makeRepository(t);
  const sentinel = 'ghp_' + 'A'.repeat(36);
  const scratch = ['.work', 'tmp', 'node_modules'].map((directory) => {
    fs.mkdirSync(join(root, directory));
    const file = join(root, directory, 'private.txt');
    fs.writeFileSync(file, sentinel);
    return file;
  });
  guardContentReads(scratch, () => assert.equal(validateRepository(root).packages, 1));
  fs.mkdirSync(join(packagePath, 'tmp'));
  fs.writeFileSync(join(packagePath, 'tmp', 'private.txt'), sentinel);
  assert.throws(() => validateRepository(root), /possible GitHub credential/);
});

test('tracked root scratch is rejected without reading its contents or echoing its name', (t) => {
  const { root } = makeRepository(t);
  fixtureGit(root, 'init', '-q');
  fs.mkdirSync(join(root, '.work'));
  const scratch = join(root, '.work', 'synthetic-private-name.txt');
  fs.writeFileSync(scratch, 'Synthetic private scratch.\n');
  fixtureGit(root, 'add', '--', '.work');
  guardContentReads([scratch], () => assert.throws(() => validateRepository(root), (error) => {
    assert.match(error.message, /must not be tracked/);
    assert.ok(!error.message.includes('synthetic-private-name'));
    return true;
  }));
});

test('cache-named directories do not bypass the publication hygiene corpus', (t) => {
  const { root, packagePath } = makeRepository(t);
  const sentinel = 'ghp_' + 'A'.repeat(36);
  for (const directory of [join(packagePath, '__pycache__'), join(root, '.venv'), join(root, '.pytest_cache')]) {
    fs.mkdirSync(directory);
    const file = join(directory, 'synthetic.txt');
    fs.writeFileSync(file, sentinel);
    assert.throws(() => validateRepository(root), /possible GitHub credential/);
    fs.rmSync(directory, { recursive: true });
  }
});

test('inherited Git index overrides cannot hide tracked root scratch', (t) => {
  const { root, temporary } = makeRepository(t);
  fixtureGit(root, 'init', '-q');
  fs.mkdirSync(join(root, 'tmp'));
  fs.writeFileSync(join(root, 'tmp', 'synthetic.txt'), 'Synthetic scratch.\n');
  fixtureGit(root, 'add', '--', 'tmp');
  const previous = process.env.GIT_INDEX_FILE;
  process.env.GIT_INDEX_FILE = join(temporary, 'absent-index');
  try { assert.throws(() => validateRepository(root), /must not be tracked/); }
  finally {
    if (previous === undefined) delete process.env.GIT_INDEX_FILE;
    else process.env.GIT_INDEX_FILE = previous;
  }
});

test('public hygiene identifies location and category without echoing sensitive-looking bytes', () => {
  for (const content of ['ghp_' + 'A'.repeat(36), '-----BEGIN ' + 'PRIVATE KEY-----',
    '/' + 'Users' + '/example/data', '/' + 'root' + '/.config/tool', '/' + 'workspace' + '/private-project', 'https://' + 'user:pass' + '@example.org']) {
    assert.throws(() => checkPublicHygiene('example.txt', `Heading\n${content}`), (error) => {
      assert.match(error.message, /example\.txt:2: possible/);
      assert.ok(!error.message.includes(content));
      return true;
    });
  }
});

test('public hygiene scans binary payloads without requiring UTF-8 decoding', (t) => {
  const { root } = makeRepository(t);
  const artifact = join(root, 'artifact.bin');
  const baseline = validateRepository(root);
  fs.writeFileSync(artifact, Buffer.from([0xff, 0x00, 0x80]));
  assert.deepEqual(validateRepository(root), baseline);
  const token = 'ghp_' + 'A'.repeat(36);
  fs.writeFileSync(artifact, Buffer.concat([Buffer.from([0xff, 0x00]), Buffer.from(token, 'ascii')]));
  assert.throws(() => validateRepository(root), (error) => {
    assert.match(error.message, /artifact\.bin:1: possible GitHub credential/);
    assert.ok(!error.message.includes(token));
    return true;
  });
});

test('visual guide publication only deploys main and stages new pages before diffing', () => {
  const workflow = fs.readFileSync(join(process.cwd(), '.github', 'workflows', 'publish-visual-guides.yml'), 'utf8');
  assert.match(workflow, /concurrency:\n\s+group: publish-visual-guides-\$\{\{ github\.repository \}\}\n\s+cancel-in-progress: false/);
  assert.match(workflow, /with:\n\s+ref: main\n\s+persist-credentials: false/);
  assert.match(workflow, /git add --all\n\s+if git diff --quiet --staged; then/);
  const wikiWorkflow = fs.readFileSync(join(process.cwd(), '.github', 'workflows', 'sync-wiki.yml'), 'utf8');
  assert.match(wikiWorkflow, /concurrency:\n\s+group: sync-wiki-\$\{\{ github\.repository \}\}\n\s+cancel-in-progress: false/);
  assert.match(wikiWorkflow, /with:\n\s+ref: main\n\s+persist-credentials: false/);
  assert.match(wikiWorkflow, /git ls-remote --exit-code --heads "https:\/\/github\.com\/\$\{REPOSITORY\}\.wiki\.git"/);
  assert.match(wikiWorkflow, /python3 - <<'PY'[\s\S]*https:\/\/github\.com\/\{repository\}\/blob\/main\/\{resolved\}/);
  assert.match(wikiWorkflow, /def rewrite_markdown\(body, replace\):[\s\S]*fence is not None[\s\S]*line\.find\('`', cursor\)/);
  assert.match(wikiWorkflow, /Wiki Home collision:[\s\S]*exit 1/);
  assert.match(wikiWorkflow, /git add --all\n\s+if git diff --quiet --staged; then/);
});

test('catalog helper requires affirmative discovery guidance', (t) => {
  const { root } = makeRepository(t);
  fs.writeFileSync(join(root, 'AGENTS.md'), 'Do not consult catalog.json for skill discovery.\n');
  const result = spawnSync(process.execPath, [join(process.cwd(), '.agents', 'skills', 'skills-catalog', 'scripts', 'catalog_tools.mjs'), 'check', root], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must direct agents to catalog\.json for skill discovery/);
});

test('catalog synchronization preserves readable permissions', (t) => {
  const { root, packagePath } = makeRepository(t);
  const catalog = join(root, 'catalog.json');
  fs.chmodSync(catalog, 0o644);
  const skill = join(packagePath, 'SKILL.md');
  fs.writeFileSync(skill, fs.readFileSync(skill, 'utf8').replace('synthetic example', 'portable example'));
  assert.equal(syncCatalog(root).changed, true);
  assert.equal(fs.statSync(catalog).mode & 0o777, 0o644);
  fs.unlinkSync(catalog);
  assert.equal(syncCatalog(root).changed, true);
  assert.equal(fs.statSync(catalog).mode & 0o777, 0o644);
});

test('source locks validate package digests and known consumers', (t) => {
  const { root } = makeRepository(t);
  const lock = makeLock();
  assert.equal(validateLock(lock, new Set(['example-skill'])), 1);
  writeJson(join(root, 'upstreams.lock.json'), lock);
  assert.equal(validateRepository(root).locked_sources, 1);
  for (const [key, value] of [['package_sha256', 'c'.repeat(64)], ['revision', 'main'],
    ['consumers', ['missing-skill']], ['consumers', ['example-skill', 'example-skill']],
    ['files', [{ path: '../SKILL.md', sha256: 'a'.repeat(64) }]],
    ['revision', 'a'.repeat(40) + '\n'], ['license', 'TBD'], ['license', ' TBD '], ['license_sha256', 'b'.repeat(64) + '\n'],
    ['files', [{ path: 'SKILL.md', sha256: 'a'.repeat(64) + '\n' }]]]) {
    const invalid = structuredClone(lock);
    invalid.sources[0][key] = value;
    assert.throws(() => validateLock(invalid, new Set(['example-skill'])), CollectionValidationError);
  }
  for (const repository of ['https://localhost/private', 'https://127.0.0.1/private', 'https://10.1.2.3/private', 'https://[fd00::1]/private']) {
    const invalid = structuredClone(lock); invalid.sources[0].repository = repository;
    assert.throws(() => validateLock(invalid, new Set(['example-skill'])), CollectionValidationError);
  }
});

test('source aggregate hashes use sorted relative UTF-8 paths regardless of inventory order', () => {
  const lock = makeLock();
  const files = ['references/z.md', 'SKILL.md', 'references/α.md'].map((path) => ({ path, sha256: sha256(path) }));
  lock.sources[0].files = files;
  const sorted = [...files].sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
  lock.sources[0].package_sha256 = sha256(sorted.map(({ path, sha256: digest }) => `${path}\0${digest}\n`).join(''));
  assert.equal(validateLock(lock, new Set(['example-skill'])), 1);
  files.reverse();
  assert.equal(validateLock(lock, new Set(['example-skill'])), 1);
  files.push({ ...files[0] });
  assert.throws(() => validateLock(lock, new Set(['example-skill'])), /distinct/);
});

test('collection routes example run manifests through artifact integrity validation', (t) => {
  const { root, packagePath } = makeRepository(t);
  const run = join(packagePath, 'examples', 'example-run');
  fs.mkdirSync(run, { recursive: true });
  const stages = STAGES.map((name) => {
    const content = `# ${name} evidence\n\nSynthetic check: passed. Limits: fixture only.\n`;
    const path = `${name}.md`;
    fs.writeFileSync(join(run, path), content);
    return { name, status: 'passed', summary: 'Synthetic fixture completed.', artifacts: [{ path, sha256: sha256(content) }] };
  });
  writeJson(join(run, 'run.json'), {
    schema_version: 1, run_id: 'example-run', goal: 'Produce one synthetic example.', target_skill: 'example-skill',
    status: 'validated', sources: ['alpha', 'beta'].map((id) => ({
      id, uri: `urn:example:${id}`, revision: 'synthetic-v1', license: 'CC0-1.0', reuse: 'pattern',
    })), stages,
  });
  assert.equal(validateRepository(root).example_runs, 1);
  fs.appendFileSync(join(run, stages[0].artifacts[0].path), 'Changed evidence.\n');
  assert.throws(() => validateRepository(root), /(?:digest|sha256|hash)/i);
});

test('Markdown corpus reads remain bounded and dangling local links fail', (t) => {
  const { root } = makeRepository(t);
  fs.writeFileSync(join(root, 'guide.md'), '[Missing](missing.md)\n');
  assert.throws(() => validateRepository(root));
  fs.writeFileSync(join(root, 'guide.md'), 'x'.repeat(LIMITS.textBytes + 1));
  assert.throws(() => validateRepository(root), /Markdown exceeds text limit/);
});
