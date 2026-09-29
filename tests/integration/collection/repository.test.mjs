// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { CollectionValidationService } from '../../../src/service/CollectionValidationService.ts';
import { CollectionAssetValidationService } from '../../../src/service/CollectionAssetValidationService.ts';
import { CollectionFilesystemRepository } from '../../../src/repository/CollectionFilesystemRepository.ts';
import { CollectionValidator } from '../../../src/validator/CollectionValidator.ts';
import { CollectionValidationError } from '../../../src/validator/CollectionValidationError.ts';
import { parseSkillSummary, syncCatalog } from '../../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';
import { DEFAULT_LICENSE_PATH, LIMITS, STAGES } from '../../../.agents/skills/skill-authoring/scripts/skill_tools.mjs';

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
    renderReceipt(packagePath);
    writeJson(join(root, 'skills-catalog.json'), {
        schema_version: 1, skills: [
            { name, path: `.agents/skills/${name}`, description, tags: [] },
        ]
    });
    fs.writeFileSync(join(root, 'README.md'), `# Collection\n\n[Example](.agents/skills/${name}/SKILL.md)\n`);
    fs.writeFileSync(join(root, 'AGENTS.md'), '# Repository instructions\n\nConsult `skills-catalog.json` for available skills.\n');
    fs.symlinkSync('AGENTS.md', join(root, 'CLAUDE.md'));
    fs.symlinkSync('AGENTS.md', join(root, 'GEMINI.md'));
    for (const directory of ['.claude', '.github']) {
        fs.mkdirSync(join(root, directory));
        fs.symlinkSync('../.agents/skills', join(root, directory, 'skills'), 'dir');
    }
    return { root, packagePath, temporary };
}

function renderReceipt(packagePath) {
    const svg = fs.readFileSync(join(packagePath, 'assets/icon.svg'));
    const png = fs.readFileSync(join(packagePath, 'assets/icon.png'));
    writeJson(join(packagePath, 'assets/icon.render.json'), { schema_version: 1, source: 'icon.svg', source_sha256: sha256(svg),
        artifact: 'icon.png', artifact_sha256: sha256(png), renderer: 'synthetic fixture', arguments: [], width: png.readUInt32BE(16), height: png.readUInt32BE(20) });
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
    return {
        schema_version: 1, observed_on: '2026-09-12', hash_algorithm: 'sha256', sources: [{
            id: 'synthetic-source', repository: 'https://example.org/skills', revision: 'a'.repeat(40),
            package_path: 'skills/example-skill', license: 'Apache-2.0', license_path: 'LICENSE',
            license_sha256: 'b'.repeat(64), reuse: 'pattern', consumers: ['example-skill'], files,
            package_sha256: sha256(files.map(({ path, sha256: digest }) => `${path}\0${digest}\n`).join('')),
        }]
    };
}

test('collection discovers canonical packages and cross-directory Markdown links', (t) => {
    const { root } = makeRepository(t);
    fs.mkdirSync(join(root, 'docs'));
    fs.writeFileSync(join(root, 'docs', 'guide.md'), '[Readme](../README.md)\n');
    assert.deepEqual(new CollectionValidationService().validateRepository(root), {
        packages: 1, text_files: 9, local_links: 2, locked_sources: 0, example_runs: 0,
    });
});

test('collection validates local links in published HTML', (t) => {
    const { root } = makeRepository(t);
    const assets = join(root, 'docs', 'assets');
    fs.mkdirSync(assets, { recursive: true });
    fs.writeFileSync(join(assets, 'index.html'), '<a href="guide.html">Guide</a>\n');
    fs.writeFileSync(join(assets, 'guide.html'), '<p>Guide</p>\n');
    assert.equal(new CollectionValidationService().validateRepository(root).local_links, 2);
    fs.unlinkSync(join(assets, 'guide.html'));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /docs\/assets\/index\.html:1: invalid local link/);
});

test('collection validates local resource sources in published HTML', (t) => {
    const { root } = makeRepository(t);
    const assets = join(root, 'docs', 'assets');
    fs.mkdirSync(assets, { recursive: true });
    fs.writeFileSync(join(assets, 'index.html'), '<img src="preview.png"><script src="app.js"></script>\n');
    fs.writeFileSync(join(assets, 'preview.png'), Buffer.from([0]));
    fs.writeFileSync(join(assets, 'app.js'), 'console.log("fixture");\n');
    assert.equal(new CollectionValidationService().validateRepository(root).local_links, 3);
    fs.unlinkSync(join(assets, 'preview.png'));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /docs\/assets\/index\.html:1: invalid local link/);
});

test('collection validates unquoted local links in published HTML', (t) => {
    const { root } = makeRepository(t);
    const assets = join(root, 'docs', 'assets');
    fs.mkdirSync(assets, { recursive: true });
    fs.writeFileSync(join(assets, 'index.html'), '<a href=guide.html>Guide</a>\n');
    fs.writeFileSync(join(assets, 'guide.html'), '<p>Guide</p>\n');
    assert.equal(new CollectionValidationService().validateRepository(root).local_links, 2);
    fs.unlinkSync(join(assets, 'guide.html'));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /docs\/assets\/index\.html:1: invalid local link/);
});

