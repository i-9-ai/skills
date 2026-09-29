// SPDX-License-Identifier: Apache-2.0
import { Command } from '@oclif/core';
import { catalogFlags, catalogInput } from './CatalogInspectCommand.ts';
import { CollectionCatalogService } from '../../service/CollectionCatalogService.ts';

export default class CatalogCheckCommand extends Command {
    static description =
        'Check manifest freshness without writes; a stale catalog returns nonzero.';
    static flags = catalogFlags;
    static examples = ['<%= config.bin %> catalog check --collection . --layout repository'];

    async run(): Promise<void> {
        const { flags } = await this.parse(CatalogCheckCommand);
        this.log(JSON.stringify(new CollectionCatalogService().run('check', catalogInput(flags))));
    }
}
