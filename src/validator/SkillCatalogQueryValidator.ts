// SPDX-License-Identifier: Apache-2.0
import {
    relativeParts,
    validSlug,
} from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';
import { SkillOperationError } from './SkillOperationError.ts';

export type CatalogSearchQuery = { query: string; limit: number; offset: number };
export type SkillResourceQuery = { skill: string; resource: string };
export type CatalogOverviewQuery = { max_entries: number };

/** Closed contracts for literal catalog queries and confined Markdown reads. */
export class SkillCatalogQueryValidator {
    search(value: unknown = {}): CatalogSearchQuery {
        const input = this.object(value, ['query', 'limit', 'offset']);
        const query = input.query === undefined ? '' : input.query;
        if (
            typeof query !== 'string' ||
            !query.isWellFormed() ||
            [...query].length > 200 ||
            /[\x00-\x1f\x7f]/u.test(query)
        ) {
            throw new SkillOperationError('invalid_input');
        }

        return {
            query,
            limit: this.integer(input.limit, 20, 1, 50),
            offset: this.integer(input.offset, 0, 0, 256),
        };
    }

    read(value: unknown): SkillResourceQuery {
        const input = this.object(value, ['skill', 'resource']);
        const resource = input.resource === undefined ? 'SKILL.md' : input.resource;

        try {
            const skill = validSlug(input.skill) as string;
            const parts = relativeParts(resource) as string[];
            if (
                typeof resource !== 'string' ||
                /[%#]/u.test(resource) ||
                parts.some((part) => part.startsWith('.')) ||
                (resource !== 'SKILL.md' &&
                    !(parts[0] === 'references' && parts.length > 1 && /\.md$/iu.test(resource)))
            ) {
                throw new SkillOperationError('invalid_input');
            }

            return { skill, resource };
        } catch {
            throw new SkillOperationError('invalid_input');
        }
    }

    overview(value: unknown = {}): CatalogOverviewQuery {
        const input = this.object(value, ['max_entries']);
        return { max_entries: this.integer(input.max_entries, 24, 1, 24) };
    }

    private object(value: unknown, allowed: string[]): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new SkillOperationError('invalid_input');
        }
        if (Object.keys(value).some((key) => !allowed.includes(key))) {
            throw new SkillOperationError('invalid_input');
        }
        return value as Record<string, unknown>;
    }

    private integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
        if (value === undefined) return fallback;
        if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
            throw new SkillOperationError('invalid_input');
        }
        return value as number;
    }
}
