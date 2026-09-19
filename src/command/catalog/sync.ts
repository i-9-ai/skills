// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { catalogFlags, catalogInput } from './inspect.ts';
import { CollectionCatalogService } from '../../service/CollectionCatalogService.ts';

export default class CatalogSyncCommand extends Command {
    static description =
        'Synchronize only the selected skills-catalog.json; --dry-run previews without writes.';
    static flags = {
        ...catalogFlags,
        'dry-run': Flags.boolean({
            description: 'Report proposed changes and target without creating or replacing files.',
            default: false,
        }),
    };
    static examples = [
        '<%= config.bin %> catalog sync --collection . --layout repository --dry-run',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(CatalogSyncCommand);
        this.log(
            JSON.stringify(
                new CollectionCatalogService().run('sync', {
                    ...catalogInput(flags),
                    dryRun: flags['dry-run'],
                }),
            ),
        );
    }
}
