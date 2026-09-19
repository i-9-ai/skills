// SPDX-License-Identifier: Apache-2.0
import { CollectionCatalogRepository } from '../repository/CollectionCatalogRepository.ts';
import type { CollectionCatalogInput } from '../repository/CollectionCatalogRepository.ts';

/** Keeps explicit inspection, conformance and mutation as distinct use cases. */
export class CollectionCatalogService {
    private readonly repository: CollectionCatalogRepository;

    constructor(repository = new CollectionCatalogRepository()) {
        this.repository = repository;
    }

    run(operation: 'inspect' | 'check' | 'sync', input: CollectionCatalogInput) {
        if (operation === 'inspect') return this.repository.inspect(input);
        if (operation === 'check') return this.repository.check(input);
        return this.repository.sync(input);
    }
}
