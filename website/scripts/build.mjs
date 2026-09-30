import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { categories, languages, messages } from '../content.mjs';
import { escapeHtml, renderPage } from '../render.mjs';

const buildMarker = '.i9-site-build.json';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inside = (root, candidate) => candidate === root || candidate.startsWith(root + path.sep);

function entry(filename) {
    try {
        return fs.lstatSync(filename);
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
}

// Reserved source names are protected in every case spelling, including on
// case-sensitive hosts. This avoids probing or writing to detect volume rules.
const protectedPath = (filename) => filename.normalize('NFC').toLowerCase();

function regularFile(filename, maximum = 5 * 1024 * 1024) {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum) {
        throw new Error('Expected a bounded regular file: ' + path.basename(filename));
    }
    return fs.readFileSync(filename);
}

function assertNoLinks(filename) {
    let current = path.resolve(filename);
    while (current !== path.dirname(current)) {
        if (entry(current)?.isSymbolicLink()) {
            throw new Error('Symbolic links are not allowed in output paths');
        }
        current = path.dirname(current);
    }
}

function sourceFile(root, relative, maximum) {
    const filename = path.resolve(root, relative);
    if (!inside(root, filename)) throw new Error('Source path escapes the project');
    assertNoLinks(filename);
    return regularFile(filename, maximum);
}

function messageShape(value) {
    if (Array.isArray(value)) return value.map(messageShape);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, messageShape(value[key])]),
        );
    }
    return typeof value;
}

export function validateLocales() {
    const reference = JSON.stringify(messageShape(messages.en));
    for (const language of languages) {
        if (JSON.stringify(messageShape(messages[language.key])) !== reference) {
            throw new Error('Locale key coverage differs: ' + language.key);
        }
    }
}

export function validateCatalog(catalog, categoryMap = categories) {
    if (
        catalog.schema_version !== 1 ||
        !Array.isArray(catalog.skills) ||
        !catalog.skills.length ||
        catalog.skills.length > 500
    ) {
        throw new Error('Invalid or unbounded catalog');
    }
    const assignment = new Map();
    for (const [category, names] of Object.entries(categoryMap)) {
        if (!Object.hasOwn(messages.en.catalog.categories, category) || !Array.isArray(names)) {
            throw new Error('Invalid category');
        }
        for (const name of names) {
            if (assignment.has(name)) throw new Error('Duplicate category membership: ' + name);
            assignment.set(name, category);
        }
    }
    const observed = new Set();
    const skills = catalog.skills.map((skill) => {
        if (
            typeof skill.name !== 'string' ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name) ||
            observed.has(skill.name)
        ) {
            throw new Error('Invalid or duplicate skill name');
        }
        if (
            skill.path !== '.agents/skills/' + skill.name ||
            typeof skill.description !== 'string' ||
            !skill.description.trim() ||
            skill.description.length > 3000
        ) {
            throw new Error('Invalid skill path or description');
        }
        if (
            skill.tags !== undefined &&
            (!Array.isArray(skill.tags) ||
                skill.tags.length > 50 ||
                skill.tags.some((tag) => typeof tag !== 'string' || tag.length > 120))
        ) {
            throw new Error('Invalid skill tags');
        }
        if (!assignment.has(skill.name))
            throw new Error('Missing category membership: ' + skill.name);
        observed.add(skill.name);
        return { ...skill, category: assignment.get(skill.name) };
    });
    for (const name of assignment.keys()) {
        if (!observed.has(name)) throw new Error('Category names a missing skill: ' + name);
    }
    return skills;
}

function safeRelative(relative) {
    return (
        typeof relative === 'string' &&
        relative.length < 240 &&
        !relative.startsWith('/') &&
        !relative.includes('\\') &&
        relative.split('/').every((part) => part && part !== '.' && part !== '..')
    );
}

function inspectOutput(output, files) {
    assertNoLinks(output);
    const outputEntry = entry(output);
    if (!outputEntry) return {};
    if (!outputEntry.isDirectory()) throw new Error('Output must be a directory');
    if (!fs.readdirSync(output).length) return {};
    const markerFile = path.join(output, buildMarker);
    if (!entry(markerFile)) throw new Error('Existing output is not an owned site build');
    const previous = JSON.parse(regularFile(markerFile, 256 * 1024));
    if (
        previous.kind !== 'i9-skills-local-site' ||
        previous.schemaVersion !== 1 ||
        !previous.files ||
        typeof previous.files !== 'object'
    ) {
        throw new Error('Invalid build ownership marker');
    }
    for (const [relative, digest] of Object.entries(previous.files)) {
        if (!safeRelative(relative) || !/^[a-f0-9]{64}$/.test(digest))
            throw new Error('Unsafe build ownership entry');
        const target = path.join(output, relative);
        assertNoLinks(target);
        if (!entry(target) || hash(regularFile(target)) !== digest) {
            throw new Error(
                'Previously generated output was changed; preserve it before rebuilding',
            );
        }
    }
    for (const relative of files.keys()) {
        const target = path.join(output, relative);
        assertNoLinks(target);
        if (entry(target) && !Object.hasOwn(previous.files, relative)) {
            throw new Error('Output conflicts with an unowned file');
        }
    }
    return previous.files;
}

function assertSafeSvg(bytes) {
    const svg = bytes.toString('utf8');
    if (
        !/<svg[\s>]/i.test(svg) ||
        /<(?:script|foreignObject|iframe|object|embed)\b|<!DOCTYPE|<!ENTITY|\bon[a-z]+\s*=|(?:href|src)\s*=\s*["'](?!#)|url\s*\(\s*(?!#)/i.test(
            svg,
        )
    ) {
        throw new Error('Skill icon contains active or external content');
    }
}

