// SPDX-License-Identifier: Apache-2.0
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NativePilotHost } from '../config/NativePilotConfiguration.ts';
import type { NativePilotDockerExecutor } from '../repository/NativePilotDockerRepository.ts';
import { NativePilotInventoryRepository } from '../repository/NativePilotInventoryRepository.ts';
import { NativePilotDockerProcessRepository } from '../repository/NativePilotDockerProcessRepository.ts';
import { NativePilotPreparationService } from './NativePilotPreparationService.ts';
import { NativePilotLifecycleService } from './NativePilotLifecycleService.ts';
import { NativePilotContainerService } from './NativePilotContainerService.ts';
import { NativePilotContainerAdapterService } from './NativePilotContainerAdapterService.ts';
import { NativePilotCommonObservationService } from './NativePilotCommonObservationService.ts';
import type { NativePilotContainerObservationProjection } from './NativePilotContainerAdapterService.ts';
import {
    closedObject,
    NativePilotContractValidator,
} from '../validator/NativePilotContractValidator.ts';
import {
    NativePilotContainerValidator,
    requireContainer,
} from '../validator/NativePilotContainerValidator.ts';

/** Bundled trusted orchestration. Selected observers are never imported into this host process. */
export class NativePilotOperatorService {
    async run(
        requestPath: string,
        createExecutor: (host: NativePilotHost) => NativePilotDockerExecutor = (host) =>
            new NativePilotDockerProcessRepository().lifecycle(host),
    ) {
        const inventory = new NativePilotInventoryRepository();
        requireContainer(
            typeof requestPath === 'string' &&
                isAbsolute(requestPath) &&
                resolve(requestPath) === requestPath,
            'A canonical absolute operator request path is required.',
        );
        inventory.canonicalDirectory(dirname(requestPath));
        const request = closedObject(
            inventory.readJson(requestPath),
            [
                'schema_version',
                'contract_path',
                'inputs_path',
                'container_pin_path',
                'preparation_root',
                'lanes',
            ],
            'operator request',
        );
        requireContainer(request.schema_version === 1, 'Unsupported operator request.');
        for (const key of [
            'contract_path',
            'inputs_path',
            'container_pin_path',
            'preparation_root',
        ])
            requireContainer(
                typeof request[key] === 'string' &&
                    isAbsolute(request[key]) &&
                    resolve(request[key]) === request[key],
                'Canonical absolute operator paths are required.',
            );
        const coordinator = new NativePilotLifecycleService();
        const lanes = coordinator.selections(request.lanes);
        const contract = new NativePilotContractValidator().resolved(
            inventory.readJson(request.contract_path as string),
        );
        const inputs = closedObject(
            inventory.readJson(request.inputs_path as string),
            ['source_a', 'source_b', 'driver', 'observer', 'node', 'codex', 'claude'],
            'operator inputs',
        );
        requireContainer(
            Object.values(inputs).every((value) => typeof value === 'string' && isAbsolute(value)),
            'Selected input paths must be absolute.',
        );
        const selectedImage = inventory.readJson(request.container_pin_path as string);
        new NativePilotContainerValidator().pin(selectedImage, contract);
        const runningRoot = inventory.canonicalDirectory(
            resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
        );
        inventory.verifyRunningExport(
            inputs.driver as string,
            contract.driver.tree_sha256,
            runningRoot,
            relative(runningRoot, fileURLToPath(import.meta.url)),
        );
        inventory.verifyPrivateReview(contract.driver, 'driver');
        inventory.verifyPrivateReview(contract.observer, 'observer');
        const prepared = new NativePilotPreparationService().prepare(
            contract,
            inputs,
            request.preparation_root as string,
        );
        return await coordinator.run(prepared, lanes, async (selection) => {
            const projection = new NativePilotCommonObservationService({
                prepared,
                evidenceRoot: join(prepared.root, 'output', 'evidence'),
            }) as NativePilotContainerObservationProjection;
            requireContainer(
                projection && typeof projection.project === 'function',
                'Common observer must expose project(step,selection,facts).',
            );
            const controller = new NativePilotContainerService(
                prepared,
                selection,
                selectedImage,
                createExecutor(selection.host),
            );
            return new NativePilotContainerAdapterService(controller, 'native', projection);
        });
    }
}
