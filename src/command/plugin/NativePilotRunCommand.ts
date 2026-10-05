// SPDX-License-Identifier: Apache-2.0
import { Command, Flags } from '@oclif/core';

/** Explicit operator entrypoint; the service owns preparation and native execution. */
export default class NativePilotRunCommand extends Command {
    static description =
        'Run a reviewed native plugin lifecycle matrix in owned disposable containers.';
    static flags = {
        request: Flags.string({
            required: true,
            description: 'Canonical absolute path to the closed operator request JSON.',
        }),
        execute: Flags.boolean({
            default: false,
            description: 'Explicitly permit preparation and the selected disposable native runs.',
        }),
    };
    static examples = [
        '<%= config.bin %> plugin pilot --request /staging/native-pilot/operator.json --execute',
    ];

    async run(): Promise<void> {
        const { flags } = await this.parse(NativePilotRunCommand);
        if (!flags.execute) {
            this.error('Native pilot execution requires --execute; no preparation was created.');
        }

        // Load only the fixed bundled operator after the explicit opt-in.
        const { NativePilotOperatorService } =
            await import('../../service/NativePilotOperatorService.ts');
        const { report, receipt } = await new NativePilotOperatorService().run(flags.request);
        this.log(
            JSON.stringify({
                schema_version: 1,
                native_acceptance: false,
                status: report.summary.status,
                report: receipt,
                operator_failure: report.operator_failure,
                unattempted_lanes: report.unattempted_lanes,
                lanes: report.summary.lanes,
            }),
        );

        if (!report.summary.exercise_evidence_complete || report.operator_failure) {
            this.exit(1);
        }
    }
}
