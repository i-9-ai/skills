// SPDX-License-Identifier: Apache-2.0
import {
    checkCatalog,
    inspectCatalog,
    syncCatalog,
} from '../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';

export type CollectionCatalogInput = {
    collection: string;
    layout: 'repository' | 'global';
    allowPackageLinkRoots?: string[];
    dryRun?: boolean;
};

/** Reuses the detached package's bounded filesystem contract without subprocesses. */
export class CollectionCatalogRepository {
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