test('published HTML links resolve against the first base instead of unrelated root files', (t) => {
    const { root } = makeRepository(t);
    const assets = join(root, 'docs', 'assets');
    fs.mkdirSync(join(assets, 'subdir'), { recursive: true });
    fs.writeFileSync(join(assets, 'index.html'), '<base href="subdir/"><a href="guide.html">Guide</a>');
    fs.writeFileSync(join(assets, 'guide.html'), '<p>Wrong location</p>');
    assert.throws(() => new CollectionValidationService().validateRepository(root), /invalid local link/);
    fs.writeFileSync(join(assets, 'subdir', 'guide.html'), '<p>Right location</p>');
    assert.doesNotThrow(() => new CollectionValidationService().validateRepository(root));
});

test('collection rejects invalid SVG namespace bindings, expanded duplicates and empty local names', (t) => {
    const { root, packagePath } = makeRepository(t);
    const icon = join(packagePath, 'assets', 'icon.svg');
    const original = fs.readFileSync(icon, 'utf8');
    const invalid = [
        original.replace(' xmlns="http://www.w3.org/2000/svg"', ''),
        original.replace('http://www.w3.org/2000/svg', 'urn:not-svg'),
        original.replace('<path', '<g:/><path').replace('<svg ', '<svg xmlns:g="urn:example" '),
        ...['xmlns:a:b="urn:example"', 'xmlns:="urn:example"', 'xmlns:1a="urn:example"',
            'xmlns:xml="urn:wrong"', 'xmlns:xmlns="urn:example"', 'xmlns:a="http://www.w3.org/XML/1998/namespace"',
            'xmlns:a="http://www.w3.org/2000/xmlns/"', 'xmlns:a=""',
            'xmlns:a="urn:example" xmlns:b="urn:example" a:x="1" b:x="2"'].map(attributes => original.replace('<svg ', `<svg ${attributes} `)),
    ];
    for (const content of invalid) {
        fs.writeFileSync(icon, content);
        assert.throws(() => new CollectionValidationService().validateRepository(root), /XML|SVG root/);
    }
});

test('PNG validation rejects excessive decoded bytes before inflation', () => {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(4096, 0);
    header.writeUInt32BE(4096, 4);
    header[8] = 16;
    header[9] = 6;
    const payload = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', header),
        pngChunk('IDAT', Buffer.from('not a zlib payload')), pngChunk('IEND', Buffer.alloc(0))]);
    assert.throws(() => new CollectionValidator().validateCollectionPng('icon.png', payload), /decoded PNG byte limit/);
});

test('catalog rejects missing packages and uncataloged immediate directories', (t) => {
    const { root, packagePath } = makeRepository(t);
    const orphan = join(root, '.agents', 'skills', 'orphan');
    fs.mkdirSync(orphan);
    assert.throws(() => new CollectionValidationService().validateRepository(root), /catalog and package directories do not agree/);
    fs.rmdirSync(orphan);
    fs.unlinkSync(join(packagePath, 'SKILL.md'));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /catalog package is missing/);
});

test('catalog accepts packages without effort advice and rejects unsupported optional advice', (t) => {
    const { root, packagePath } = makeRepository(t);
    const skill = join(packagePath, 'SKILL.md');
    const original = fs.readFileSync(skill, 'utf8');
    fs.writeFileSync(skill, original.replace(EFFORT_METADATA, ''));
    assert.equal(new CollectionValidationService().validateRepository(root).packages, 1);
    fs.writeFileSync(skill, original.replace('reasoning-effort: medium', 'reasoning-effort: automatic'));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /effort/);
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
    const catalog = JSON.parse(fs.readFileSync(join(process.cwd(), 'skills-catalog.json'), 'utf8'));
    assert.match(readme, new RegExp(`\\*\\*${catalog.skills.length} focused skills\\.`));
    for (const skill of catalog.skills) assert.ok(readme.includes('[`' + skill.name + '`]'));
});

test('collection rejects malformed SVG icons', (t) => {
    const { root, packagePath } = makeRepository(t);
    fs.writeFileSync(join(packagePath, 'assets', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <title id="title">Broken</title><path d="M1 1h62v62H1z">
  </svg>`);
    assert.throws(() => new CollectionValidationService().validateRepository(root), /not well-formed XML/);
});

test('collection validates SVG title and viewBox from the parsed structure', (t) => {
    const { root, packagePath } = makeRepository(t);
    fs.writeFileSync(join(packagePath, 'assets', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><!-- <title id="title">Comment</title> viewBox="0 0 64 64" --><path d="M1 1h30v30H1z"/></svg>`);
    assert.throws(() => new CollectionValidationService().validateRepository(root), /titled 64x64 SVG/);
});

test('collection rejects namespaced SVG scripts and empty accessible titles', (t) => {
    const { root, packagePath } = makeRepository(t); const icon = join(packagePath, 'assets', 'icon.svg');
    const valid = fs.readFileSync(icon, 'utf8');
    fs.writeFileSync(icon, valid.replace('<path', '<s:script xmlns:s="http://www.w3.org/2000/svg"/> <path'));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /active or external SVG content/);
    fs.writeFileSync(icon, valid.replace('>Example Skill</title>', '>   </title>'));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /titled 64x64 SVG/);
});

test('collection rejects unbound SVG namespace prefixes', (t) => {
    const { root, packagePath } = makeRepository(t);
    const icon = join(packagePath, 'assets', 'icon.svg');
    const valid = fs.readFileSync(icon, 'utf8');
    fs.writeFileSync(icon, valid.replace('<path', '<x:g/> <path'));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /not well-formed XML/);
    fs.writeFileSync(icon, valid.replace('<path', '<x:g xmlns:x="urn:example"/> <path'));
    renderReceipt(packagePath);
    assert.equal(new CollectionValidationService().validateRepository(root).packages, 1);
});

