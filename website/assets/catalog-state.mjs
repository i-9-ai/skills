export function normalizeSearch(value) {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

export function matchesSkill(skill, query, category) {
    return (
        (category === 'all' || skill.category === category) &&
        normalizeSearch(skill.search).includes(normalizeSearch(query.trim()))
    );
}

export function formatSkillCount(count, singular, plural) {
    return count + ' ' + (count === 1 ? singular : plural);
}
