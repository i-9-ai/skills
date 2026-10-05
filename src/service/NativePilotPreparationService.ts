// SPDX-License-Identifier: Apache-2.0
import { NativePilotContractValidator } from '../validator/NativePilotContractValidator.ts';
import { NativePilotPreparationRepository } from '../repository/NativePilotPreparationRepository.ts';

/** Resolves every declared gate before creating a private, inert preparation. */
export class NativePilotPreparationService {
    readonly validator = new NativePilotContractValidator();
    readonly repository = new NativePilotPreparationRepository();

    prepare(contract: unknown, inputs: unknown, destination: string) {
        return this.repository.prepare(this.validator.resolved(contract), inputs, destination);
    }
}
