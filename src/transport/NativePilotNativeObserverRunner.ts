// SPDX-License-Identifier: Apache-2.0
import { NativePilotNativeObservationService } from '../service/NativePilotNativeObservationService.ts';

try {
    const report = await new NativePilotNativeObservationService().run(process.argv.slice(2));
    process.stdout.write(JSON.stringify(report) + '\n');
    if (!['observed', 'captured'].includes((report as { status: string }).status))
        process.exitCode = 2;
} catch {
    process.stderr.write(
        'Fixed native host observation blocked; retain the confined phase evidence.\n',
    );
    process.exitCode = 2;
}