test('collection rejects SVG names with multiple namespace separators', (t) => {
    const { root, packagePath } = makeRepository(t);
    const icon = join(packagePath, 'assets', 'icon.svg');
    const valid = fs.readFileSync(icon, 'utf8');
    fs.writeFileSync(icon, valid.replace('<path', '<x:g:y xmlns:x="urn:example"/> <path'));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /not well-formed XML/);
});

test('collection rejects SVG icons with malformed UTF-8', (t) => {
    const { root, packagePath } = makeRepository(t);
    const icon = join(packagePath, 'assets', 'icon.svg');
    const valid = fs.readFileSync(icon);
    fs.writeFileSync(icon, Buffer.concat([valid.subarray(0, -7), Buffer.from([0xff]), valid.subarray(-7)]));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /must be valid UTF-8/);
});

test('collection rejects SVG icons with external CSS imports', (t) => {
    const { root, packagePath } = makeRepository(t);
    fs.writeFileSync(join(packagePath, 'assets', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title">
    <title id="title">Example Skill</title><style>@import url("https://example.org/icon.css");</style><path d="M1 1h62v62H1z"/>
  </svg>`);
    assert.throws(() => new CollectionValidationService().validateRepository(root), /(?:active or external SVG content|external SVG paint reference)/);
});

test('collection rejects SVG icons with embedded foreign content', (t) => {
    const { root, packagePath } = makeRepository(t);
    fs.writeFileSync(join(packagePath, 'assets', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title">
    <title id="title">Example Skill</title><foreignObject><div>foreign</div></foreignObject><path d="M1 1h62v62H1z"/>
  </svg>`);
    assert.throws(() => new CollectionValidationService().validateRepository(root), /active or external SVG content/);
});

test('collection rejects SVG icons with invalid numeric XML character references', (t) => {
    const { root, packagePath } = makeRepository(t);
    const icon = join(packagePath, 'assets', 'icon.svg');
    const valid = fs.readFileSync(icon, 'utf8');
    for (const reference of ['&#0;', '&#xD800;', '&#x110000;', '&#xFFFF;']) {
        for (const content of [valid.replace('Example Skill', reference), valid.replace('</svg>', `<desc>${reference}</desc></svg>`), valid.replace('</svg>', `<g><text>${reference}</text></g></svg>`)]) {
            fs.writeFileSync(icon, content);
            assert.throws(() => new CollectionValidationService().validateRepository(root), /not well-formed XML/);
        }
    }
    fs.writeFileSync(icon, valid.replace('</svg>', '<desc>&#9;&#x1F4D6;</desc></svg>'));
    renderReceipt(packagePath);
    assert.doesNotThrow(() => new CollectionValidationService().validateRepository(root));
});

test('icon deduplication ignores SVG comments and decoded PNG metadata, compression and filters', (t) => {
    const { root, packagePath } = makeRepository(t);
    const relative = '.agents/skills/example-skill';
    const copy = join(root, '.agents/skills/another-skill');
    fs.cpSync(packagePath, copy, { recursive: true });
    const svg = fs.readFileSync(join(copy, 'assets/icon.svg'), 'utf8');
    fs.writeFileSync(join(copy, 'assets/icon.svg'), svg.replace('</svg>', '<!-- metadata only --></svg>'));
    renderReceipt(copy);
    const files = new CollectionFilesystemRepository(root);
    t.after(() => files.close());
    const metadata = { icon_small: './assets/icon.svg', icon_large: './assets/icon.png' };
    const comments = new CollectionAssetValidationService();
    comments.validatePackage(files, relative, metadata);
    assert.throws(() => comments.validatePackage(files, '.agents/skills/another-skill', metadata), /icon.svg duplicates/);

    // A different SVG title evades the source check, but the rendered samples
    // still match. This verifies the artifact check independently of SVG text.
    fs.writeFileSync(join(copy, 'assets/icon.svg'), svg.replace('Example Skill', 'Another Skill'));
    const original = transparentPng();
    const png = Buffer.concat([original.subarray(0, 33), pngChunk('tEXt', Buffer.from('Comment\0Changed metadata')),
        pngChunk('IDAT', deflateSync(Buffer.from([1, 0, 0, 0, 0]), { level: 0 })), pngChunk('IEND', Buffer.alloc(0))]);
    assert.notDeepEqual(png, original);
    fs.writeFileSync(join(copy, 'assets/icon.png'), png);
    renderReceipt(copy);
    const artifacts = new CollectionAssetValidationService();
    artifacts.validatePackage(files, relative, metadata);
    assert.throws(() => artifacts.validatePackage(files, '.agents/skills/another-skill', metadata), /icon.png duplicates/);

    const distinct = Buffer.concat([original.subarray(0, 33), pngChunk('IDAT', deflateSync(Buffer.from([0, 1, 2, 3, 255]))), pngChunk('IEND', Buffer.alloc(0))]);
    fs.writeFileSync(join(copy, 'assets/icon.png'), distinct);
    renderReceipt(copy);
    const different = new CollectionAssetValidationService();
    different.validatePackage(files, relative, metadata);
    assert.doesNotThrow(() => different.validatePackage(files, '.agents/skills/another-skill', metadata));
});

test('collection rejects external SVG paint URLs in style blocks', (t) => {
    const { root, packagePath } = makeRepository(t);
    fs.writeFileSync(join(packagePath, 'assets', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title">
    <title id="title">Example Skill</title><style>.shape { fill: url(https://example.org/paint.svg#gradient); }</style><path class="shape" d="M1 1h62v62H1z"/>
  </svg>`);
    assert.throws(() => new CollectionValidationService().validateRepository(root), /external SVG paint reference/);
});

test('collection rejects CSS imports after escape normalization', (t) => {
    const { root, packagePath } = makeRepository(t);
    fs.writeFileSync(join(packagePath, 'assets', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title"><title id="title">Example Skill</title><style>@\\69mport "https://example.invalid/icon.css";</style><path d="M1 1h62v62H1z"/></svg>`);
    assert.throws(() => new CollectionValidationService().validateRepository(root), /active or external SVG content/);
});

test('collection rejects external SVG paint references while allowing fragments', (t) => {
    const { root, packagePath } = makeRepository(t);
    const icon = join(packagePath, 'assets', 'icon.svg');
    const valid = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title">
    <title id="title">Example Skill</title><defs><linearGradient id="gradient"/></defs><path fill="url(#gradient)" d="M1 1h62v62H1z"/>
  </svg>`;
    fs.writeFileSync(icon, valid);
    renderReceipt(packagePath);
    assert.equal(new CollectionValidationService().validateRepository(root).packages, 1);
    for (const reference of ['url(https://example.invalid/paint.svg#gradient)', 'url(paint.svg#gradient)', "url('https://example.invalid/paint.svg#gradient')", 'u\\72l(https://example.invalid/paint.svg#gradient)', 'u&#x72;l(https://example.invalid/paint.svg#gradient)', 'url(https://example.invalid/paint.svg#gradient /* comment */)', 'url(paint.svg#gradient /* comment */)', "url('/*padding*/#gradient')"]) {
        fs.writeFileSync(icon, valid.replace('url(#gradient)', reference));
        assert.throws(() => new CollectionValidationService().validateRepository(root), /external SVG paint reference/);
    }
});

test('collection rejects malformed PNG icons', (t) => {
    const { root, packagePath } = makeRepository(t);
    fs.writeFileSync(join(packagePath, 'assets', 'icon.png'), Buffer.from('not a png'));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /valid PNG/);
});

test('decoded icon identity is independent of PNG color format, unused palette entries and padding bits', () => {
    const validator = new CollectionValidator();
    function pixelPng(bitDepth, colorType, samples, extra = []) {
        const header = Buffer.alloc(13);
        header.writeUInt32BE(1); header.writeUInt32BE(1, 4);
        header[8] = bitDepth; header[9] = colorType;
        return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', header), ...extra,
            pngChunk('IDAT', deflateSync(Buffer.from([0, ...samples]))), pngChunk('IEND', Buffer.alloc(0))]);
    }
    const white = [
        pixelPng(1, 0, [0xff]), pixelPng(1, 0, [0x80]), pixelPng(2, 0, [0xc0]),
        pixelPng(4, 0, [0xf0]), pixelPng(8, 0, [255]), pixelPng(16, 0, [255, 255]),
        pixelPng(8, 2, [255, 255, 255]), pixelPng(16, 2, Array(6).fill(255)),
        pixelPng(8, 4, [255, 255]), pixelPng(16, 4, Array(4).fill(255)),
        pixelPng(8, 6, Array(4).fill(255)), pixelPng(16, 6, Array(8).fill(255)),
        pixelPng(1, 3, [0], [pngChunk('PLTE', Buffer.from([255, 255, 255, 1, 2, 3])), pngChunk('tRNS', Buffer.from([255]))]),
    ];
    const expected = validator.validateCollectionPng('white.png', white[0]);
    for (const png of white) assert.equal(validator.validateCollectionPng('white.png', png), expected);
    assert.notEqual(validator.validateCollectionPng('black.png', pixelPng(8, 0, [0])), expected);

    const transparent = validator.validateCollectionPng('transparent.png', transparentPng());
    for (const png of [pixelPng(8, 0, [255], [pngChunk('tRNS', Buffer.from([0, 255]))]),
        pixelPng(8, 2, [1, 2, 3], [pngChunk('tRNS', Buffer.from([0, 1, 0, 2, 0, 3]))]),
        pixelPng(8, 6, [100, 150, 200, 0])]) {
        assert.equal(validator.validateCollectionPng('transparent.png', png), transparent);
    }
});

test('PNG decoding preserves the specified tolerance for unused trailing final-IDAT bytes', () => {
    const valid = transparentPng();
    const size = valid.readUInt32BE(33);
    const payload = Buffer.concat([valid.subarray(0, 33),
        pngChunk('IDAT', Buffer.concat([valid.subarray(41, 41 + size), Buffer.from('unused')])),
        pngChunk('IEND', Buffer.alloc(0))]);
    const validator = new CollectionValidator();
    assert.equal(validator.validateCollectionPng('trailing.png', payload), validator.validateCollectionPng('original.png', valid));
});

test('collection rejects PNG icons with duplicate IHDR chunks', (t) => {
    const { root, packagePath } = makeRepository(t);
    const valid = transparentPng();
    const ihdr = valid.subarray(8, 33);
    fs.writeFileSync(join(packagePath, 'assets', 'icon.png'), Buffer.concat([valid.subarray(0, 33), ihdr, valid.subarray(33)]));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /valid PNG/);
});

test('collection rejects PNG icons with unknown critical chunks', (t) => {
    const { root, packagePath } = makeRepository(t);
    const valid = transparentPng();
    const malformed = Buffer.concat([valid.subarray(0, 33), pngChunk('ABCD', Buffer.alloc(0)), valid.subarray(33)]);
    fs.writeFileSync(join(packagePath, 'assets', 'icon.png'), malformed);
    assert.throws(() => new CollectionValidationService().validateRepository(root), /valid PNG/);
});

test('collection rejects PNG chunks with a lowercase reserved third byte', t => {
    const { root, packagePath } = makeRepository(t);
    const valid = transparentPng();
    const malformed = Buffer.concat([
        valid.subarray(0, 33),
        pngChunk('abcd', Buffer.alloc(0)),
        valid.subarray(33),
    ]);
    fs.writeFileSync(join(packagePath, 'assets', 'icon.png'), malformed);
    assert.throws(() => new CollectionValidationService().validateRepository(root), /valid PNG/);
});

test('collection rejects indexed PNG icons without a palette', (t) => {
    const { root, packagePath } = makeRepository(t);
    const icon = join(packagePath, 'assets', 'icon.png');
    fs.writeFileSync(icon, indexedPng());
    renderReceipt(packagePath);
    assert.equal(new CollectionValidationService().validateRepository(root).packages, 1);
    fs.writeFileSync(icon, indexedPng({ palette: false }));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /valid PNG/);
});

test('collection rejects indexed PNG pixels outside the palette', (t) => {
    const { root, packagePath } = makeRepository(t);
    const icon = join(packagePath, 'assets', 'icon.png');
    fs.writeFileSync(icon, indexedPng({ paletteEntries: 1, pixel: 1 }));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /valid PNG/);
    fs.writeFileSync(icon, indexedPng({ bitDepth: 1, paletteEntries: 1, pixel: 0x7f }));
    renderReceipt(packagePath);
    assert.equal(new CollectionValidationService().validateRepository(root).packages, 1);
});

test('collection binds each large icon to its recorded SVG render and detects valid-image swaps', (t) => {
    const { root, packagePath } = makeRepository(t);
    fs.writeFileSync(join(packagePath, 'assets/icon.png'), indexedPng());
    assert.throws(() => new CollectionValidationService().validateRepository(root), /render receipt does not match/);
    renderReceipt(packagePath);
    assert.doesNotThrow(() => new CollectionValidationService().validateRepository(root));
    fs.appendFileSync(join(packagePath, 'assets/icon.svg'), '\n');
    assert.throws(() => new CollectionValidationService().validateRepository(root), /render receipt does not match/);
});

test('collection rejects indexed PNG palettes that exceed the bit depth or PNG maximum', (t) => {
    const { root, packagePath } = makeRepository(t); const icon = join(packagePath, 'assets', 'icon.png');
    fs.writeFileSync(icon, indexedPng({ bitDepth: 1, paletteEntries: 3 }));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /valid PNG/);
    fs.writeFileSync(icon, indexedPng({ paletteEntries: 257 }));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /valid PNG/);
});

test('collection rejects palettes for grayscale PNG color types', (t) => {
    const { root, packagePath } = makeRepository(t); const icon = join(packagePath, 'assets', 'icon.png');
    const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8;
    const valid = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(Buffer.from([0, 0]))), pngChunk('IEND', Buffer.alloc(0))]);
    const palette = pngChunk('PLTE', Buffer.from([0, 0, 0]));
    fs.writeFileSync(icon, Buffer.concat([valid.subarray(0, 33), palette, valid.subarray(33)]));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /valid PNG/);
});

test('collection rejects IDAT chunks separated by ancillary PNG data', (t) => {
    const { root, packagePath } = makeRepository(t); const icon = join(packagePath, 'assets', 'icon.png');
    const valid = transparentPng(); const size = valid.readUInt32BE(33); const content = valid.subarray(41, 41 + size);
    const split = Buffer.concat([valid.subarray(0, 33), pngChunk('IDAT', content.subarray(0, 1)), pngChunk('tEXt', Buffer.from('key\0value')), pngChunk('IDAT', content.subarray(1)), valid.subarray(45 + size)]);
    fs.writeFileSync(icon, split);
    assert.throws(() => new CollectionValidationService().validateRepository(root), /valid PNG/);
});

test('collection rejects transparency chunks for alpha PNGs', (t) => {
    const { root, packagePath } = makeRepository(t);
    const valid = transparentPng();
    const malformed = Buffer.concat([valid.subarray(0, 33), pngChunk('tRNS', Buffer.alloc(0)), valid.subarray(33)]);
    fs.writeFileSync(join(packagePath, 'assets', 'icon.png'), malformed);
    assert.throws(() => new CollectionValidationService().validateRepository(root), /valid PNG/);
});

test('collection validates parsed OpenAI icon paths instead of YAML comments', (t) => {
    const { root, packagePath } = makeRepository(t);
    const metadata = join(packagePath, 'agents', 'openai.yaml');
    fs.copyFileSync(join(packagePath, 'assets', 'icon.svg'), join(packagePath, 'assets', 'alternate.svg'));
    fs.writeFileSync(metadata, fs.readFileSync(metadata, 'utf8').replace(
        '  icon_small: "./assets/icon.svg"',
        '# icon_small: "./assets/icon.svg"\n  icon_small: "./assets/alternate.svg"',
    ));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /required small SVG and large PNG icons/);
});

test('catalog rejects invalid identities, duplicate names, paths, and undeclared fields', () => {
    const value = {
        schema_version: 1, skills: [{
            name: 'example-skill', path: '.agents/skills/example-skill',
            description: 'Use for a synthetic example.', tags: [],
        }]
    };
    const files = new Set(['.agents/skills/example-skill/SKILL.md']);
    const directories = new Set(['.agents/skills/example-skill']);
    for (const [field, invalid] of [['name', 'example-skill\n'], ['name', '9-example'], ['path', 'skills/example-skill'], ['status', 'unknown']]) {
        const candidate = structuredClone(value);
        candidate.skills[0][field] = invalid;
        assert.throws(() => new CollectionValidator().validateCatalog(candidate, files, directories), CollectionValidationError);
    }
    value.skills.push({ ...value.skills[0] });
    assert.throws(() => new CollectionValidator().validateCatalog(value, files, directories), /distinct/);
});

test('the four reviewed aliases resolve links without double-counting packages or text', (t) => {
    const { root } = makeRepository(t);
    const beforeAliases = new CollectionValidationService().validateRepository(root);
    fs.appendFileSync(join(root, 'README.md'), '[Claude guidance](CLAUDE.md)\n[Gemini guidance](GEMINI.md)\n[Claude alias](.claude/skills/example-skill/SKILL.md)\n[GitHub alias](.github/skills/example-skill/SKILL.md)\n');
    assert.equal(new CollectionValidationService().validateRepository(root).local_links, beforeAliases.local_links + 4);
});

test('declared discovery aliases are required', (t) => {
    const { root } = makeRepository(t);
    fs.unlinkSync(join(root, 'CLAUDE.md'));
    assert.throws(() => new CollectionValidationService().validateRepository(root));
});

test('wrong targets and additional symlinks are rejected', (t) => {
    const { root } = makeRepository(t);
    fs.unlinkSync(join(root, 'CLAUDE.md'));
    fs.symlinkSync('README.md', join(root, 'CLAUDE.md'));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /unexpected alias target/);
    fs.unlinkSync(join(root, 'CLAUDE.md'));
    fs.symlinkSync('README.md', join(root, 'unexpected.md'));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /symlink is forbidden/);
});

test('root scratch is never read, while similarly named package directories are checked', (t) => {
    const { root, packagePath } = makeRepository(t);
    const sentinel = 'ghp_' + 'A'.repeat(36);
    const scratch = ['.work', 'tmp', 'node_modules', '.beads', '.codex/environments'].map((directory) => {
        fs.mkdirSync(join(root, directory), { recursive: true });
        const file = join(root, directory, 'private.txt');
        fs.writeFileSync(file, sentinel);
        return file;
    });
    guardContentReads(scratch, () => assert.equal(new CollectionValidationService().validateRepository(root).packages, 1));
    fs.mkdirSync(join(packagePath, 'tmp'));
    fs.writeFileSync(join(packagePath, 'tmp', 'private.txt'), sentinel);
    assert.throws(() => new CollectionValidationService().validateRepository(root), /possible GitHub credential/);
});

test('Codex source files remain in the public hygiene corpus', t => {
    const { root } = makeRepository(t);
    fs.mkdirSync(join(root, '.codex'));
    fs.writeFileSync(join(root, '.codex', 'hooks.json'), 'ghp_' + 'A'.repeat(36));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /possible GitHub credential/);
});

test('tracked root scratch is rejected without reading its contents or echoing its name', (t) => {
    const { root } = makeRepository(t);
    fixtureGit(root, 'init', '-q');
    fs.mkdirSync(join(root, '.work'));
    const scratch = join(root, '.work', 'synthetic-private-name.txt');
    fs.writeFileSync(scratch, 'Synthetic private scratch.\n');
    fixtureGit(root, 'add', '--', '.work');
    guardContentReads([scratch], () => assert.throws(() => new CollectionValidationService().validateRepository(root), (error) => {
        assert.match(error.message, /must not be tracked/);
        assert.ok(!error.message.includes('synthetic-private-name'));
        return true;
    }));
});

test('tracked Beads state is rejected even though its directory is skipped', t => {
    const { root } = makeRepository(t);
    fixtureGit(root, 'init', '-q');
    fs.mkdirSync(join(root, '.beads'));
    fs.writeFileSync(join(root, '.beads', 'state.json'), '{}\n');
    fixtureGit(root, 'add', '-f', '--', '.beads/state.json');
    assert.throws(() => new CollectionValidationService().validateRepository(root), /must not be tracked/);
});

test('cache-named directories do not bypass the publication hygiene corpus', (t) => {
    const { root, packagePath } = makeRepository(t);
    const sentinel = 'ghp_' + 'A'.repeat(36);
    for (const directory of [join(packagePath, '__pycache__'), join(root, '.venv'), join(root, '.pytest_cache')]) {
        fs.mkdirSync(directory);
        const file = join(directory, 'synthetic.txt');
        fs.writeFileSync(file, sentinel);
        assert.throws(() => new CollectionValidationService().validateRepository(root), /possible GitHub credential/);
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
    try { assert.throws(() => new CollectionValidationService().validateRepository(root), /must not be tracked/); }
    finally {
        if (previous === undefined) delete process.env.GIT_INDEX_FILE;
        else process.env.GIT_INDEX_FILE = previous;
    }
});

test('public hygiene identifies location and category without echoing sensitive-looking bytes', () => {
    for (const content of ['ghp_' + 'A'.repeat(36), '-----BEGIN ' + 'PRIVATE KEY-----',
    '/' + 'Users' + '/example/data', '/' + 'root' + '/.config/tool', '/' + 'workspace' + '/private-project', 'https://' + 'user:pass' + '@example.org']) {
        assert.throws(() => new CollectionValidator().checkPublicHygiene('example.txt', `Heading\n${content}`), (error) => {
            assert.match(error.message, /example\.txt:2: possible/);
            assert.ok(!error.message.includes(content));
            return true;
        });
    }
});

test('public hygiene scans binary payloads without requiring UTF-8 decoding', (t) => {
    const { root } = makeRepository(t);
    const artifact = join(root, 'artifact.bin');
    const baseline = new CollectionValidationService().validateRepository(root);
    fs.writeFileSync(artifact, Buffer.from([0xff, 0x00, 0x80]));
    assert.deepEqual(new CollectionValidationService().validateRepository(root), baseline);
    const token = 'ghp_' + 'A'.repeat(36);
    fs.writeFileSync(artifact, Buffer.concat([Buffer.from([0xff, 0x00]), Buffer.from(token, 'ascii')]));
    assert.throws(() => new CollectionValidationService().validateRepository(root), (error) => {
        assert.match(error.message, /artifact\.bin:1: possible GitHub credential/);
        assert.ok(!error.message.includes(token));
        return true;
    });
});

test('public hygiene scans UTF-16 byte orders with or without BOM without echoing markers', (t) => {
    const { root } = makeRepository(t);
    const artifact = join(root, 'artifact.bin');
    for (const marker of ['ghp_' + 'A'.repeat(36), '-----BEGIN ' + 'PRIVATE KEY-----']) {
        const little = Buffer.from(`Heading\n${marker}`, 'utf16le');
        const big = Buffer.from(little).swap16();
        for (const payload of [little, big, Buffer.concat([Buffer.from([0xff, 0xfe]), little]),
            Buffer.concat([Buffer.from([0xfe, 0xff]), big]), Buffer.concat([Buffer.from([0xff]), little])]) {
            fs.writeFileSync(artifact, payload);
            assert.throws(() => new CollectionValidationService().validateRepository(root), error => {
                assert.match(error.message, /artifact\.bin:2: possible/);
                assert.ok(!error.message.includes(marker));
                return true;
            });
        }
    }
});

test('documentation publication verifies inputs before staging and publishing main', () => {
    const workflow = fs.readFileSync(join(process.cwd(), '.github', 'workflows', 'publish-visual-guides.yml'), 'utf8');
    assert.match(workflow, /concurrency:\n\s+group: publish-visual-guides-\$\{\{ github\.repository \}\}\n\s+cancel-in-progress: false/);
    assert.match(workflow, /with:\n\s+ref: main\n\s+persist-credentials: false/);
    assert.match(workflow, /git add --all\n\s+if git diff --quiet --staged; then/);
    const verification = workflow.indexOf("new VisualGuideRepository().verify('.')");
    assert.ok(verification > 0, 'visual-guide verification must run');
    assert.ok(verification < workflow.indexOf('GITHUB_TOKEN:'), 'verify before configuring publication credentials');
    assert.ok(verification < workflow.indexOf('rsync -a'), 'verify before copying publishable assets');
    assert.doesNotMatch(workflow, /continue-on-error:/);
    assert.match(workflow, /node-version: '24'/);
    const wikiWorkflow = fs.readFileSync(join(process.cwd(), '.github', 'workflows', 'sync-wiki.yml'), 'utf8');
    assert.match(wikiWorkflow, /concurrency:\n\s+group: sync-wiki-\$\{\{ github\.repository \}\}\n\s+cancel-in-progress: false/);
    assert.match(wikiWorkflow, /with:\n\s+ref: main\n\s+persist-credentials: false/);
    assert.match(wikiWorkflow, /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
    assert.match(wikiWorkflow, /gh api "repos\/\$\{GITHUB_REPOSITORY\}" --jq '\.has_wiki'/);
    assert.match(wikiWorkflow, /clone --depth 1 "https:\/\/github\.com\/\$\{REPOSITORY\}\.wiki\.git"/);
    assert.match(wikiWorkflow, /node-version: '24'/);
    const synchronize = wikiWorkflow.indexOf("new WikiMirrorRepository().synchronize('docs', '.wiki', process.env.REPOSITORY)");
    assert.ok(synchronize > wikiWorkflow.indexOf('clone --depth 1'), 'synchronize after cloning');
    assert.ok(synchronize < wikiWorkflow.indexOf('git add --all'), 'synchronize before staging');
    assert.match(wikiWorkflow, /git add --all\n\s+if git diff --quiet --staged; then/);
});

test('portable catalog helper does not impose repository-specific AGENTS wording', (t) => {
    const { root } = makeRepository(t);
    fs.writeFileSync(join(root, 'AGENTS.md'), 'Maintain the application using the owner\'s local process.\n');
    const result = spawnSync(process.execPath, [join(process.cwd(), '.agents', 'skills', 'skills-catalog', 'scripts', 'catalog_tools.mjs'), 'check', root], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(syncCatalog(root).changed, false);
});

test('catalog helper rejects a parallel legacy manifest name', (t) => {
    const { root } = makeRepository(t);
    fs.writeFileSync(join(root, 'catalog.json'), '{}\n');
    const result = spawnSync(process.execPath, [join(process.cwd(), '.agents', 'skills', 'skills-catalog', 'scripts', 'catalog_tools.mjs'), 'check', root], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /legacy catalog\.json must be removed/);
});

test('catalog synchronization preserves readable permissions', (t) => {
    const { root, packagePath } = makeRepository(t);
    const catalog = join(root, 'skills-catalog.json');
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
    assert.equal(new CollectionValidator().validateLock(lock, new Set(['example-skill'])), 1);
    writeJson(join(root, 'upstreams.lock.json'), lock);
    assert.equal(new CollectionValidationService().validateRepository(root).locked_sources, 1);
    for (const [key, value] of [['package_sha256', 'c'.repeat(64)], ['revision', 'main'],
    ['consumers', ['missing-skill']], ['consumers', ['example-skill', 'example-skill']],
    ['files', [{ path: '../SKILL.md', sha256: 'a'.repeat(64) }]],
    ['revision', 'a'.repeat(40) + '\n'], ['license', 'TBD'], ['license', ' TBD '], ['license_sha256', 'b'.repeat(64) + '\n'],
    ['files', [{ path: 'SKILL.md', sha256: 'a'.repeat(64) + '\n' }]]]) {
        const invalid = structuredClone(lock);
        invalid.sources[0][key] = value;
        assert.throws(() => new CollectionValidator().validateLock(invalid, new Set(['example-skill'])), CollectionValidationError);
    }
    for (const repository of ['https://localhost/private', 'https://127.0.0.1/private', 'https://10.1.2.3/private', 'https://[fd00::1]/private',
        'https://192.0.2.1/repo', 'https://198.51.100.1/repo', 'https://203.0.113.1/repo',
        'https://[2001:db8::1]/repo', 'https://[3fff::1]/repo',
        'https://localhost./repo', 'https://service.local./repo', 'https://service.localhost./repo', 'https://intranet./repo',
        'https://example..org/repo', 'https://-invalid.example/repo', 'https://invalid_.example/repo']) {
        const invalid = structuredClone(lock); invalid.sources[0].repository = repository;
        assert.throws(() => new CollectionValidator().validateLock(invalid, new Set(['example-skill'])), CollectionValidationError);
    }
    const absoluteDnsName = structuredClone(lock);
    absoluteDnsName.sources[0].repository = 'https://example.org./repository';
    assert.equal(new CollectionValidator().validateLock(absoluteDnsName, new Set(['example-skill'])), 1);
    absoluteDnsName.sources[0].repository = 'https://8.8.8.8/repository';
    assert.equal(new CollectionValidator().validateLock(absoluteDnsName, new Set(['example-skill'])), 1);
});

test('source aggregate hashes use sorted relative UTF-8 paths regardless of inventory order', () => {
    const lock = makeLock();
    const files = ['references/z.md', 'SKILL.md', 'references/α.md'].map((path) => ({ path, sha256: sha256(path) }));
    lock.sources[0].files = files;
    const sorted = [...files].sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
    lock.sources[0].package_sha256 = sha256(sorted.map(({ path, sha256: digest }) => `${path}\0${digest}\n`).join(''));
    assert.equal(new CollectionValidator().validateLock(lock, new Set(['example-skill'])), 1);
    files.reverse();
    assert.equal(new CollectionValidator().validateLock(lock, new Set(['example-skill'])), 1);
    files.push({ ...files[0] });
    assert.throws(() => new CollectionValidator().validateLock(lock, new Set(['example-skill'])), /distinct/);
});

test('source locks reject contradictory hashes for an inventoried license', () => {
    const lock = makeLock();
    const source = lock.sources[0];
    source.license_path = `${source.package_path}/LICENSE`;
    source.files.push({ path: 'LICENSE', sha256: source.license_sha256 });
    source.package_sha256 = sha256([...source.files].sort((a, b) => a.path.localeCompare(b.path))
        .map(({ path, sha256: digest }) => `${path}\0${digest}\n`).join(''));
    assert.equal(new CollectionValidator().validateLock(lock, new Set(['example-skill'])), 1);
    source.license_sha256 = 'c'.repeat(64);
    assert.throws(() => new CollectionValidator().validateLock(lock, new Set(['example-skill'])), /contradicts/);
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
        schema_version: 2, run_id: 'example-run', goal: 'Produce one synthetic example.', target_skill: 'example-skill',
        status: 'validated', sources: ['alpha', 'beta'].map((id) => ({
            id, uri: `urn:example:${id}`, revision: 'synthetic-v1', license: 'CC0-1.0', reuse: 'pattern',
        })), stages,
    });
    assert.equal(new CollectionValidationService().validateRepository(root).example_runs, 1);
    fs.appendFileSync(join(run, stages[0].artifacts[0].path), 'Changed evidence.\n');
    assert.throws(() => new CollectionValidationService().validateRepository(root), /(?:digest|sha256|hash)/i);
});

test('Markdown corpus reads remain bounded and dangling local links fail', (t) => {
    const { root } = makeRepository(t);
    fs.writeFileSync(join(root, 'guide.md'), '[Missing](missing.md)\n');
    assert.throws(() => new CollectionValidationService().validateRepository(root));
    fs.writeFileSync(join(root, 'guide.md'), 'x'.repeat(LIMITS.textBytes + 1));
    assert.throws(() => new CollectionValidationService().validateRepository(root), /Markdown exceeds text limit/);
});
