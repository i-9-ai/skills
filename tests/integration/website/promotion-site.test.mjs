import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { categories, messages } from '../../../website/content.mjs';
import { buildSite, validateCatalog } from '../../../website/scripts/build.mjs';
import { createPreviewServer } from '../../../website/scripts/preview.mjs';
import { formatSkillCount, matchesSkill } from '../../../website/assets/catalog-state.mjs';
import { languageDestination, suggestLanguage } from '../../../website/assets/language-state.mjs';

function fixture(t) {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'i9-site-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'website/assets'), { recursive: true });
    for (const name of [
        'site.css',
        'site.mjs',
        'catalog-state.mjs',
        'language-state.mjs',
        'hero-packages.webp',
    ]) {
        fs.writeFileSync(path.join(root, 'website/assets', name), 'synthetic ' + name);
    }
    const catalog = {
        schema_version: 1,
        skills: Object.values(categories)
            .flat()
            .map((name) => ({
                name,
                path: '.agents/skills/' + name,
                description:
                    'Synthetic responsibility for ' + name + ' <img src="x" onerror="sentinel">',
                tags: ['synthetic'],
            })),
    };
    for (const skill of catalog.skills) {
        const iconDirectory = path.join(root, skill.path, 'assets');
        fs.mkdirSync(iconDirectory, { recursive: true });
        fs.writeFileSync(
            path.join(iconDirectory, 'icon.svg'),
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>',
        );
    }
    const catalogFile = path.join(root, 'skills-catalog.json');
    const writeCatalog = () => fs.writeFileSync(catalogFile, JSON.stringify(catalog));
    writeCatalog();
    const output = path.join(root, 'review-output');
    return {
        root,
        output,
        catalog,
        writeCatalog,
        build: () => buildSite({ projectRoot: root, outputDirectory: output }),
    };
}

function artifactBytes(output) {
    const manifest = JSON.parse(fs.readFileSync(path.join(output, '.i9-site-build.json'), 'utf8'));
    return Object.fromEntries(
        Object.keys(manifest.files).map((name) => [
            name,
            fs.readFileSync(path.join(output, name)).toString('base64'),
        ]),
    );
}

test('build renders every canonical package in all locales, escapes source data and remains deterministic', (t) => {
    const f = fixture(t);
    const result = f.build();
    assert.equal(result.skillCount, 24);
    assert.equal(result.publication, 'not-deployed');
    assert.equal(result.mode, 'review');
    assert.equal(result.publicUrl, null);
    for (const [file, locale] of [
        ['index.html', 'en'],
        ['en/index.html', 'en'],
        ['pt-br/index.html', 'pt-br'],
        ['es/index.html', 'es'],
    ]) {
        const html = fs.readFileSync(path.join(f.output, file), 'utf8');
        assert.equal(html.includes('data-language-suggestion='), file === 'index.html');
        assert.equal((html.match(/data-skill=/g) ?? []).length, 24);
        assert.equal((html.match(/<h1/g) ?? []).length, 1);
        assert.ok(html.includes(messages[locale].hero.title));
        assert.ok(html.includes('lang="' + (locale === 'pt-br' ? 'pt-BR' : locale) + '"'));
        assert.ok(html.includes('&lt;img src=&quot;x&quot; onerror=&quot;sentinel&quot;&gt;'));
        assert.ok(!html.includes('<img src="x"'));
        assert.ok(html.includes('class="catalog-controls" hidden'));
        assert.ok(html.includes('type="module"'));
        assert.ok(html.includes('data-count-singular="' + messages[locale].catalog.singular + '"'));
        assert.ok(html.includes('name="robots" content="noindex"'));
        assert.ok(
            html.includes('id="workflow"') &&
                html.includes('id="catalog"') &&
                html.includes('id="install"'),
        );
        const prefix = file === 'index.html' ? './' : '../';
        assert.ok(html.includes('href="' + prefix + 'pt-br/"'));
        assert.ok(html.includes('src="' + prefix + 'assets/site.mjs"'));
        if (locale !== 'en') assert.ok(html.includes(messages[locale].catalog.sourceDescription));
    }
    const before = artifactBytes(f.output);
    const second = f.build();
    assert.deepEqual(second.files, result.files);
    assert.deepEqual(artifactBytes(f.output), before);
    assert.equal(
        fs.readFileSync(path.join(f.output, 'robots.txt'), 'utf8'),
        'User-agent: *\nDisallow: /\n',
    );
});

