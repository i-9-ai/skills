// SPDX-License-Identifier: Apache-2.0
import { OfficialValidator } from '../validator/OfficialValidator.ts';
import type { OfficialRequirements } from '../validator/OfficialValidator.ts';
import { OfficialValidatorProcessRepository } from '../repository/OfficialValidatorProcessRepository.ts';
import type {
    OfficialPackage,
    OfficialValidatorCallbacks,
} from '../repository/OfficialValidatorProcessRepository.ts';
import { CollectionValidationService } from './CollectionValidationService.ts';

/** Internal observation hooks; callers cannot supply validation verdicts through this seam. */
export interface OfficialValidationCallbacks extends OfficialValidatorCallbacks {
    beforeSetup?: (
        requirements: OfficialRequirements,
        packages: readonly OfficialPackage[],
    ) => void;
    onSetup?: (state: 'started' | 'completed' | 'setup_failed') => void;
}

/** Sequences local safety checks, pinned external setup and official conformance results. */
export class OfficialValidationService {
    private readonly collection: Pick<CollectionValidationService, 'validateRepository'>;
    private readonly validator: Pick<OfficialValidator, 'officialRequirements'>;
    private readonly repository: OfficialValidatorProcessRepository;

    constructor(
        collection: Pick<
            CollectionValidationService,
            'validateRepository'
        > = new CollectionValidationService(),
        validator: Pick<OfficialValidator, 'officialRequirements'> = new OfficialValidator(),
        repository = new OfficialValidatorProcessRepository(),
    ) {
        this.collection = collection;
        this.validator = validator;
        this.repository = repository;
    }

    /** CI use case: local safety checks, pinned installation, then official results. */
    validateOfficial(root: string, callbacks: OfficialValidationCallbacks = {}) {
        this.collection.validateRepository(root);
        const requirements = this.validator.officialRequirements(
            this.repository.readOfficialConfiguration(root),
        );
        const packages = this.repository.canonicalSkills(root);
        callbacks.beforeSetup?.(
            Object.freeze({
                ...requirements,
                method: Object.freeze({ ...requirements.method }),
                phases: Object.freeze(
                    requirements.phases.map((phase) =>
                        Object.freeze({ ...phase, flags: Object.freeze([...phase.flags]) }),
                    ),
                ),
            }),
            Object.freeze(packages.map((skill) => Object.freeze({ ...skill }))),
        );
        callbacks.onSetup?.('started');
        try {
            this.repository.installOfficialValidator(root, requirements);
        } catch (error) {
            try {
                callbacks.onSetup?.('setup_failed');
            } finally {
                throw error;
            }
        }
        callbacks.onSetup?.('completed');
        return this.repository.runOfficialValidator(
            root,
            packages,
            requirements.version,
            undefined,
            callbacks,
        );
    }
}
