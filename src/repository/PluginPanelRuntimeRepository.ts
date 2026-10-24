// SPDX-License-Identifier: Apache-2.0
import { dirname, join } from 'node:path';
import { closeSync, lstatSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { PluginFile } from './PluginArtifactRepository.ts';
import { CollectionFilesystemRepository, LIMITS } from './CollectionFilesystemRepository.ts';
import { ProjectConfiguration } from '../config/ProjectConfiguration.ts';
import { SkillPanelConfiguration } from '../config/SkillPanelConfiguration.ts';
import { SkillPanelCatalogRepository } from './SkillPanelCatalogRepository.ts';
import { basename, resolve } from 'node:path';

/** Retains compiled local runtime bytes; never compiles, installs or executes dependencies. */
export class PluginPanelRuntimeRepository {
    private static readonly receipt = 'dist/panel-runtime-receipt.json';

    /** Invoked only by the successful explicit build, after the compiler and source receipt. */
    capture(configuration: ProjectConfiguration, packages: PluginFile[]): void {
        const files = this.assemble(configuration, packages);
        const root = new CollectionFilesystemRepository(configuration.root());
        try {
            const target = root.inspect(PluginPanelRuntimeRepository.receipt, {
                allowMissingLeaf: true,
            });
            if (target.info)
                throw new Error('Panel build receipt already exists; use a fresh explicit build.');
            root.verifySnapshot(target);
            const fd = openSync(target.absolute, 'wx', 0o644);
            try {
                writeFileSync(
                    fd,
                    JSON.stringify({
                        schema_version: 1,
                        inventory_sha256: this.fingerprint(files),
                        source_sha256: this.sourceFingerprint(root),
                        yaml_sha256: this.fingerprint(this.yaml(root, true)),
                    }) + '\n',
                );
            } finally {
                closeSync(fd);
            }
        } finally {
            root.close();
        }
    }

    /** Validate lexical and physical roots before reading/staging and again before emission. */
    assertDestination(panel: SkillPanelConfiguration, output: string): void {
        const selected = resolve(output);
        const physical = (path: string): string => {
            const suffix: string[] = [];
            let candidate = resolve(path);
            for (let depth = 0; depth < 32; depth++) {
                try {
                    return join(realpathSync.native(candidate), ...suffix);
                } catch (error: any) {
                    if (error.code !== 'ENOENT') throw error;
                }
                suffix.unshift(basename(candidate));
                const parent = dirname(candidate);
                if (parent === candidate) break;
                candidate = parent;
            }
            throw new Error('Panel staging boundary cannot be resolved.');
        };
        const destination = physical(selected);
        for (const path of [
            panel.collection,
            panel.state,
            ...(panel.globalCollection ? [panel.globalCollection] : []),
        ]) {
            panel.assertSeparate(path, selected);
            panel.assertSeparate(physical(path), destination);
        }
        // Include external package-reference targets and reject incomplete coverage.
        new SkillPanelCatalogRepository(panel).assertWritableTargets(panel.collection, destination);
    }

    read(configuration: ProjectConfiguration, packages: PluginFile[]): PluginFile[] {
        const files = this.assemble(configuration, packages);
        const root = new CollectionFilesystemRepository(configuration.root());
        try {
            const receipt = root.readJson(PluginPanelRuntimeRepository.receipt);
            const source = this.sourceFingerprint(root);
            const yaml = this.yaml(root);
            if (
                Object.keys(receipt).sort().join(',') !==
                    'inventory_sha256,schema_version,source_sha256,yaml_sha256' ||
                receipt.schema_version !== 1 ||
                receipt.inventory_sha256 !== this.fingerprint(files) ||
                receipt.yaml_sha256 !== this.fingerprint(yaml) ||
                (receipt.source_sha256 !== null && !/^[a-f0-9]{64}$/.test(receipt.source_sha256)) ||
                (source !== null && receipt.source_sha256 !== source)
            )
                throw new Error(
                    'Panel runtime is incomplete or stale; run a fresh explicit build.',
                );
            return [...files, ...yaml];
        } finally {
            root.close();
        }
    }

    private fingerprint(files: PluginFile[]): string {
        return createHash('sha256')
            .update(
                JSON.stringify(
                    files
                        .map((file) => ({
                            path: file.path,
                            mode: file.mode,
                            sha256: createHash('sha256').update(file.bytes).digest('hex'),
                        }))
                        .sort((a, b) => a.path.localeCompare(b.path, 'en')),
                ),
            )
            .digest('hex');
    }

    private sourceFingerprint(root: CollectionFilesystemRepository): string | null {
        if (!root.inspect('src', { allowMissingLeaf: true }).info) return null;
        const files = this.directory(join(root.path, 'src'), 'src', (path) => path.endsWith('.ts'));
        for (const path of ['tsconfig.json', 'tsconfig.build.json'])
            if (root.inspect(path, { allowMissingLeaf: true }).info)
                files.push({ path, bytes: root.readBytes(path, LIMITS.jsonBytes), mode: 0o644 });
        return this.fingerprint(files);
    }

    private yaml(root: CollectionFilesystemRepository, build = false): PluginFile[] {
        const manifest = root.readJson('package.json');
        // The explicit compiler build can use its already-prepared development
        // module link. Consumer preparation still requires an ordinary retained
        // dependency, whose full inventory must match these captured bytes.
        const dependencyPath = build
            ? dirname(createRequire(join(root.path, 'package.json')).resolve('yaml/package.json'))
            : this.dependency(root.path);
        const dependency = new CollectionFilesystemRepository(dependencyPath);
        try {
            const pinned = dependency.readJson('package.json');
            if (
                pinned.name !== 'yaml' ||
                pinned.version !== manifest.dependencies?.yaml ||
                Object.keys(pinned.dependencies ?? {}).length !== 0
            )
                throw new Error(
                    'Panel preparation requires the pinned local YAML dependency without transitive dependencies.',
                );
        } finally {
            dependency.close();
        }
        return this.directory(dependencyPath, 'runtime/node_modules/yaml');
    }

    private assemble(configuration: ProjectConfiguration, packages: PluginFile[]): PluginFile[] {
        const root = new CollectionFilesystemRepository(configuration.root());
        try {
            const manifest = root.readJson('package.json');
            const files: PluginFile[] = [
                {
                    path: 'runtime/package.json',
                    bytes: Buffer.from(
                        JSON.stringify({
                            name: manifest.name,
                            version: manifest.version,
                            type: 'module',
                            license: manifest.license,
                            repository: manifest.repository,
                        }) + '\n',
                    ),
                    mode: 0o644,
                },
                {
                    path: 'runtime/skills-catalog.json',
                    bytes: root.readBytes('skills-catalog.json', LIMITS.jsonBytes),
                    mode: 0o644,
                },
                ...packages
                    .filter((file) => file.path.startsWith('skills/'))
                    .map((file) => ({
                        ...file,
                        path: `runtime/.agents/${file.path}`,
                    })),
            ];
            const compiled = this.directory(
                join(root.path, 'dist'),
                'runtime/dist',
                (path) => path.endsWith('.js') || path === 'source-receipt.json',
            );
            if (!compiled.some((file) => file.path === 'runtime/dist/transport/PluginMcpServer.js'))
                throw new Error('Build the compiled panel runtime before plugin preparation.');
            files.push(...compiled);
            for (const asset of ['skill-panel.html', 'skill-panel-icon.svg']) {
                files.push({
                    path: `runtime/assets/${asset}`,
                    bytes: root.readBytes(`assets/${asset}`, LIMITS.artifactBytes),
                    mode: 0o644,
                });
            }
            return files;
        } finally {
            root.close();
        }
    }

    private directory(
        directory: string,
        prefix: string,
        include = (_path: string) => true,
    ): PluginFile[] {
        const root = new CollectionFilesystemRepository(directory);
        try {
            const entries = root.inventory();
            if (
                entries.length > 4096 ||
                entries.reduce((n, [, info]) => n + (info.isFile() ? info.size : 0), 0) >
                    32 * 1024 * 1024
            )
                throw new Error('Panel runtime inventory exceeds its bound.');
            return entries
                .filter(([path, info]) => info.isFile() && include(path))
                .map(([path, info]) => ({
                    path: `${prefix}/${path}`,
                    bytes: root.readBytes(path, LIMITS.artifactBytes),
                    mode: info.mode & 0o111 ? 0o755 : 0o644,
                }));
        } finally {
            root.close();
        }
    }

    /** Match ordinary local/hoisted npm placement, without following package links or global fallbacks. */
    private dependency(start: string): string {
        let directory = start;
        for (let depth = 0; depth < 32; depth++) {
            const modulesPath = join(directory, 'node_modules');
            let present = false;
            try {
                lstatSync(modulesPath);
                present = true;
            } catch (error: any) {
                if (error.code !== 'ENOENT') throw error;
            }
            if (present) {
                const modules = new CollectionFilesystemRepository(modulesPath);
                try {
                    if (modules.inspect('yaml', { allowMissingLeaf: true }).info)
                        return join(modules.path, 'yaml');
                } finally {
                    modules.close();
                }
            }
            const parent = dirname(directory);
            if (parent === directory) break;
            directory = parent;
        }
        throw new Error('Install the pinned local YAML dependency before panel preparation.');
    }
}
