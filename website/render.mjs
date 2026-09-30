import {
    commands,
    documentation,
    languages,
    messages,
    repository,
    toolkitSource,
} from './content.mjs';
import { formatSkillCount } from './assets/catalog-state.mjs';

export function escapeHtml(value) {
    return String(value).replace(
        /[&<>"']/g,
        (character) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[character],
    );
}

function element(tag, attributes = {}, children = '') {
    const attributesHtml = Object.entries(attributes)
        .filter(([, value]) => value !== false && value !== undefined)
        .map(([key, value]) =>
            value === true ? ' ' + key : ' ' + key + '="' + escapeHtml(value) + '"',
        )
        .join('');
    const opening = '<' + tag + attributesHtml + '>';
    return ['meta', 'link', 'img', 'input'].includes(tag)
        ? opening
        : opening + children + '</' + tag + '>';
}

const text = (tag, value, attributes = {}) => element(tag, attributes, escapeHtml(value));
const link = (value, href, attributes = {}) => text('a', value, { href, ...attributes });
const packageUrl = (name) =>
    repository + '/blob/main/.agents/skills/' + encodeURIComponent(name) + '/SKILL.md';

function icon(kind = 'arrow') {
    const paths = {
        arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
        search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
        packages:
            '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
        license: '<path d="M6 3h8l4 4v14H6zM14 3v5h4"/>',
        portable: '<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9"/>',
    };
    return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
        paths[kind] +
        '</svg>'
    );
}

function languageLinks(locale, prefix) {
    const links = languages
        .map((language) =>
            link(language.short, prefix + language.key + '/', {
                lang: language.tag,
                hreflang: language.tag,
                'aria-label': language.name,
                'aria-current': language.key === locale ? 'page' : undefined,
                'data-language-link': true,
            }),
        )
        .join('');
    return element('nav', { class: 'languages', 'aria-label': messages[locale].language }, links);
}

function heading(title, emphasis, tag = 'h2', attributes = {}) {
    return element(
        tag,
        attributes,
        text('span', title, { class: 'heading-main' }) +
            text('em', emphasis, { class: 'heading-emphasis' }),
    );
}

function header(locale, prefix) {
    const m = messages[locale];
    const nav = [
        link(m.nav.workflow, '#workflow'),
        link(m.nav.catalog, '#catalog'),
        link(m.nav.install, '#install'),
        link(m.nav.docs, documentation),
    ].join('');
    return element(
        'header',
        { class: 'site-header container' },
        link('I-9 Skills', prefix, { class: 'wordmark', 'aria-label': 'I-9 Skills' }) +
            element('nav', { class: 'primary-nav', 'aria-label': m.navigation }, nav) +
            languageLinks(locale, prefix),
    );
}

function hero(locale, prefix, count) {
    const m = messages[locale].hero;
    const copy = element(
        'div',
        { class: 'hero-copy' },
        heading(m.title, m.emphasis, 'h1') +
            text('p', m.description, { class: 'lead' }) +
            element(
                'div',
                { class: 'hero-actions' },
                element(
                    'a',
                    { class: 'button button-primary', href: '#catalog' },
                    escapeHtml(m.primary) + icon(),
                ) + link(m.secondary, '#install', { class: 'text-link' }),
            ),
    );
    const artwork = element(
        'div',
        { class: 'hero-media' },
        element('img', {
            src: prefix + 'assets/hero-packages.webp',
            width: '1100',
            height: '917',
            alt: '',
            decoding: 'async',
            fetchpriority: 'high',
        }),
    );
    const facts = [
        [String(count) + ' ' + m.count, 'packages'],
        [m.license, 'license'],
        [m.portable, 'portable'],
    ]
        .map(([value, kind]) => element('li', {}, icon(kind) + text('span', value)))
        .join('');
    return element(
        'section',
        { class: 'opening', 'aria-label': 'I-9 Skills' },
        element('div', { class: 'hero container' }, copy + artwork) +
            element('ul', { class: 'facts container' }, facts),
    );
}

