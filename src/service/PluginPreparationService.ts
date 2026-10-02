// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { ProjectConfiguration } from '../config/ProjectConfiguration.ts';
import { PluginArtifactRepository } from '../repository/PluginArtifactRepository.ts';
import type { PluginFile } from '../repository/PluginArtifactRepository.ts';
import { LIMITS } from '../repository/CollectionFilesystemRepository.ts';
import { relativeParts } from '../../.agents/skills/skill-authoring/scripts/skill_tools.mjs';
import { PluginListingValidator } from '../validator/PluginListingValidator.ts';

const jsonFile = (path: string, value: unknown): PluginFile => ({
    path,
    bytes: Buffer.from(JSON.stringify(value, null, 2) + '\n'),
    mode: 0o644,
});
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** Derives both plugin manifests and a deterministic integrity receipt from one source. */
export class PluginPreparationService {
    private readonly repository: PluginArtifactRepository;

    constructor(repository = new PluginArtifactRepository()) {
        this.repository = repository;
    }

    prepare(configuration: ProjectConfiguration, output: string, write = false) {
        const { files, file_count, ...artifact } = this.derive(configuration);
        const destination = this.repository.emit(output, files, write);
        return {
            written: write,
            output: destination,
            ...artifact,
            files: file_count,
            effects: write
                ? 'Created a new local staging artifact.'
                : 'Preview only; no files written.',
        };
    }

    /** Reuse the same validated projection without staging or executing its files. */
    derive(
        configuration: ProjectConfiguration,
        exclusions: { name: string; reason: string }[] = [],
    ) {
        const source = this.repository.read(configuration);
        new PluginListingValidator().validate(source.listing);
        if (
            exclusions.some(
                (entry) =>
                    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name) ||
                    !entry.reason.trim() ||
                    entry.reason.length > 256,
            ) ||
            new Set(exclusions.map((entry) => entry.name)).size !== exclusions.length
        )
            throw new Error(
                'Plugin exclusions must have distinct skill names and explicit reasons.',
            );
        const excluded = exclusions.filter((entry) => source.skills.includes(entry.name));
        const selectedSkills = source.skills.filter(
            (name) => !excluded.some((entry) => entry.name === name),
        );
        const selectedFiles = source.files.filter(
            (file) => !excluded.some((entry) => file.path.startsWith(`skills/${entry.name}/`)),
        );
        const identity = {
            name: 'i9-skills',
            version: source.version,
            description: source.description,
            author: { name: 'I-9 AI' },
            homepage: source.homepage,
            repository: source.repository,
            license: source.license,
            keywords: ['agent-skills', 'skill-authoring', 'skill-lifecycle'],
        };
        const manifest = {
            $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
            ...identity,
            extensions: { 'com.openai': { interface: source.listing } },
        };
        const compatibility = {
            ...identity,
            skills: './skills/',
            interface: source.listing,
        };
        const manifests = [
            jsonFile('.codex-plugin/plugin.json', compatibility),
            jsonFile('plugin.json', manifest),
        ];
        const inventory = [...selectedFiles, ...manifests]
            .map((file) => ({
                path: file.path,
                size: file.bytes.length,
                mode: file.mode,
                sha256: sha256(file.bytes),
            }))
            .sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
        const receipt = {
            schema_version: 1,
            plugin: identity.name,
            version: identity.version,
            skills: selectedSkills,
            excluded_skills: excluded,
            files: inventory,
            inventory_sha256: sha256(Buffer.from(JSON.stringify(inventory))),
        };
        // Manifests are written last; no scripts, registration or installation runs.
        const files = [...selectedFiles, jsonFile('artifact-receipt.json', receipt), ...manifests];
        for (const file of files) relativeParts(file.path);
        if (
            files.length > 10_000 ||
            files.reduce((total, file) => total + file.bytes.length, 0) > 64 * 1024 * 1024 ||
            files.some((file) => file.bytes.length > LIMITS.artifactBytes)
        ) {
            throw new Error('Complete plugin artifact exceeds its file count or byte bounds.');
        }
        return {
            files,
            manifest,
            packages: selectedSkills.length,
            excluded_skills: excluded,
            file_count: inventory.length + 1,
            inventory_sha256: receipt.inventory_sha256,
        };
    }
}
