// SPDX-License-Identifier: Apache-2.0
import { join, resolve } from 'node:path';
import { AgentStateConfiguration } from './AgentStateConfiguration.ts';

export type InstallationOperation = 'install' | 'upgrade' | 'status' | 'uninstall' | 'recover';

/** Resolves explicit caller scope; creating directories belongs to the repository. */
export class SkillInstallationConfiguration {
    readonly root: string;
    readonly scope: 'project' | 'global';
    readonly skills: string;
    readonly state: string;

    constructor(
        input: { global?: boolean; project?: string; environment?: NodeJS.ProcessEnv } = {},
    ) {
        if (input.global && input.project)
            throw new Error('Choose --global or --project, not both.');
        this.scope = input.global ? 'global' : 'project';
        this.root = input.global
            ? new AgentStateConfiguration(input.environment).root
            : join(resolve(input.project ?? process.cwd()), '.agents');
        AgentStateConfiguration.absolute(this.root);
        this.skills = join(this.root, 'skills');
        this.state = join(this.root, 'installation', 'i9-skills');
    }
}
