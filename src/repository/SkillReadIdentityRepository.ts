// SPDX-License-Identifier: Apache-2.0
import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute } from 'node:path';
import { SkillDiscoveryRepository } from './SkillDiscoveryRepository.ts';
import type { CollectionSource } from './SkillDiscoveryRepository.ts';

/** Matches entrypoint reads only within explicitly selected collection roots. */
export class SkillReadIdentityRepository {
    private readonly discovery: Pick<SkillDiscoveryRepository, 'read'>;
    private readonly allowIncompleteDiscovery: boolean;

    constructor(
        discovery: Pick<SkillDiscoveryRepository, 'read'> = new SkillDiscoveryRepository(),
        { allowIncompleteDiscovery = false } = {},
    ) {
        this.discovery = discovery;
        this.allowIncompleteDiscovery = allowIncompleteDiscovery;
    }

    sources(values: string[]): CollectionSource[] {
        if (values.length < 1 || values.length > 16) throw new Error('Select 1–16 collections');
        const labels = new Set<string>();
        return values
            .map((value) => {
                const split = value.indexOf('=');
                const label = value.slice(0, split);
                const directory = value.slice(split + 1);
                if (split < 1 || !/^[a-z][a-z0-9-]{0,63}$/.test(label) || !isAbsolute(directory)) {
                    throw new Error('Collection selection must be label=absolute-directory');
                }
                if (labels.has(label)) throw new Error('Collection labels must be unique');
                labels.add(label);
                return { label, directory };
            })
            .sort((left, right) => left.label.localeCompare(right.label, 'en'));
    }

    identify(filename: string, sources: CollectionSource[]) {
        if (!isAbsolute(filename) || basename(filename) !== 'SKILL.md') return;
        let canonical: string;
        try {
            canonical = realpathSync(filename);
        } catch {
            return;
        }
        if (basename(canonical) !== 'SKILL.md') return;
        const discovery = this.discovery.read(sources);
        if (discovery.warnings.length && !this.allowIncompleteDiscovery) {
            throw new Error('Selected collection discovery incomplete');
        }
        const skill = discovery.skills.find(
            (candidate) => candidate.canonicalPath === dirname(canonical),
        );
        if (!skill) return;
        return { collection: skill.sources[0]!, skill: skill.name, revision: 'unknown' };
    }
}
