// SPDX-License-Identifier: Apache-2.0
import { isDeepStrictEqual } from 'node:util';
import {
    deriveAggregateIndex,
    readAggregateIndex,
    syncAggregateIndex,
    rebuildAggregateIndex,
} from '../../.agents/skills/skills-catalog/scripts/aggregate_index.mjs';

export type AggregateCatalogInput = {
    sources: string[];
    output: string;
    format: 'sqlite' | 'json';
    resetHistory?: boolean;
};

/** Owns aggregate projections while the package helper owns storage and history safety. */
export class AggregateCatalogRepository {
    async inspect(filename: string) {
        const index = await readAggregateIndex(filename);
        return { index: filename, sources: index.sources, skills: index.skills.length };
    }

    async check(filename: string, sources: string[]) {
        const records = sources.map((source) => {
            const separator = source.indexOf('=');
            if (separator < 1 || separator !== source.lastIndexOf('=')) {
                throw new Error('Source must use source-id=/path/to/skills-catalog.json.');
            }
            return { id: source.slice(0, separator), filename: source.slice(separator + 1) };
        });
        const desired = deriveAggregateIndex(records);
        const current = await readAggregateIndex(filename);
        // SQLite rows have null prototypes; compare the portable data, not driver objects.
        const comparable = {
            ...current,
            sources: current.sources.map((source: object) => ({ ...source })),
        };
        return { index: filename, matches: isDeepStrictEqual(comparable, desired), written: false };
    }

    sync(input: AggregateCatalogInput) {
        return syncAggregateIndex(input);
    }

    rebuild(input: AggregateCatalogInput) {
        return rebuildAggregateIndex(input);
    }
}
