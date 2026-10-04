// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillBenchmarkService } from '../../service/SkillBenchmarkService.ts';

export default class BenchmarkCompareCommand extends Command {
    static description =
        'Reverify frozen inputs and retained runs, then report paired criteria, limits and missing evidence.';
    static examples = ['<%= config.bin %> benchmark compare --benchmark /tmp/skill-benchmark'];
    static flags = {
        benchmark: Flags.string({
            required: true,
            description: 'Previously frozen benchmark directory; comparison is read-only.',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(BenchmarkCompareCommand);
        this.log(JSON.stringify(new SkillBenchmarkService().compare(flags.benchmark)));
    }
}
