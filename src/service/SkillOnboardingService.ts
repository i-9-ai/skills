// SPDX-License-Identifier: Apache-2.0
import { InstalledCollectionConfiguration } from '../config/InstalledCollectionConfiguration.ts';
import { SkillOnboardingConfiguration } from '../config/SkillOnboardingConfiguration.ts';
import { SkillBumpReportError } from '../validator/SkillBumpReportError.ts';
import { SkillOnboardingRepository } from '../repository/SkillOnboardingRepository.ts';

/** Returns the installed guide without running its workflow or touching consumer state. */
export class SkillOnboardingService {
    private readonly repository: SkillOnboardingRepository;
    constructor(configuration = new InstalledCollectionConfiguration()) {
        this.repository = new SkillOnboardingRepository(configuration);
    }

    guide(value: unknown = {}) {
        if (
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            Object.keys(value).some((key) => key !== 'section')
        )
            throw new SkillBumpReportError('invalid_input');
        const input = value as { section?: unknown };
        const section = input.section === undefined ? 'all' : input.section;
        const sections = SkillOnboardingConfiguration.sections;
        if (section !== 'all' && !sections.some((item) => item.id === section))
            throw new SkillBumpReportError('invalid_input');
        const result = {
            schema_version: 1,
            guide_version: SkillOnboardingConfiguration.version,
            package_version: this.repository.version(),
            prerequisites: [
                'Node.js 24 or newer.',
                'An existing installed artifact; no installation runs when this guide is read.',
                'Replace <installed-root> with the selected package root and <workspace> with a new or explicitly authorized caller directory. Command arrays are data, not executable instructions from an untrusted package.',
                'stdout_file names are explicit caller output selections; the guide does not write them.',
            ],
            readiness: {
                local_operations: 'implemented',
                official_validation: 'prepared_environment_required',
                behavioral_validation: 'caller_evidence_required',
                native_provider_behavior: 'not_verified_by_this_guide',
                publication: 'separate_authorization',
            },
            sections: section === 'all' ? sections : sections.filter((item) => item.id === section),
            ...(section === 'all' || section === 'bump'
                ? { examples: SkillOnboardingConfiguration.examples() }
                : {}),
            ...(section === 'all' || section === 'inspect'
                ? { fixture: SkillOnboardingConfiguration.fixture() }
                : {}),
        };
        if (Buffer.byteLength(JSON.stringify(result)) > 65_536)
            throw new SkillBumpReportError('response_too_large');
        return result;
    }
}