function workflow(locale) {
    const m = messages[locale].workflow;
    const intro = element(
        'div',
        { class: 'section-intro' },
        heading(m.title, m.emphasis) + text('p', m.description, { class: 'lead' }),
    );
    const stages = m.stages
        .map((stage, index) =>
            element(
                'li',
                { class: 'stage' },
                text('span', String(index + 1).padStart(2, '0'), {
                    class: 'stage-number',
                    'aria-hidden': true,
                }) +
                    text('h3', stage.title) +
                    text('p', stage.body) +
                    element(
                        'a',
                        { href: packageUrl(stage.skill), class: 'text-link' },
                        escapeHtml(stage.skill) + icon(),
                    ),
            ),
        )
        .join('');
    return element(
        'section',
        { id: 'workflow', class: 'workflow section' },
        element('div', { class: 'container' }, intro + element('ol', { class: 'stages' }, stages)),
    );
}

function catalog(locale, prefix, skills) {
    const m = messages[locale].catalog;
    const intro = element(
        'div',
        { class: 'catalog-intro' },
        element(
            'div',
            {},
            heading(m.title, m.emphasis) + text('p', m.description, { class: 'lead' }),
        ) + link(m.source, repository + '/blob/main/skills-catalog.json', { class: 'text-link' }),
    );
    const filterButtons = [['all', m.all], ...Object.entries(m.categories)]
        .map(([key, label]) =>
            text('button', label, {
                type: 'button',
                'data-category': key,
                'aria-pressed': key === 'all' ? 'true' : 'false',
            }),
        )
        .join('');
    const controls = element(
        'div',
        { class: 'catalog-controls', hidden: true, 'data-catalog-controls': true },
        element(
            'div',
            { class: 'search-field' },
            text('label', m.search, { for: 'skill-search' }) +
                element(
                    'div',
                    { class: 'search-input' },
                    icon('search') +
                        element('input', {
                            id: 'skill-search',
                            type: 'search',
                            placeholder: m.placeholder,
                            autocomplete: 'off',
                            maxlength: '160',
                        }),
                ),
        ) +
            element(
                'div',
                { class: 'filter-line' },
                element(
                    'fieldset',
                    { class: 'filters' },
                    text('legend', m.filters, { class: 'sr-only' }) + filterButtons,
                ) +
                    element(
                        'div',
                        { class: 'result-controls' },
                        text('p', formatSkillCount(skills.length, m.singular, m.count), {
                            id: 'result-count',
                            'aria-live': 'polite',
                            'aria-atomic': 'true',
                            'data-count-label': m.count,
                            'data-count-singular': m.singular,
                        }) +
                            text('button', m.reset, {
                                type: 'button',
                                class: 'reset-button',
                                'data-reset': true,
                                hidden: true,
                            }),
                    ),
            ),
    );
    const rows = skills
        .map((skill) => {
            const search = [skill.name, skill.description, ...(skill.tags ?? [])].join(' ');
            return element(
                'li',
                {
                    class: 'skill-row',
                    'data-skill': skill.name,
                    'data-category': skill.category,
                    'data-search': search,
                },
                element('img', {
                    class: 'skill-icon',
                    src: prefix + 'assets/icons/' + skill.name + '.svg',
                    width: '56',
                    height: '56',
                    alt: '',
                    loading: 'lazy',
                }) +
                    text('h3', skill.name, { class: 'skill-name' }) +
                    text('p', skill.description, { class: 'skill-description', lang: 'en' }) +
                    text('span', m.categories[skill.category], { class: 'skill-category' }) +
                    element(
                        'a',
                        {
                            href: packageUrl(skill.name),
                            class: 'skill-source',
                            'aria-label': m.open + ': ' + skill.name,
                        },
                        icon(),
                    ),
            );
        })
        .join('');
    const sourceNote = m.sourceDescription
        ? text('p', m.sourceDescription, { class: 'source-note' })
        : '';
    const noScript = element('noscript', {}, text('p', m.noScript, { class: 'source-note' }));
    const empty = element(
        'div',
        { class: 'empty-state', hidden: true, 'data-empty-state': true },
        text('h3', m.empty) + text('p', m.emptyHint),
    );
    return element(
        'section',
        { id: 'catalog', class: 'catalog section container' },
        intro +
            sourceNote +
            controls +
            noScript +
            element('ul', { class: 'skill-list' }, rows) +
            empty,
    );
}