test('production metadata uses the selected HTTPS origin and review rebuild removes public sitemap', (t) => {
    const f = fixture(t);
    const options = {
        projectRoot: f.root,
        outputDirectory: f.output,
        publicUrl: 'https://example.test',
    };
    const production = buildSite(options);
    assert.equal(production.mode, 'production');
    assert.equal(production.publication, 'not-deployed');
    for (const locale of ['en', 'pt-br', 'es']) {
        const html = fs.readFileSync(path.join(f.output, locale, 'index.html'), 'utf8');
        assert.ok(html.includes('rel="canonical" href="https://example.test/' + locale + '/"'));
        assert.ok(html.includes('name="robots" content="index, follow"'));
        assert.ok(html.includes('hreflang="pt-BR" href="https://example.test/pt-br/"'));
        assert.ok(
            html.includes(
                'property="og:image" content="https://example.test/assets/hero-packages.webp"',
            ),
        );
        assert.ok(!html.includes('class="preview-notice"'));
    }
    assert.ok(
        fs
            .readFileSync(path.join(f.output, 'index.html'), 'utf8')
            .includes('rel="canonical" href="https://example.test/en/"'),
    );
    const sitemap = fs.readFileSync(path.join(f.output, 'sitemap.xml'), 'utf8');
    assert.equal((sitemap.match(/<loc>/g) ?? []).length, 3);
    assert.ok(sitemap.includes('<loc>https://example.test/es/</loc>'));
    assert.equal(
        fs.readFileSync(path.join(f.output, 'robots.txt'), 'utf8'),
        'User-agent: *\nAllow: /\nSitemap: https://example.test/sitemap.xml\n',
    );
    assert.deepEqual(buildSite(options).files, production.files);
    f.build();
    assert.ok(!fs.existsSync(path.join(f.output, 'sitemap.xml')));
    assert.ok(
        fs.readFileSync(path.join(f.output, 'index.html'), 'utf8').includes('content="noindex"'),
    );
});

test('invalid public URLs are rejected before creating output', (t) => {
    const f = fixture(t);
    const authenticated = new URL('https://example.test');
    authenticated.username = 'synthetic';
    authenticated.password = ['fixture', 'sentinel'].join('-');
    for (const publicUrl of [
        'http://example.test',
        authenticated.href,
        'https://example.test/site/',
        'https://example.test/?q=1',
        'https://example.test/#fragment',
        'not-a-url',
        '',
    ]) {
        assert.throws(() =>
            buildSite({ projectRoot: f.root, outputDirectory: f.output, publicUrl }),
        );
        assert.ok(!fs.existsSync(f.output));
    }
});

test('rebuild preserves an unowned dangling output symlink before any mutation', (t) => {
    const f = fixture(t);
    f.build();
    const before = artifactBytes(f.output);
    const symlink = path.join(f.output, 'sitemap.xml');
    const target = path.join(f.root, 'missing-caller-document');
    fs.symlinkSync(target, symlink);
    assert.equal(fs.existsSync(symlink), false);
    assert.throws(
        () =>
            buildSite({
                projectRoot: f.root,
                outputDirectory: f.output,
                publicUrl: 'https://example.test',
            }),
        /Symbolic links/,
    );
    assert.equal(fs.lstatSync(symlink).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(symlink), target);
    assert.deepEqual(artifactBytes(f.output), before);
    const danglingDirectory = path.join(f.root, 'dangling-output');
    fs.symlinkSync(path.join(f.root, 'missing-output-directory'), danglingDirectory);
    assert.throws(
        () => buildSite({ projectRoot: f.root, outputDirectory: danglingDirectory }),
        /Symbolic links/,
    );
    assert.equal(fs.lstatSync(danglingDirectory).isSymbolicLink(), true);
});

test('case aliases cannot bypass protected source, staging or ancestor paths', (t) => {
    const f = fixture(t);
    for (const outputDirectory of [
        'WEBSITE/review',
        'DOCS/review',
        '.PAGES/review',
        'SRC/review',
        f.root.toUpperCase(),
    ]) {
        assert.throws(
            () => buildSite({ projectRoot: f.root, outputDirectory }),
            /overwrite source/,
        );
    }
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'website')).sort(), ['assets']);
    for (const name of ['DOCS', 'docs', '.PAGES', '.pages', 'SRC', 'src']) {
        assert.ok(!fs.existsSync(path.join(f.root, name)));
    }
});

