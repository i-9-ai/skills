// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { AggregateCatalogService } from '../../../service/AggregateCatalogService.ts';

export default class AggregateCheckCommand extends Command {
    static description = 'Compare an aggregate with explicit source manifests without writes.';
    static flags = {
        index: Flags.string({ description: 'Existing aggregate index file.', required: true }),
        source: Flags.string({
            description: 'Source ID and manifest as id=PATH. Repeat for every source.',
            multiple: true,
            required: true,
        }),
    };
    static examples = [
        '<%= config.bin %> catalog aggregate check --index ./local-index/skills-catalog.db --source team=./skills-catalog.json',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(AggregateCheckCommand);
        const result = await new AggregateCatalogService().check(flags.index, flags.source);
        this.log(JSON.stringify(result));
        if (!result.matches) this.exit(1);
    }
}
