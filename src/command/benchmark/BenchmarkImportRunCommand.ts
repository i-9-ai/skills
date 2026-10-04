// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { SkillBenchmarkService } from '../../service/SkillBenchmarkService.ts';

export default class BenchmarkImportRunCommand extends Command {
    static description =
        'Import one explicit run assertion and retain its verified artifact bytes without overwriting a run.';
    static examples = [
        '<%= config.bin %> benchmark import-run --benchmark /tmp/skill-benchmark --run /tmp/run.json --artifacts /tmp/run-output',
    ];
    static flags = {
        benchmark: Flags.string({
            required: true,
            description: 'Previously frozen benchmark directory.',
        }),
        run: Flags.string({
            required: true,
            description:
                'Closed run assertion with complete criterion results and artifact hashes.',
        }),
        artifacts: Flags.string({
            required: true,
            description: 'Stable directory containing the declared regular artifact files.',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(BenchmarkImportRunCommand);
        this.log(
            JSON.stringify(
                new SkillBenchmarkService().importRun(flags.benchmark, flags.run, flags.artifacts),
            ),
        );
    }
}
