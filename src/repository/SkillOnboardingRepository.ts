// SPDX-License-Identifier: Apache-2.0
import { InstalledCollectionConfiguration } from '../config/InstalledCollectionConfiguration.ts';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { strictJson } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';
import { ReleaseVersionValidator } from '../validator/ReleaseVersionValidator.ts';
import { SkillBumpReportError } from '../validator/SkillBumpReportError.ts';

/** Reads only installed identity; guide access never discovers a caller collection. */
export class SkillOnboardingRepository {
    private readonly configuration: InstalledCollectionConfiguration;
    constructor(configuration = new InstalledCollectionConfiguration()) {
        this.configuration = configuration;
    }

    version(): string {
        let root: SafeRoot | undefined;
        try {
            root = new SafeRoot(this.configuration.root());
            const validator = new ReleaseVersionValidator();
            const manifest = validator.document(strictJson(root.readBytes('package.json', 65536)));
            if (manifest.name !== '@i-9-ai/skills') throw new Error();
            return validator.version(manifest);
        } catch {
            throw new SkillBumpReportError('onboarding_unavailable');
        } finally {
            root?.close();
        }
    }
}
