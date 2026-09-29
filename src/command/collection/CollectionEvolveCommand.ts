// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { collectionMaintenanceFlags, maintenanceSelection } from './CollectionAuditCommand.ts';
import { CollectionMaintenanceRepository } from '../../repository/CollectionMaintenanceRepository.ts';
import { CollectionRemediationService } from '../../service/CollectionRemediationService.ts';

export default class CollectionEvolveCommand extends Command {
    static description =
        'Preview a selected plan; --apply supports only catalog synchronization after verified external recovery. Semantic repairs remain handoffs.';
    static flags = {
        ...collectionMaintenanceFlags,
        plan: Flags.string({
            required: true,
            description:
                'Selected closed JSON remediation plan; drift requires a new audit and plan.',
        }),
        apply: Flags.boolean({
            default: false,
            description:
                'Explicitly apply supported operations; without this flag the command is read-only.',
        }),
        'snapshot-store': Flags.string({
            description:
                'Absolute recovery store outside the collection/discovery paths; required for supported writes.',
        }),
    };
    static examples = [
        '<%= config.bin %> collection evolve --collection /example/collection --layout repository --plan plan.json',
        '<%= config.bin %> collection evolve --collection /example/collection --layout repository --plan plan.json --apply --snapshot-store /example/recovery',
    ];

    async run() {
        const { flags } = await this.parse(CollectionEvolveCommand);
        const repository = new CollectionMaintenanceRepository();
        const result = new CollectionRemediationService(repository).evolve(
            maintenanceSelection(flags),
            repository.readDocument(flags.plan),
            { apply: flags.apply, snapshotStore: flags['snapshot-store'] },
        );
        this.log(JSON.stringify(result, null, 2));
        if (
            result.status === 'rolled_back' ||
            result.status === 'rollback_failed' ||
            result.receipt === 'unavailable'
        )
            this.exit(1);
    }
}
