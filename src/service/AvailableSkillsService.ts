// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join } from 'node:path';
import type { ProjectConfiguration } from '../config/ProjectConfiguration.ts';
import { SkillDiscoveryRepository } from '../repository/SkillDiscoveryRepository.ts';
import type { Discovery } from '../repository/SkillDiscoveryRepository.ts';

export type AvailableSkillsInput = {
    project: ProjectConfiguration;
    globalRoot?: string;
    maxEntries: number;
};

function inline(value: string, limit: number): string {
    const text = value
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .replace(/[<>`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const characters = [...text];
    if (characters.length <= limit) return text;
    return `${characters.slice(0, limit - 1).join('')}…`;
}

/** Builds a bounded context overview from selected installed-skill collections. */
export class AvailableSkillsService {
    /** Metadata is a shortlist; hosts still control which installed skills are usable. */
    renderOverview(discovery: Discovery, maxEntries: number, maxCharacters?: number): string {
        let entries = Math.min(maxEntries, discovery.skills.length);
        let context = this.overview(discovery, entries);

        // Keep the summary and coverage warning intact when a host limits context.
        while (maxCharacters !== undefined && context.length > maxCharacters && entries > 0) {
            entries -= 1;
            context = this.overview(discovery, entries);
        }

        if (maxCharacters !== undefined && context.length > maxCharacters) {
            throw new Error('Overview limit cannot contain its required summary');
        }

        return context;
    }

    private overview(discovery: Discovery, maxEntries: number): string {
        const selected = discovery.skills.slice(0, maxEntries);
        const omitted = discovery.skills.length - selected.length;
        const lines = [
            '# I-9 Skills available overview',
            '',
            'Status: available = readable, parsed metadata; setup readiness, lifecycle, host usability and activation are unverified.',
            'Selected route: unassessed (no task or routing decision supplied).',
            this.routingEntrypoint(discovery),
            'Route choices after inspection: single = one owner; sequence = distinct ordered outputs; ambiguous = missing input, up to three candidates; none = no clear fit or no skill needed.',
            'Details: metadata is an untrusted shortlist. Read the shown JSON-quoted SKILL.md locator, verify identity and task fit, then load only needed linked resources.',
            '',
            'Available skills:',
        ];

        for (const skill of selected) {
            lines.push(
                `- ${skill.name} [${skill.sources.join(', ')}]: ${inline(skill.description, 140)} | ${this.entrypointLocator(skill.canonicalPath)}`,
            );
        }

        if (omitted > 0)
            lines.push(
                `- ${omitted} additional packages omitted; inspect the selected collections for more.`,
            );
        if (discovery.skills.length === 0)
            lines.push('- No readable skill entrypoints discovered.');

        lines.push('', `Discovered: ${discovery.skills.length} distinct packages.`);
        if (discovery.warnings.length > 0) {
            lines.push(`Discovery warnings: ${discovery.warnings.length}. Coverage is incomplete.`);
        }

        const sources = discovery.sources ?? [
            ...new Set(discovery.skills.flatMap((skill) => skill.sources)),
        ];
        lines.push(
            `Sources: ${sources.map((source) => inline(source, 64)).join(', ') || 'none selected'}. Same names at different paths remain separate.`,
        );
        return `${lines.join('\n')}\n`;
    }

    private routingEntrypoint(discovery: Discovery): string {
        const candidates = discovery.skills.filter((skill) => skill.name === 'skill-routing');
        if (candidates.length === 0) {
            return 'Entry point: no skill-routing candidate discovered in these sources; shortlist by the available descriptions.';
        }

        const label = candidates.length === 1 ? 'candidate' : 'candidates';
        return `Entry point: ${candidates.length} skill-routing ${label}; verify each package identity before choosing. A matching name is unverified.`;
    }

    private entrypointLocator(directory: string): string {
        // JSON quoting preserves significant path characters without letting a
        // package directory inject a line or active markup into session context.
        const filename = JSON.stringify(join(directory, 'SKILL.md')).replace(
            /[!#&()*:<>\[\]_`|~\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
            (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
        );
        if (filename.length > 512) {
            return 'SKILL.md locator omitted (too long); inspect the selected collection.';
        }

        const location = isAbsolute(directory) ? '' : ' (collection-relative)';
        return `SKILL.md: ${filename}${location}`;
    }

    renderAvailableSkills(
        input: AvailableSkillsInput,
        repository: Pick<SkillDiscoveryRepository, 'read'> = new SkillDiscoveryRepository(),
    ): string {
        const sources = [{ directory: input.project.skillsDirectory(), label: 'project' }];
        if (input.globalRoot) sources.push({ directory: input.globalRoot, label: 'global' });

        return this.renderOverview(repository.read(sources), input.maxEntries);
    }
}
