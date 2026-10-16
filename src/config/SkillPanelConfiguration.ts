// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Explicit local pilot paths; construction never inspects or creates storage. */
export class SkillPanelConfiguration {
    readonly collection: string;
    readonly state: string;
    static readonly resourceUri = 'ui://i9-skills/skill-panel/v1.html';

    constructor(collection: string, state: string) {
        for (const value of [collection, state]) {
            if (!isAbsolute(value) || !value.isWellFormed() || value.includes('\0')) {
                throw new Error('Panel paths must be explicit absolute directories.');
            }
            if (resolve(value) === sep || value.split(sep).includes('.system')) {
                throw new Error('Select an ordinary owned panel collection and state directory.');
            }
        }
        this.collection = resolve(collection);
        this.state = resolve(state);
        this.assertSeparate(this.collection, this.state);
    }

    assertSeparate(collection: string, state: string): void {
        const contains = (parent: string, child: string) => {
            const part = relative(parent, child);
            return (
                part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`))
            );
        };
        if (contains(collection, state) || contains(state, collection)) {
            throw new Error('Panel state must be outside the selected collection.');
        }
    }
}
