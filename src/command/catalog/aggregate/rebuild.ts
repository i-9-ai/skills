// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { aggregateInput, aggregateWriteFlags } from './sync.ts';
import { AggregateCatalogService } from '../../../service/AggregateCatalogService.ts';

export default class AggregateRebuildCommand extends Command {
    static description =
        'Rebuild an aggregate; existing SQLite history requires explicit --reset-history.';
    static flags = {
        ...aggregateWriteFlags,
        'reset-history': Flags.boolean({
            description: 'Authorize discarding existing aggregate history; retain a backup first.',
            default: false,
        }),
    };
    static examples = [
        '<%= config.bin %> catalog aggregate rebuild --source team=./skills-catalog.json --output ./new-local-index',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(AggregateRebuildCommand);
        this.log(
            JSON.stringify(
                await new AggregateCatalogService().rebuild({
                    ...aggregateInput(flags),
                    resetHistory: flags['reset-history'],
                }),
            ),
        );
    }
}
