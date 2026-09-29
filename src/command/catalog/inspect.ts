// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { CollectionCatalogService } from '../../service/CollectionCatalogService.ts';
import type { CollectionCatalogInput } from '../../repository/CollectionCatalogRepository.ts';

export const catalogFlags = {
    collection: Flags.string({
        description: 'Explicit collection root; no home default.',
        required: true,
    }),
    layout: Flags.string({
        description: 'Directory convention to inspect.',
        options: ['repository', 'global'],
        required: true,
    }),
    'allow-package-link-root': Flags.string({
        description: 'Trusted direct package owner, global layout only. Repeat for each root.',
        multiple: true,
    }),
};

export function catalogInput(flags: {
    collection: string;
    layout: string;
    'allow-package-link-root'?: string[];
}): CollectionCatalogInput {
    return {
        collection: flags.collection,
        layout: flags.layout as CollectionCatalogInput['layout'],
        allowPackageLinkRoots: flags['allow-package-link-root'] ?? [],
    };
}

export default class CatalogInspectCommand extends Command {
    static description =
        'Inspect a valid collection manifest as JSON without testing freshness or writing.';
    static flags = catalogFlags;
    static examples = ['<%= config.bin %> catalog inspect --collection . --layout repository'];

    async run(): Promise<void> {
        const { flags } = await this.parse(CatalogInspectCommand);
        this.log(
            JSON.stringify(new CollectionCatalogService().run('inspect', catalogInput(flags))),
        );
    }
}