function publicOrigin(value) {
    if (value === null || value === undefined) return null;
    const url = new URL(value);
    if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
    ) {
        throw new Error(
            'Public URL must be an HTTPS origin without credentials, path, query or fragment',
        );
    }
    return url.origin + '/';
}

export function buildSite({
    projectRoot = fileURLToPath(new URL('../../', import.meta.url)),
    outputDirectory,
    categoryMap = categories,
    publicUrl = null,
} = {}) {
    const origin = publicOrigin(publicUrl);
    const root = fs.realpathSync(projectRoot);
    const output = path.resolve(root, outputDirectory ?? '.work/website-preview');
    const blocked = [
        'website',
        'src',
        'tests',
        'bin',
        'plans',
        'docs',
        'dist',
        'node_modules',
        '.agents',
        '.git',
        '.github',
        '.changeset',
        '.codex',
        '.claude',
        '.codex-plugin',
        '.claude-plugin',
        '.beads',
        '.pages',
    ].map((relative) => protectedPath(path.resolve(root, relative)));
    const outputKey = protectedPath(output);
    if (
        outputKey === protectedPath(root) ||
        blocked.some((scope) => inside(scope, outputKey) || inside(outputKey, scope))
    ) {
        throw new Error('Output would overwrite source or published guide state');
    }
    validateLocales();
    const catalogBytes = sourceFile(root, 'skills-catalog.json', 1024 * 1024);
    const skills = validateCatalog(JSON.parse(catalogBytes), categoryMap);
    const files = new Map();
    files.set(
        'index.html',
        Buffer.from(renderPage({ locale: 'en', rootPage: true, skills, publicUrl: origin })),
    );
    for (const language of languages) {
        files.set(
            language.key + '/index.html',
            Buffer.from(renderPage({ locale: language.key, skills, publicUrl: origin })),
        );
    }
    for (const name of [
        'site.css',
        'site.mjs',
        'catalog-state.mjs',
        'language-state.mjs',
        'hero-packages.webp',
    ]) {
        files.set('assets/' + name, sourceFile(root, 'website/assets/' + name));
    }
    for (const skill of skills) {
        const bytes = sourceFile(root, skill.path + '/assets/icon.svg', 128 * 1024);
        assertSafeSvg(bytes);
        files.set('assets/icons/' + skill.name + '.svg', bytes);
    }
    files.set(
        'robots.txt',
        Buffer.from(
            origin
                ? 'User-agent: *\nAllow: /\nSitemap: ' + origin + 'sitemap.xml\n'
                : 'User-agent: *\nDisallow: /\n',
        ),
    );
    if (origin) {
        const entries = languages
            .map(
                (language) =>
                    '<url><loc>' +
                    escapeHtml(new URL(language.key + '/', origin).href) +
                    '</loc></url>',
            )
            .join('');
        files.set(
            'sitemap.xml',
            Buffer.from(
                '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
                    entries +
                    '</urlset>\n',
            ),
        );
    }
    const previous = inspectOutput(output, files);
    const manifest = {
        schemaVersion: 1,
        kind: 'i9-skills-local-site',
        catalogSha256: hash(catalogBytes),
        skillCount: skills.length,
        languages: languages.map((language) => language.key),
        mode: origin ? 'production' : 'review',
        publicUrl: origin,
        publication: 'not-deployed',
        files: Object.fromEntries([...files].map(([relative, bytes]) => [relative, hash(bytes)])),
    };
    // All content and ownership checks finish before any output mutation.
    fs.mkdirSync(output, { recursive: true });
    for (const [relative, bytes] of files) {
        const target = path.join(output, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const temporary = target + '.tmp-' + randomUUID();
        try {
            fs.writeFileSync(temporary, bytes, { flag: 'wx' });
            fs.renameSync(temporary, target);
        } finally {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
    }
    for (const relative of Object.keys(previous)) {
        if (!files.has(relative)) fs.unlinkSync(path.join(output, relative));
    }
    const markerTarget = path.join(output, buildMarker);
    const temporaryMarker = markerTarget + '.tmp-' + randomUUID();
    try {
        fs.writeFileSync(temporaryMarker, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
        fs.renameSync(temporaryMarker, markerTarget);
    } finally {
        if (fs.existsSync(temporaryMarker)) fs.unlinkSync(temporaryMarker);
    }
    return { outputDirectory: output, ...manifest };
}

function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
        process.stdout.write(
            'Build the I-9 Skills static site.\nUsage: node website/scripts/build.mjs [--out-dir DIRECTORY] [--public-url HTTPS_ORIGIN]\nDefault: .work/website-preview, review indexing. I9_SITE_PUBLIC_URL selects production metadata; never deploys or overwrites source.\n',
        );
        return;
    }
    const options = { publicUrl: process.env.I9_SITE_PUBLIC_URL };
    const setters = {
        '--out-dir': (value) => {
            options.outputDirectory = value;
        },
        '--public-url': (value) => {
            options.publicUrl = value;
        },
    };
    const seen = new Set();
    for (let index = 0; index < args.length; index += 2) {
        const option = args[index];
        const value = args[index + 1];
        if (
            !Object.hasOwn(setters, option) ||
            !value ||
            value.startsWith('--') ||
            seen.has(option)
        ) {
            throw new Error('Use --help for the supported arguments');
        }
        seen.add(option);
        setters[option](value);
    }
    const result = buildSite(options);
    process.stdout.write(
        JSON.stringify(
            {
                outputDirectory: result.outputDirectory,
                skillCount: result.skillCount,
                languages: result.languages,
                catalogSha256: result.catalogSha256,
                mode: result.mode,
                publicUrl: result.publicUrl,
                publication: result.publication,
            },
            null,
            2,
        ) + '\n',
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        process.stderr.write(error.message + '\n');
        process.exitCode = 1;
    }
}
