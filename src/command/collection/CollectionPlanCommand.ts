// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { collectionMaintenanceFlags, maintenanceSelection } from './CollectionAuditCommand.ts';
import { CollectionMaintenanceRepository } from '../../repository/CollectionMaintenanceRepository.ts';
import { CollectionRemediationService } from '../../service/CollectionRemediationService.ts';

export default class CollectionPlanCommand extends Command {
    static description =
        'Recheck a selected audit and produce supported catalog operations plus explicit authoring handoffs; never changes a collection.';
    static flags = {
        ...collectionMaintenanceFlags,
        audit: Flags.string({
            required: true,
            description:
                'Bounded regular JSON audit file produced for these exact collection bytes.',
        }),
    };
    static examples = [
        '<%= config.bin %> collection plan --collection /example/collection --layout repository --audit audit.json > plan.json',
    ];

    async run() {
        const { flags } = await this.parse(CollectionPlanCommand);
        const repository = new CollectionMaintenanceRepository();
        this.log(
            JSON.stringify(
                new CollectionRemediationService(repository).plan(
                    maintenanceSelection(flags),
                    repository.readDocument(flags.audit),
                ),
                null,
                2,
            ),
        );
    }
}
