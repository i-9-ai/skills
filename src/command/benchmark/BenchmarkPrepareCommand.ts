// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';
import { ProjectConfiguration } from '../../config/ProjectConfiguration.ts';
import { SkillBenchmarkService } from '../../service/SkillBenchmarkService.ts';

export default class BenchmarkPrepareCommand extends Command {
    static description =
        'Freeze an inert behavioral suite, executor inputs and selected package bytes into a new directory.';
    static examples = [
        '<%= config.bin %> benchmark prepare --suite benchmarks/behavioral/suite.json --output /tmp/skill-benchmark --project .',
    ];
    static flags = {
        suite: Flags.string({
            required: true,
            description: 'Closed suite JSON; resources resolve beside this file.',
        }),
        output: Flags.string({
            required: true,
            description: 'New directory outside source trees; parent must exist.',
        }),
        project: Flags.string({
            description:
                'Caller project supplying .agents/skills; defaults to the current directory.',
        }),
        'skills-root': Flags.string({
            description: 'Explicit package collection instead of the selected project collection.',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(BenchmarkPrepareCommand);
        const project = new ProjectConfiguration({ root: flags.project ?? process.cwd() });
        this.log(
            JSON.stringify(
                new SkillBenchmarkService().prepare(
                    flags.suite,
                    flags['skills-root'] ?? project.skillsDirectory(),
                    flags.output,
                ),
            ),
        );
    }
}
