// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { InstalledCollectionConfiguration } from '../config/InstalledCollectionConfiguration.ts';
import { InstalledSkillRepository } from './InstalledSkillRepository.ts';
import { SkillInstallationValidator } from '../validator/SkillInstallationValidator.ts';
import type {
    SkillInstallationEntry,
    SkillInstallationPackage,
} from '../validator/SkillInstallationValidator.ts';

export const installationDigest = (value: Buffer | string) =>
    createHash('sha256').update(value).digest('hex');

/** Captures ordinary package bytes without running scripts or source retrieval. */
export class SkillBundleRepository {
    readonly configuration: InstalledCollectionConfiguration;
    constructor(configuration = new InstalledCollectionConfiguration()) {
        this.configuration = configuration;
    }

    bundle() {
        const catalog = new InstalledSkillRepository(this.configuration).catalog();
        if (!catalog.skills.length || catalog.skills.length > 64)
            throw new Error('Unsupported bundle size.');
        const packages = catalog.skills.map((skill) =>
            this.inventory(join(this.configuration.root(), skill.path), skill.name),
        );
        if (
            packages.reduce((n, item) => n + item.entries.reduce((s, row) => s + row.bytes, 0), 0) >
            134_217_728
        )
            throw new Error('Bundle exceeds the installation byte limit.');
        return {
            version: catalog.provenance.package_version,
            catalog_sha256: catalog.provenance.catalog_sha256,
            source_git_sha: catalog.provenance.resolved_git_sha,
            packages,
        };
    }

    inventory(directory: string, name: string): SkillInstallationPackage {
        const root = new SafeRoot(directory);
        try {
            const entries: SkillInstallationEntry[] = root
                .inventory()
                .map(([path, info]: [string, import('node:fs').Stats]): SkillInstallationEntry => ({
                    path,
                    kind: info.isDirectory() ? 'directory' : 'file',
                    bytes: info.isDirectory() ? 0 : info.size,
                    sha256: info.isDirectory()
                        ? null
                        : installationDigest(root.readBytes(path, 4_194_304)),
                    executable: info.isFile() && Boolean(info.mode & 0o111),
                }))
                .sort((a: SkillInstallationEntry, b: SkillInstallationEntry) =>
                    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
                );
            const result = { name, sha256: installationDigest(JSON.stringify(entries)), entries };
            return new SkillInstallationValidator().package(result);
        } finally {
            root.close();
        }
    }

    bytes(name: string, path: string): Buffer {
        const root = new SafeRoot(join(this.configuration.root(), '.agents/skills', name));
        try {
            return root.readBytes(path, 4_194_304);
        } finally {
            root.close();
        }
    }
}
