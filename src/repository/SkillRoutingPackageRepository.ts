// SPDX-License-Identifier: Apache-2.0
import { realpathSync } from 'node:fs';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { PortableFrontmatterValidator } from '../validator/PortableFrontmatterValidator.ts';
import { SkillEvidenceContractValidator } from '../validator/SkillEvidenceContractValidator.ts';
import { SkillPackageRevisionRepository } from './SkillPackageRevisionRepository.ts';

/** Resolve caller-selected packages inertly; retain no local paths or package text. */
export class SkillRoutingPackageRepository {
    inspect(directory: string) {
        const canonical = realpathSync(directory);
        const revisions = new SkillPackageRevisionRepository();
        const revision = revisions.inspect(canonical, { requireLicense: false });
        const root = new SafeRoot(canonical);
        try {
            const bytes = root.readBytes('SKILL.md', 131072);
            const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            const metadata = new PortableFrontmatterValidator().parse(text) as Record<
                string,
                unknown
            >;
            const contract = new SkillEvidenceContractValidator();
            const skill = contract.slug(metadata.name);
            if (
                revisions.inspect(canonical, { requireLicense: false }).package_sha256 !==
                revision.package_sha256
            )
                contract.invalid();
            return {
                canonical,
                skill,
                bytes: revision.bytes,
                source: {
                    repository: null,
                    source_ref: null,
                    resolved_git_sha: null,
                    package_path: skill,
                    package_sha256: revision.package_sha256,
                },
            };
        } finally {
            root.close();
        }
    }
}
