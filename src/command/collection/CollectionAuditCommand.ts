// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { CollectionAuditService } from '../../service/CollectionAuditService.ts';
import type { CollectionSelection } from '../../validator/CollectionRemediationValidator.ts';

export const collectionMaintenanceFlags = {
    collection: Flags.string({
        required: true,
        description: 'Explicit collection root; no home or installed-plugin default.',
    }),
    layout: Flags.string({
        required: true,
        options: ['repository', 'global'],
        description:
            'Selected layout; package links are not followed and global .system is excluded.',
    }),
};

export function maintenanceSelection(flags: {
    collection: string;
    layout: string;
}): CollectionSelection {
    return { collection: flags.collection, layout: flags.layout as CollectionSelection['layout'] };
}

export default class CollectionAuditCommand extends Command {
    static description =
        'Audit bounded local package structure and catalog freshness without writes, scripts or network; official and behavioral validation remain separate.';
    static flags = collectionMaintenanceFlags;
    static examples = [
        '<%= config.bin %> collection audit --collection /example/collection --layout repository > audit.json',
    ];

    async run() {
        const { flags } = await this.parse(CollectionAuditCommand);
        this.log(
            JSON.stringify(
                new CollectionAuditService().audit(maintenanceSelection(flags)),
                null,
                2,
            ),
        );
    }
}
