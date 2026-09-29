// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { AggregateCatalogService } from '../../../service/AggregateCatalogService.ts';

export default class AggregateInspectCommand extends Command {
    static description = 'Inspect a bounded JSON or SQLite aggregate without changing its history.';
    static flags = {
        index: Flags.string({ description: 'Existing aggregate index file.', required: true }),
    };
    static examples = [
        '<%= config.bin %> catalog aggregate inspect --index ./local-index/skills-catalog.db',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(AggregateInspectCommand);
        this.log(JSON.stringify(await new AggregateCatalogService().inspect(flags.index)));
    }
}
