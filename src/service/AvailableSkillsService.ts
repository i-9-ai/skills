// SPDX-License-Identifier: Apache-2.0
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
    renderOverview(discovery: Discovery, maxEntries: number): string {
        const selected = discovery.skills.slice(0, maxEntries);
        const omitted = discovery.skills.length - selected.length;
        const lines = [
            '# I-9 Skills available overview',
            '',
            'Installed skill metadata is a shortlist. Read the selected SKILL.md and check host capabilities before use.',
            '',
            'Available skills:',
        ];

        for (const skill of selected) {
            lines.push(
                `- ${skill.name} [${skill.sources.join(', ')}]: ${inline(skill.description, 140)}`,
            );
        }

        if (omitted > 0)
            lines.push(
                `- ${omitted} additional packages omitted; increase --max-entries or inspect the collection.`,
            );
        if (selected.length === 0) lines.push('- No readable skill entrypoints discovered.');

        lines.push('', `Discovered: ${discovery.skills.length} distinct packages.`);
        if (discovery.warnings.length > 0) {
            lines.push(`Discovery warnings: ${discovery.warnings.length}. Coverage is incomplete.`);
        }

        lines.push(
            'Sources: project .agents/skills; global collection when enabled. Same names at different paths remain separate.',
        );
        return `${lines.join('\n')}\n`;
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
