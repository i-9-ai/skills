// SPDX-License-Identifier: Apache-2.0
import { closeSync, fchmodSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { ProjectConfiguration } from '../config/ProjectConfiguration.ts';
import { CollectionFilesystemRepository, LIMITS } from './CollectionFilesystemRepository.ts';
import { CollectionCatalogRepository } from './CollectionCatalogRepository.ts';

export type PluginFile = { path: string; bytes: Buffer; mode: number };
export type PluginSource = {
    version: string;
    description: string;
    homepage: string;
    repository: string;
    license: string;
    skills: string[];
    files: PluginFile[];
};

const versionNumber = '(?:0|[1-9][0-9]*)';
const prereleaseIdentifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
const semanticVersion = new RegExp(
    `^${versionNumber}\\.${versionNumber}\\.${versionNumber}` +
        `(?:-${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*)?` +
        '(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?![\\s\\S])',
);

/** Reads reviewed packages and writes a new staging artifact; never installs it. */
export class PluginArtifactRepository {
    read(configuration: ProjectConfiguration): PluginSource {
        const source = new CollectionFilesystemRepository(configuration.root());

        try {
            new CollectionCatalogRepository().check({
                collection: source.path,
                layout: 'repository',
            });
            const manifest = source.readJson('package.json');
            if (manifest.name !== '@i-9-ai/skills' || manifest.license !== 'Apache-2.0') {
                throw new Error('Plugin preparation requires the I-9 Skills package identity.');
            }

            for (const field of ['version', 'description', 'homepage']) {
                if (typeof manifest[field] !== 'string' || !manifest[field].trim()) {
                    throw new Error(`Package ${field} must be a nonblank string.`);
                }
            }
            if (typeof manifest.repository?.url !== 'string') {
                throw new Error('Package repository.url must identify its source.');
            }
            if (!semanticVersion.test(manifest.version)) {
                throw new Error('Package version must use strict semantic versioning.');
            }
            const repository = manifest.repository.url.replace(/^git\+/, '');
            for (const value of [manifest.homepage, repository]) {
                const url = new URL(value);
                if (url.protocol !== 'https:' || url.username || url.password) {
                    throw new Error('Plugin source URLs must use HTTPS without credentials.');
                }
            }

            const catalog = source.readJson(relative(source.path, configuration.catalogFile()));
            const files: PluginFile[] = [
                { path: 'LICENSE', bytes: source.readBytes('LICENSE'), mode: 0o644 },
            ];
            if (source.inspect('NOTICE', { allowMissingLeaf: true }).info) {
                files.push({ path: 'NOTICE', bytes: source.readBytes('NOTICE'), mode: 0o644 });
            }

            let totalBytes = files.reduce((total, file) => total + file.bytes.length, 0);
            const skills: string[] = [];

            for (const skill of catalog.skills) {
                source.validatePackage(skill.path);
                const packageRoot = new CollectionFilesystemRepository(
                    join(source.path, skill.path),
                );
                try {
                    skills.push(skill.name);
                    for (const [file, info] of packageRoot.inventory()) {
                        if (!info.isFile()) continue;
                        totalBytes += info.size;
                        if (totalBytes > 64 * 1024 * 1024 || files.length >= 10_000) {
                            throw new Error('Plugin staging exceeds 64 MiB or 10000 files.');
                        }
                        files.push({
                            path: `skills/${skill.name}/${file}`,
                            bytes: packageRoot.readBytes(file, LIMITS.artifactBytes),
                            mode: info.mode & 0o111 ? 0o755 : 0o644,
                        });
                    }
                } finally {
                    packageRoot.close();
                }
            }

            return {
                version: manifest.version,
                description: manifest.description,
                homepage: manifest.homepage,
                repository,
                license: manifest.license,
                skills,
                files,
            };
        } finally {
            source.close();
        }
    }

    /** Refuse existing output. A failed write retains only its new partial artifact. */
    emit(output: string, files: PluginFile[], write: boolean): string {
        if (!output.trim() || output.includes('\0') || !output.isWellFormed()) {
            throw new Error('Output must be a nonblank, valid staging path.');
        }
        const selected = resolve(output);
        if (basename(selected) !== 'i9-skills') {
            throw new Error('The new staging folder must be named i9-skills.');
        }
        const parent = new CollectionFilesystemRepository(dirname(selected));

        try {
            const destination = join(parent.path, 'i9-skills');
            const normalized = destination.replaceAll('\\', '/').toLowerCase();
            if (
                /\/(?:\.agents|\.claude|\.gemini)\/(?:skills|plugins)(?:\/|$)/.test(normalized) ||
                /\/\.codex\/(?:skills|plugins)(?:\/|$)/.test(normalized) ||
                normalized.split('/').includes('.system')
            ) {
                throw new Error('Use a neutral staging folder outside host discovery directories.');
            }
            if (parent.inspect('i9-skills', { allowMissingLeaf: true }).info) {
                throw new Error('The staging destination already exists; select a new parent.');
            }
            if (!write) return destination;

            parent.assertStable();
            mkdirSync(destination, { mode: 0o700 });
            const artifact = new CollectionFilesystemRepository(destination);
            try {
                for (const file of files) {
                    const parts = file.path.split('/');
                    for (let depth = 1; depth < parts.length; depth += 1) {
                        const directory = parts.slice(0, depth).join('/');
                        const found = artifact.inspect(directory, { allowMissingLeaf: true });
                        if (!found.info) mkdirSync(found.absolute, { mode: 0o755 });
                    }
                    const target = artifact.inspect(file.path, { allowMissingLeaf: true });
                    if (target.info)
                        throw new Error('An artifact path appeared during preparation.');
                    artifact.verifySnapshot(target);
                    const descriptor = openSync(target.absolute, 'wx', file.mode);
                    try {
                        writeFileSync(descriptor, file.bytes);
                        fchmodSync(descriptor, file.mode);
                    } finally {
                        closeSync(descriptor);
                    }
                    if (!artifact.readBytes(file.path, LIMITS.artifactBytes).equals(file.bytes)) {
                        throw new Error('An artifact file changed during preparation.');
                    }
                }
            } finally {
                artifact.close();
            }
            return destination;
        } finally {
            parent.close();
        }
    }
}
