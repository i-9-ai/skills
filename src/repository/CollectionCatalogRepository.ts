// SPDX-License-Identifier: Apache-2.0
import {
    checkCatalog,
    inspectCatalog,
    syncCatalog,
    strictJson,
    validateCatalogData,
} from '../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';

export type CollectionCatalogEntry = {
    name: string;
    path: string;
    description: string;
    tags: string[];
};
export type CollectionCatalogData = { schema_version: 1; skills: CollectionCatalogEntry[] };

export type CollectionCatalogInput = {
    collection: string;
    layout: 'repository' | 'global';
    allowPackageLinkRoots?: string[];
    dryRun?: boolean;
};

/** Reuses the detached package's bounded filesystem contract without subprocesses. */
export class CollectionCatalogRepository {
    /** Return checked manifest bytes; never regenerate or write during a read. */
    read(input: CollectionCatalogInput): { value: CollectionCatalogData; bytes: Buffer } {
        const root = new SafeRoot(input.collection);
        try {
            const bytes = root.readBytes('skills-catalog.json', 1_048_576);
            const value = validateCatalogData(strictJson(bytes)) as CollectionCatalogData;
            this.check(input);
            if (!bytes.equals(root.readBytes('skills-catalog.json', 1_048_576))) {
                throw new Error('Catalog changed during inspection');
            }
            return { value, bytes };
        } finally {
            root.close();
        }
    }

    inspect(input: CollectionCatalogInput) {
        return inspectCatalog(input.collection, input);
    }

    check(input: CollectionCatalogInput) {
        return checkCatalog(input.collection, input);
    }

    sync(input: CollectionCatalogInput) {
        return syncCatalog(input.collection, input);
    }
}
