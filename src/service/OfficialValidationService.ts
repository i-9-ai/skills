// SPDX-License-Identifier: Apache-2.0
import { OfficialValidator } from '../validator/OfficialValidator.ts';
import { OfficialValidatorProcessRepository } from '../repository/OfficialValidatorProcessRepository.ts';
import { CollectionValidationService } from './CollectionValidationService.ts';

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
    validateOfficial(root: string) {
        this.collection.validateRepository(root);
        const requirements = this.validator.officialRequirements(
            this.repository.readOfficialConfiguration(root),
        );
        const packages = this.repository.canonicalSkills(root);
        this.repository.installOfficialValidator(root, requirements);
        return this.repository.runOfficialValidator(root, packages, requirements.version);
    }
}
