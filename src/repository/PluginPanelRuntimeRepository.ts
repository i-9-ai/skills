// SPDX-License-Identifier: Apache-2.0
import { dirname, join } from 'node:path';
import { lstatSync } from 'node:fs';
import type { PluginFile } from './PluginArtifactRepository.ts';
import { CollectionFilesystemRepository, LIMITS } from './CollectionFilesystemRepository.ts';
import { ProjectConfiguration } from '../config/ProjectConfiguration.ts';

/** Retains compiled local runtime bytes; never compiles, installs or executes dependencies. */
export class PluginPanelRuntimeRepository {
    read(configuration: ProjectConfiguration, packages: PluginFile[]): PluginFile[] {
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
            const dependencyPath = this.dependency(root.path);
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
            files.push(...this.directory(dependencyPath, 'runtime/node_modules/yaml'));
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
