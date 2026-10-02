// SPDX-License-Identifier: Apache-2.0
import { ProjectConfiguration } from '../config/ProjectConfiguration.ts';
import { PluginArtifactRepository } from '../repository/PluginArtifactRepository.ts';
import type { PluginFile } from '../repository/PluginArtifactRepository.ts';
import { PluginZipRepository } from '../repository/PluginZipRepository.ts';
import { PluginPreparationService } from './PluginPreparationService.ts';
import { PluginListingValidator } from '../validator/PluginListingValidator.ts';

/** Explicit public projection; preparation establishes local integrity, not provider approval. */
export class PluginSubmissionService {
    private readonly artifacts: PluginArtifactRepository;
    private readonly preparation: PluginPreparationService;
    private readonly archives: PluginZipRepository;

    constructor(
        artifacts = new PluginArtifactRepository(),
        preparation = new PluginPreparationService(artifacts),
        archives = new PluginZipRepository(),
    ) {
        this.artifacts = artifacts;
        this.preparation = preparation;
        this.archives = archives;
    }

    prepare(configuration: ProjectConfiguration, output: string, write = false) {
        const artifact = this.preparation.derive(configuration, [
            {
                name: 'skills-usage-setup',
                reason: 'Optional persistent host-command registration is excluded from the public directory profile pending separate security review; available in the complete repository and npm distribution.',
            },
        ]);
        this.assertPublicFiles(artifact.files);
        const staging = this.artifacts.emit(output, artifact.files, false);
        const destinations = this.archives.destinations(staging);
        const zip = this.archives.archive(artifact.files);
        const summary = {
            schema_version: 1,
            profile: 'public_skills_only',
            plugin: artifact.manifest.name,
            version: artifact.manifest.version,
            packages: artifact.packages,
            excluded_skills: artifact.excluded_skills,
            files: artifact.file_count,
            inventory_sha256: artifact.inventory_sha256,
            archive: {
                file: 'i9-skills.zip',
                format: 'zip32-store',
                byte_length: zip.length,
                sha256: this.archives.digest(zip),
            },
            submission: 'not_submitted',
            approval: 'unverified',
        };
        const summaryBytes = Buffer.from(JSON.stringify(summary, null, 2) + '\n');
        if (write) {
            this.artifacts.emit(staging, artifact.files, true);
            this.archives.write(destinations.archive, zip);
            this.archives.write(destinations.summary, summaryBytes);
        }
        return {
            written: write,
            output: staging,
            archive: destinations.archive,
            summary: destinations.summary,
            integrity: summary,
            effects: write
                ? 'Created a skills-only staging folder, ZIP and integrity summary.'
                : 'Preview only; no files written.',
        };
    }

    private assertPublicFiles(files: PluginFile[]): void {
        for (const file of files) {
            if (
                ![
                    'plugin.json',
                    '.codex-plugin/plugin.json',
                    'artifact-receipt.json',
                    'LICENSE',
                    'NOTICE',
                    'assets/plugin-icon.png',
                ].includes(file.path) &&
                !/^skills\/[a-z0-9]+(?:-[a-z0-9]+)*\/.+$/u.test(file.path)
            )
                throw new Error('Public submission contains an unsupported component.');
            if (
                file.path
                    .split('/')
                    .some(
                        (part) =>
                            [
                                '.git',
                                '.work',
                                '.beads',
                                'node_modules',
                                '.env',
                                '.codex',
                                '.claude',
                            ].includes(part) || part.startsWith('.env.'),
                    ) ||
                /\.(?:db|sqlite3?)(?:-(?:wal|shm))?$/iu.test(file.path)
            )
                throw new Error('Public submission contains local state.');
        }
        let publicListing: Record<string, any> | undefined;
        const listingValidator = new PluginListingValidator();
        const icon = files.find((file) => file.path === 'assets/plugin-icon.png');
        if (!icon) throw new Error('Public submission requires its referenced plugin icon.');
        listingValidator.validateIcon(icon.bytes);
        for (const path of ['plugin.json', '.codex-plugin/plugin.json']) {
            const file = files.find((entry) => entry.path === path);
            if (!file) throw new Error('Public submission requires both prepared manifests.');
            const manifest = JSON.parse(file.bytes.toString('utf8'));
            if (
                ['hooks', 'mcpServers', 'apps', 'resources'].some((field) =>
                    Object.hasOwn(manifest, field),
                )
            )
                throw new Error('Public submission manifest contains an unsupported component.');
            const extension = manifest.extensions;
            if (path === 'plugin.json') {
                if (
                    !extension ||
                    Object.keys(extension).length !== 1 ||
                    !extension['com.openai'] ||
                    Object.keys(extension['com.openai']).length !== 1 ||
                    !Object.hasOwn(extension['com.openai'], 'interface')
                )
                    throw new Error(
                        'Public submission allows only the OpenAI presentation extension.',
                    );
                publicListing = extension['com.openai'].interface;
                listingValidator.validate(publicListing);
                continue;
            }
            if (extension !== undefined)
                throw new Error('Compatibility manifest cannot add public extensions.');
            listingValidator.validate(manifest.interface);
            if (JSON.stringify(manifest.interface) !== JSON.stringify(publicListing))
                throw new Error('Public and compatibility listing metadata must match.');
        }
    }
}
