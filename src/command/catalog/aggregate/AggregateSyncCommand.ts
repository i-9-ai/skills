// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { AggregateCatalogService } from '../../../service/AggregateCatalogService.ts';
import type { AggregateCatalogInput } from '../../../repository/AggregateCatalogRepository.ts';

export const aggregateWriteFlags = {
    source: Flags.string({
        description: 'Source ID and manifest as id=PATH. Repeat for every source.',
        multiple: true,
        required: true,
    }),
    output: Flags.string({
        description: 'Existing local directory outside all source collections.',
        required: true,
    }),
    format: Flags.string({
        description: 'SQLite retains history; JSON retains current state only.',
        options: ['sqlite', 'json'],
        default: 'sqlite',
    }),
};

export function aggregateInput(flags: {
    source: string[];
    output: string;
    format: string;
}): AggregateCatalogInput {
    return {
        sources: flags.source,
        output: flags.output,
        format: flags.format as AggregateCatalogInput['format'],
    };
}

export default class AggregateSyncCommand extends Command {
    static description = 'Synchronize a derived aggregate; SQLite history is retained.';
    static flags = aggregateWriteFlags;
    static examples = [
        '<%= config.bin %> catalog aggregate sync --source team=./skills-catalog.json --output ./local-index',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(AggregateSyncCommand);
        this.log(JSON.stringify(await new AggregateCatalogService().sync(aggregateInput(flags))));
    }
}
