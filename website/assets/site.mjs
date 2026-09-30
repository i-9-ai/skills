import { formatSkillCount, matchesSkill } from './catalog-state.mjs';
import { languageDestination, suggestLanguage } from './language-state.mjs';

const controls = document.querySelector('[data-catalog-controls]');
const search = document.querySelector('#skill-search');
const rows = [...document.querySelectorAll('[data-skill]')];
const buttons = [...document.querySelectorAll('button[data-category]')];
const count = document.querySelector('#result-count');
const empty = document.querySelector('[data-empty-state]');
const reset = document.querySelector('[data-reset]');
const allowedCategories = new Set(buttons.map((button) => button.dataset.category));
let category = 'all';

function showLanguageSuggestion() {
    const banner = document.querySelector('[data-language-suggestion]');
    if (!banner) return;

    const options = JSON.parse(banner.dataset.languageSuggestion);
    const locale = suggestLanguage({
        pathname: window.location.pathname,
        preferredLanguages: navigator.languages?.length
            ? navigator.languages
            : [navigator.language],
        availableLocales: Object.keys(options),
        currentLocale: document.body.dataset.locale,
    });
    if (!locale) return;

    const suggestion = options[locale];
    const action = banner.querySelector('[data-language-action]');
    const dismiss = banner.querySelector('[data-language-dismiss]');
    banner.lang = suggestion.tag;
    banner.querySelector('[data-language-message]').textContent = suggestion.message;
    action.textContent = suggestion.action;
    action.hreflang = suggestion.tag;
    action.href = languageDestination(window.location.href, locale);
    dismiss.textContent = suggestion.dismiss;
    dismiss.addEventListener('click', () => {
        banner.hidden = true;
    });
    banner.hidden = false;
}

showLanguageSuggestion();

function synchronizeLanguages() {
    for (const link of document.querySelectorAll('[data-language-link]')) {
        const destination = new URL(link.href);
        destination.search = window.location.search;
        destination.hash = window.location.hash;
        link.href = destination.href;
    }
}

function updateCatalog(writeUrl = true) {
    const query = search.value.trim();
    let matches = 0;
    for (const row of rows) {
        const visible = matchesSkill(row.dataset, query, category);
        row.hidden = !visible;
        if (visible) matches += 1;
    }
    for (const button of buttons) {
        button.setAttribute('aria-pressed', String(button.dataset.category === category));
    }
    count.textContent = formatSkillCount(
        matches,
        count.dataset.countSingular,
        count.dataset.countLabel,
    );
    empty.hidden = matches > 0;
    reset.hidden = !query && category === 'all';
    if (writeUrl) {
        const url = new URL(window.location.href);
        search.value.trim()
            ? url.searchParams.set('q', search.value.trim())
            : url.searchParams.delete('q');
        category === 'all'
            ? url.searchParams.delete('category')
            : url.searchParams.set('category', category);
        window.history.replaceState(null, '', url);
    }
    synchronizeLanguages();
}

function restoreCatalog() {
    const parameters = new URLSearchParams(window.location.search);
    search.value = (parameters.get('q') ?? '').slice(0, 160);
    const proposed = parameters.get('category') ?? 'all';
    category = allowedCategories.has(proposed) ? proposed : 'all';
    updateCatalog(false);
}

if (controls && search && count && empty && reset) {
    controls.hidden = false;
    restoreCatalog();
    search.addEventListener('input', () => updateCatalog());
    for (const button of buttons) {
        button.addEventListener('click', () => {
            category = button.dataset.category;
            updateCatalog();
        });
    }
    reset.addEventListener('click', () => {
        category = 'all';
        search.value = '';
        updateCatalog();
        search.focus();
    });
    window.addEventListener('popstate', restoreCatalog);
}
window.addEventListener('hashchange', synchronizeLanguages);
synchronizeLanguages();

for (const button of document.querySelectorAll('[data-copy]')) {
    button.hidden = false;
    button.addEventListener('click', async () => {
        const command = document.getElementById(button.dataset.copy);
        const lane = button.closest('.install-lane');
        const status = lane.querySelector('[data-copy-status]');
        button.disabled = true;
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(command.textContent);
            button.textContent = document.body.dataset.copiedLabel;
            status.textContent = document.body.dataset.copiedLabel;
        } catch {
            status.textContent = document.body.dataset.copyFailure;
            button.textContent = document.body.dataset.copyLabel;
        } finally {
            button.disabled = false;
        }
    });
}

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('enhanced');
}
