// SPDX-License-Identifier: Apache-2.0
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

/** Names shared agent state without creating directories or opening databases. */
export class AgentStateConfiguration {
    readonly root: string;

    constructor(environment: NodeJS.ProcessEnv = process.env) {
        const home = environment.HOME ?? environment.USERPROFILE ?? homedir();
        const root = environment.I9_AGENT_STATE_ROOT ?? join(home, '.agents');
        this.root = this.absolute(root);
    }

    skills(): string {
        return join(this.root, 'skills');
    }
    catalog(): string {
        return join(this.root, 'skills-catalog.json');
    }
    usageDatabase(): string {
        return join(this.root, 'skills-usage.db');
    }

    absolute(value: string): string {
        return AgentStateConfiguration.absolute(value);
    }

    static absolute(value: string): string {
        if (
            !isAbsolute(value) ||
            value.length > 4096 ||
            !value.isWellFormed() ||
            /[\x00-\x1f\x7f]/.test(value)
        ) {
            throw new Error('Agent state requires a bounded absolute path.');
        }
        return resolve(value);
    }
}
