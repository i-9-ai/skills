// SPDX-License-Identifier: Apache-2.0
import { NativePilotCommonPhaseService } from '../service/NativePilotCommonPhaseService.ts';
import { NativePilotCommonPhaseRepository } from '../repository/NativePilotCommonPhaseRepository.ts';
import { NativePilotContainerWorkerRepository } from '../repository/NativePilotContainerWorkerRepository.ts';

try {
    const service = new NativePilotCommonPhaseService();
    service.selection(process.argv.slice(2));
    const worker = NativePilotContainerWorkerRepository.load('/pilot/control/worker.json');
    const result = await service.run(
        process.argv.slice(2),
        new NativePilotCommonPhaseRepository(worker),
    );
    process.stdout.write(JSON.stringify(result) + '\n');
} catch {
    process.stderr.write(
        'Common native phase blocked; preserve bounded phase files and controller receipts.\n',
    );
    process.exitCode = 2;
}
