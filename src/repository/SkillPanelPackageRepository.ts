// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { PortableFrontmatterValidator } from '../validator/PortableFrontmatterValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';
import { PANEL_TEXT_BYTES } from '../validator/SkillPanelValidator.ts';
import { SkillPackageRevisionRepository } from './SkillPackageRevisionRepository.ts';

/** Shared inert full-package observation for catalog eligibility and retained evolution. */
export class SkillPanelPackageRepository {
    private readonly revisions = new SkillPackageRevisionRepository();

    inspect(directory: string) {
        const root = new SafeRoot(directory);
        try {
            const inventory = root.inventory() as [string, fs.Stats][];
            if (
                inventory.length > 512 ||
                inventory.reduce((total, [, info]) => total + (info.isFile() ? info.size : 0), 0) >
                    8_388_608
            )
                throw new SkillOperationError('invalid_input');
            const revision = this.revisions.inspect(directory);
            const bytes = root.readBytes('SKILL.md', PANEL_TEXT_BYTES);
            const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
            const metadata = new PortableFrontmatterValidator().parse(
                text.replace(/^\uFEFF/u, ''),
            ) as Record<string, unknown>;
            if (metadata.name !== basename(directory))
                throw new SkillOperationError('invalid_input');
            const modes = inventory
                .map(([name, info]) => [name, info.mode & 0o777])
                .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'en'));
            const package_sha256 = createHash('sha256')
                .update(
                    JSON.stringify({
                        content: revision.package_sha256,
                        root_mode: fs.statSync(root.path).mode & 0o777,
                        modes,
                    }),
                )
                .digest('hex');
            if (this.revisions.inspect(directory).package_sha256 !== revision.package_sha256)
                throw new SkillOperationError('panel_conflict');
            return {
                text,
                sha256: createHash('sha256').update(bytes).digest('hex'),
                package_sha256,
                description: String(metadata.description),
                files: revision.files,
                bytes: revision.bytes,
            };
        } finally {
            root.close();
        }
    }
}