test('search matches responsibilities and categories, and announces singular or plural in every locale', () => {
    const skills = [
        { category: 'manage', search: 'skills-snapshot Snapshot síntético' },
        { category: 'evaluate', search: 'skill-evaluator Evaluate behavior' },
    ];
    const found = skills.filter((skill) => matchesSkill(skill, 'SNAPSHOT', 'all')).length;
    assert.equal(found, 1);
    assert.equal(matchesSkill(skills[0], 'sintetico', 'manage'), true);
    assert.equal(matchesSkill(skills[0], 'snapshot', 'evaluate'), false);
    assert.equal(skills.filter((skill) => matchesSkill(skill, 'clock', 'all')).length, 0);
    for (const message of Object.values(messages)) {
        const { singular, count: plural } = message.catalog;
        assert.equal(formatSkillCount(found, singular, plural), '1 skill');
        assert.equal(formatSkillCount(0, singular, plural), '0 skills');
        assert.equal(formatSkillCount(24, singular, plural), '24 skills');
    }
});

test('catalog drift, duplicates, unsafe paths and malformed tags fail before output is created', (t) => {
    const f = fixture(t);
    const altered = structuredClone(f.catalog);
    altered.skills.push({
        name: 'skill-new-responsibility',
        path: '.agents/skills/skill-new-responsibility',
        description: 'New',
    });
    assert.throws(() => validateCatalog(altered), /Missing category/);
    const duplicate = structuredClone(f.catalog);
    duplicate.skills.push(duplicate.skills[0]);
    assert.throws(() => validateCatalog(duplicate), /duplicate skill name/);
    const unsafe = structuredClone(f.catalog);
    unsafe.skills[0].path = '../outside';
    assert.throws(() => validateCatalog(unsafe), /Invalid skill path/);
    const tags = structuredClone(f.catalog);
    tags.skills[0].tags = [true];
    assert.throws(() => validateCatalog(tags), /Invalid skill tags/);
    const duplicateMembership = structuredClone(categories);
    duplicateMembership.manage.push(duplicateMembership.create[0]);
    assert.throws(() => validateCatalog(f.catalog, duplicateMembership), /Duplicate category/);
    f.catalog.skills[0].path = '/outside';
    f.writeCatalog();
    assert.throws(f.build, /Invalid skill path/);
    assert.ok(!fs.existsSync(f.output));
});

test('language suggestions honor explicit routes and browser priority without redirecting', () => {
    const availableLocales = ['en', 'pt-br', 'es'];
    const suggest = (pathname, preferredLanguages) =>
        suggestLanguage({ pathname, preferredLanguages, availableLocales });

    assert.equal(suggest('/', ['pt-BR', 'en']), 'pt-br');
    assert.equal(suggest('/index.html', ['pt-PT']), 'pt-br');
    assert.equal(suggest('/', ['es-MX']), 'es');
    assert.equal(suggest('/', ['fr-FR', 'es']), 'es');
    assert.equal(suggest('/', ['en-US', 'pt-BR']), null);
    assert.equal(suggest('/', ['fr-FR']), null);
    assert.equal(suggest('/', []), null);
    for (const route of ['/en', '/en/', '/pt-br/', '/es/index.html', '/unknown/']) {
        assert.equal(suggest(route, ['pt-BR', 'es']), null);
    }

    assert.equal(
        languageDestination('https://example.test/?q=snapshot&category=manage#catalog', 'pt-br'),
        'https://example.test/pt-br/?q=snapshot&category=manage#catalog',
    );
    assert.equal(
        languageDestination('https://example.test/index.html?q=clock#install', 'es'),
        'https://example.test/es/?q=clock#install',
    );
    assert.throws(
        () => languageDestination('https://example.test/', '//another.test'),
        /Invalid language route/,
    );
});

test('build refuses source targets and unowned or modified output, preserving all prior data', (t) => {
    const f = fixture(t);
    assert.throws(
        () => buildSite({ projectRoot: f.root, outputDirectory: 'website' }),
        /overwrite source/,
    );
    assert.throws(
        () => buildSite({ projectRoot: f.root, outputDirectory: 'docs/assets' }),
        /overwrite source/,
    );
    assert.throws(
        () => buildSite({ projectRoot: f.root, outputDirectory: f.root }),
        /overwrite source/,
    );
    fs.mkdirSync(f.output);
    fs.writeFileSync(path.join(f.output, 'sentinel.txt'), 'caller-owned content');
    assert.throws(f.build, /not an owned/);
    assert.equal(
        fs.readFileSync(path.join(f.output, 'sentinel.txt'), 'utf8'),
        'caller-owned content',
    );
    fs.unlinkSync(path.join(f.output, 'sentinel.txt'));
    f.build();
    const index = path.join(f.output, 'index.html');
    fs.writeFileSync(index, 'modified by caller');
    const before = artifactBytes(f.output);
    assert.throws(f.build, /Previously generated output was changed/);
    assert.deepEqual(artifactBytes(f.output), before);
});

