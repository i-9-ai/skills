// SPDX-License-Identifier: Apache-2.0
import { CollectionMaintenanceRepository } from '../repository/CollectionMaintenanceRepository.ts';
import type { CollectionSelection } from '../validator/CollectionRemediationValidator.ts';

/** Reports structural evidence without treating it as official or behavioral validation. */
export class CollectionAuditService {
    private readonly repository: CollectionMaintenanceRepository;

    constructor(repository = new CollectionMaintenanceRepository()) {
        this.repository = repository;
    }

    audit(selection: CollectionSelection) {
        return this.repository.observe(selection).audit;
    }
}
