// SPDX-License-Identifier: Apache-2.0
import type { NativePilotBoundaryAdapter } from './NativePilotDriverService.ts';
import type {
    NativePilotMode,
    NativePilotSelection,
    NativePilotStep,
} from '../config/NativePilotConfiguration.ts';
import type { NativePilotControllerFacts } from './NativePilotContainerService.ts';
import { NativePilotContainerService } from './NativePilotContainerService.ts';

export interface NativePilotContainerObservationProjection {
    project(
        step: NativePilotStep,
        selection: NativePilotSelection,
        facts: NativePilotControllerFacts,
    ): Promise<unknown>;
}

/** Explicit seam: a reviewed host observer must project retained facts, never a default pass. */
export class NativePilotContainerAdapterService implements NativePilotBoundaryAdapter {
    readonly boundary = 'disposable-container-v1' as const;
    readonly mode: NativePilotMode;
    readonly driver_tree_sha256: string;
    readonly observer_tree_sha256: string;
    readonly controller: NativePilotContainerService;
    readonly projection: NativePilotContainerObservationProjection;
    constructor(
        controller: NativePilotContainerService,
        mode: NativePilotMode,
        projection: NativePilotContainerObservationProjection,
    ) {
        this.controller = controller;
        this.mode = mode;
        this.projection = projection;
        this.driver_tree_sha256 = controller.files.prepared.contract.driver.tree_sha256;
        this.observer_tree_sha256 = controller.files.prepared.contract.observer.tree_sha256;
    }
    async perform(step: NativePilotStep, selection: NativePilotSelection) {
        if (JSON.stringify(selection) !== JSON.stringify(this.controller.files.selection))
            throw new Error('Container selection differs.');
        const facts = await this.controller.perform(step);
        return await this.projection.project(step, selection, facts);
    }
    async abort(selection: NativePilotSelection) {
        if (JSON.stringify(selection) !== JSON.stringify(this.controller.files.selection))
            throw new Error('Abort selection differs.');
        await this.controller.abort();
    }
}