for (const scope of [
    'src/site-preview',
    'tests/site-preview',
    '.github/site-preview',
    '.pages/site-preview',
    '.pages',
    'docs/site-preview',
]) {
    for (const state of ['missing', 'empty']) {
        test(`build preserves the ${state} reserved output scope ${scope}`, (t) => {
            const f = fixture(t);
            const output = path.join(f.root, scope);
            if (state === 'empty') fs.mkdirSync(output, { recursive: true });

            assert.throws(
                () => buildSite({ projectRoot: f.root, outputDirectory: output }),
                /overwrite source or published guide state/,
            );
            assert.equal(fs.existsSync(output), state === 'empty');
            if (state === 'empty') assert.deepEqual(fs.readdirSync(output), []);
            assert.ok(!fs.existsSync(path.join(output, '.i9-site-build.json')));
        });
    }
}

test('build rejects source/output symlinks and active icons before writing', (t) => {
    const f = fixture(t);
    const outside = path.join(f.root, 'outside.svg');
    fs.writeFileSync(outside, '<svg/>');
    const icon = path.join(f.root, f.catalog.skills[0].path, 'assets/icon.svg');
    fs.unlinkSync(icon);
    fs.symlinkSync(outside, icon);
    assert.throws(f.build, /Symbolic links/);
    assert.ok(!fs.existsSync(f.output));
    fs.unlinkSync(icon);
    fs.writeFileSync(icon, '<svg><script>sentinel</script></svg>');
    assert.throws(f.build, /active or external/);
    assert.ok(!fs.existsSync(f.output));
    fs.writeFileSync(icon, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const linkedOutput = path.join(f.root, 'linked-output');
    fs.symlinkSync(path.join(f.root, 'website'), linkedOutput);
    assert.throws(
        () => buildSite({ projectRoot: f.root, outputDirectory: linkedOutput }),
        /Symbolic links/,
    );
});

test('owned rebuild preserves unrelated files and refuses marker traversal entries', (t) => {
    const f = fixture(t);
    f.build();
    fs.writeFileSync(path.join(f.output, 'review-note.txt'), 'keep');
    f.build();
    assert.equal(fs.readFileSync(path.join(f.output, 'review-note.txt'), 'utf8'), 'keep');
    const markerFile = path.join(f.output, '.i9-site-build.json');
    const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
    marker.files['../outside.txt'] = '0'.repeat(64);
    fs.writeFileSync(markerFile, JSON.stringify(marker));
    assert.throws(f.build, /Unsafe build ownership entry/);
});

async function request(server, requestPath, method = 'GET') {
    const address = server.address();
    return new Promise((resolve, reject) => {
        const call = http.request(
            { hostname: '127.0.0.1', port: address.port, path: requestPath, method },
            (response) => {
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () =>
                    resolve({
                        status: response.statusCode,
                        headers: response.headers,
                        body: Buffer.concat(chunks).toString(),
                    }),
                );
            },
        );
        call.on('error', reject);
        call.end();
    });
}

test('loopback preview serves only owned unchanged files and rejects traversal, methods and symlink escape', async (t) => {
    const f = fixture(t);
    f.build();
    const server = createPreviewServer(f.output);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        server.close();
        await once(server, 'close');
    });
    assert.equal(server.address().address, '127.0.0.1');
    const page = await request(server, '/pt-br/');
    assert.equal(page.status, 200);
    assert.ok(page.body.includes('lang="pt-BR"'));
    assert.match(page.headers['content-security-policy'], /connect-src 'none'/);
    assert.equal(page.headers['x-robots-tag'], 'noindex');
    assert.equal((await request(server, '/assets/site.mjs', 'HEAD')).body, '');
    assert.equal((await request(server, '/index.html', 'POST')).status, 405);
    for (const unsafe of [
        '/../skills-catalog.json',
        '/%2e%2e/skills-catalog.json',
        '/%5cprivate',
        '/%00',
        '/%E0%A4%A',
    ]) {
        assert.equal((await request(server, unsafe)).status, 400);
    }
    fs.writeFileSync(path.join(f.output, 'review-note.txt'), 'must not be served');
    assert.equal((await request(server, '/review-note.txt')).status, 404);
    assert.equal((await request(server, '/.i9-site-build.json')).status, 404);
    fs.writeFileSync(path.join(f.output, 'assets/site.css'), 'tampered');
    assert.equal((await request(server, '/assets/site.css')).status, 409);
    const iconRelative = 'assets/icons/' + f.catalog.skills[0].name + '.svg';
    const privateFile = path.join(f.root, 'private-sentinel.txt');
    fs.writeFileSync(privateFile, 'synthetic unserved content');
    fs.unlinkSync(path.join(f.output, iconRelative));
    fs.symlinkSync(privateFile, path.join(f.output, iconRelative));
    assert.equal((await request(server, '/' + iconRelative)).status, 403);
});
