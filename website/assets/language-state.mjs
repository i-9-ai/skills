export function suggestLanguage({
    pathname,
    preferredLanguages,
    availableLocales,
    currentLocale = 'en',
}) {
    if (pathname !== '/' && pathname !== '/index.html') return null;

    for (const preference of preferredLanguages) {
        if (typeof preference !== 'string') continue;
        const tag = preference.toLowerCase();
        const base = tag.split('-')[0];
        const locale = availableLocales.includes(tag)
            ? tag
            : availableLocales.find((candidate) => candidate.split('-')[0] === base);

        if (locale) return locale === currentLocale ? null : locale;
    }

    return null;
}

export function languageDestination(currentUrl, locale) {
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(locale)) {
        throw new Error('Invalid language route');
    }

    const current = new URL(currentUrl);
    const destination = new URL('./' + locale + '/', current);
    destination.search = current.search;
    destination.hash = current.hash;
    return destination.href;
}