function installation(locale) {
    const m = messages[locale].install;
    const intro = element(
        'div',
        { class: 'install-intro' },
        heading(m.title, m.emphasis) + text('p', m.description, { class: 'lead' }),
    );
    const lanes = [
        {
            key: 'skills',
            title: m.packages,
            body: m.packagesBody,
            link: m.packagesLink,
            href: repository + '/blob/main/README.md#install',
        },
        {
            key: 'plugin',
            title: m.plugin,
            body: m.pluginBody,
            link: m.pluginLink,
            href: documentation + '/Plugin-Preparation#install-in-codex',
        },
        {
            key: 'toolkit',
            title: m.toolkit,
            body: m.toolkitBody,
            detail: toolkitSource === 'registry' ? m.toolkitRegistry : m.toolkitGit,
            link: m.toolkitLink,
            href: documentation + '/Distribution-Readiness#consumer-command-mapping',
        },
    ]
        .map((lane) =>
            element(
                'article',
                { class: 'install-lane' },
                text('h3', lane.title) +
                    text('p', lane.body) +
                    element(
                        'div',
                        { class: 'command-box' },
                        element(
                            'pre',
                            {},
                            text('code', commands[lane.key], { id: 'command-' + lane.key }),
                        ) +
                            text('button', m.copy, {
                                type: 'button',
                                class: 'copy-button',
                                hidden: true,
                                'data-copy': 'command-' + lane.key,
                                'aria-label': m.copyLabel + ': ' + lane.title,
                            }),
                    ) +
                    text('p', '', {
                        class: 'copy-status',
                        role: 'status',
                        'data-copy-status': lane.key,
                    }) +
                    (lane.detail ? text('p', lane.detail, { class: 'install-detail' }) : '') +
                    link(lane.link, lane.href, { class: 'text-link' }),
            ),
        )
        .join('');
    return element(
        'section',
        { id: 'install', class: 'install section container' },
        intro + element('div', { class: 'install-lanes' }, lanes),
    );
}

function evidence(locale) {
    const m = messages[locale].evidence;
    const items = m.items
        .map((item) => element('li', {}, text('h3', item.title) + text('p', item.body)))
        .join('');
    return element(
        'section',
        { id: 'evidence', class: 'evidence section' },
        element(
            'div',
            { class: 'container' },
            element(
                'div',
                { class: 'evidence-grid' },
                text('h2', m.title) + element('ul', {}, items),
            ) +
                link(m.link, documentation + '/Compatibility', { class: 'text-link' }) +
                text('p', m.providers, { class: 'provider-limits' }),
        ),
    );
}

function footer(locale, prefix) {
    const m = messages[locale].footer;
    return element(
        'footer',
        { class: 'site-footer container' },
        element(
            'div',
            { class: 'footer-main' },
            link('I-9 Skills', prefix, { class: 'wordmark' }) +
                element(
                    'div',
                    { class: 'footer-links' },
                    link(m.source, repository) +
                        link(m.docs, documentation) +
                        link(m.license, repository + '/blob/main/LICENSE'),
                ) +
                languageLinks(locale, prefix),
        ) + text('p', m.preview, { class: 'preview-notice' }),
    );
}

export function renderPage({ locale, rootPage = false, skills }) {
    const m = messages[locale];
    if (!m) throw new Error('Unsupported locale');
    const language = languages.find((value) => value.key === locale);
    const prefix = rootPage ? './' : '../';
    const head = [
        element('meta', { charset: 'utf-8' }),
        element('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
        text('title', m.title),
        element('meta', { name: 'description', content: m.description }),
        element('meta', { name: 'robots', content: 'noindex' }),
        element('meta', { name: 'theme-color', content: '#14231A' }),
        element('link', { rel: 'stylesheet', href: prefix + 'assets/site.css' }),
        ...languages.map((item) =>
            element('link', {
                rel: 'alternate',
                hreflang: item.tag,
                href: prefix + item.key + '/',
            }),
        ),
        element('script', { type: 'module', src: prefix + 'assets/site.mjs' }),
    ].join('');
    const body =
        link(m.skip, '#main', { class: 'skip-link' }) +
        header(locale, prefix) +
        element(
            'main',
            { id: 'main' },
            hero(locale, prefix, skills.length) +
                workflow(locale) +
                catalog(locale, prefix, skills) +
                installation(locale) +
                evidence(locale),
        ) +
        footer(locale, prefix);
    return (
        '<!doctype html>\n' +
        element(
            'html',
            { lang: language.tag },
            element('head', {}, head) +
                element(
                    'body',
                    {
                        'data-locale': locale,
                        'data-copy-label': m.install.copy,
                        'data-copied-label': m.install.copied,
                        'data-copy-failure': m.install.copyFailure,
                    },
                    body,
                ),
        ) +
        '\n'
    );
}
