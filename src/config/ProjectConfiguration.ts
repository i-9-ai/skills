// SPDX-License-Identifier: Apache-2.0
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkoutRoot = fileURLToPath(new URL('../../', import.meta.url));

export type ProjectConfigurationInput = {
    root?: string;
    environment?: Partial<Pick<NodeJS.ProcessEnv, 'I9_SKILLS_PROJECT_ROOT'>>;
    fallbackRoot?: string;
};

/** Resolves one project and its named paths without reading or creating files. */
export class ProjectConfiguration {
    private readonly resolvedRoot: string;

    constructor({
        root,
        environment = process.env,
        fallbackRoot = checkoutRoot,
    }: ProjectConfigurationInput = {}) {
        const selected = root ?? environment.I9_SKILLS_PROJECT_ROOT ?? fallbackRoot;

        if (
            typeof selected !== 'string' ||
            selected.trim().length === 0 ||
            selected.includes('\0') ||
            !selected.isWellFormed()
        ) {
            throw new Error('Project root must be a nonblank, valid filesystem path.');
        }

        this.resolvedRoot = resolve(selected);
    }

    root(): string {
        return this.resolvedRoot;
    }

    skillsDirectory(): string {
        return join(this.resolvedRoot, '.agents', 'skills');
    }

    codexHooksFile(): string {
        return join(this.resolvedRoot, '.codex', 'hooks.json');
    }

    catalogFile(): string {
        return join(this.resolvedRoot, 'skills-catalog.json');
    }
}
