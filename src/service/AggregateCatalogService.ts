// SPDX-License-Identifier: Apache-2.0
import { AggregateCatalogRepository } from '../repository/AggregateCatalogRepository.ts';
import type { AggregateCatalogInput } from '../repository/AggregateCatalogRepository.ts';

/** Exposes current-state checks separately from history-preserving writes and resets. */
export class AggregateCatalogService {
    private readonly repository: AggregateCatalogRepository;

    constructor(repository = new AggregateCatalogRepository()) {
        this.repository = repository;
    }

    inspect(filename: string) {
        return this.repository.inspect(filename);
    }
    check(filename: string, sources: string[]) {
        return this.repository.check(filename, sources);
    }
    sync(input: AggregateCatalogInput) {
        return this.repository.sync(input);
    }
    rebuild(input: AggregateCatalogInput) {
        return this.repository.rebuild(input);
    }
}
