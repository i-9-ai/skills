// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, isAbsolute, join, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { strictJson } from '../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';
import { installationDigest } from './SkillBundleRepository.ts';

export type InstallationHost = 'codex' | 'claude';
export interface InstalledPluginObservation {
    version: string;
    path: string;
    enabled: boolean;
    sha256: string;
}

/** Fixed native commands; no shell, arbitrary plugin selector, provider call or installer download. */
export class PluginInstallationClientRepository {
    readonly environment: NodeJS.ProcessEnv;
    constructor(environment = process.env) {
        this.environment = environment;
    }

    detect(host: InstallationHost): string | null {
        for (const directory of (this.environment.PATH ?? '').split(delimiter)) {
            if (!isAbsolute(directory)) continue;
            const path = join(directory, host);
            try {
                const canonical = realpathSync(path);
                const info = lstatSync(canonical);
                if (info.isFile() && Boolean(info.mode & 0o111)) return canonical;
            } catch {
                /* A missing PATH entry is not an installation request. */
            }
        }
        return null;
    }

    execute(executable: string, args: string[], cwd: string): string {
        const result = spawnSync(executable, args, {
            cwd,
            env: this.environment,
            encoding: 'utf8',
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 45_000,
            maxBuffer: 1_048_576,
        });
        if (
            result.status !== 0 ||
            result.error ||
            Buffer.byteLength(result.stdout ?? '') > 1_048_576
        )
            throw new Error(
                'Native plugin command failed or exceeded its bound; inspect it with the host client.',
            );
        return result.stdout;
    }

    support(executable: string, _host: InstallationHost, cwd: string, batch: string[][]): boolean {
        try {
            for (const args of [
                ['plugin', 'list', '--json'],
                ['plugin', 'marketplace', 'list', '--json'],
                ...batch,
            ]) {
                const prefix = args.slice(0, args[1] === 'marketplace' ? 3 : 2);
                const help = this.execute(executable, [...prefix, '--help'], cwd);
                const acceptedFlags = new Set(help.match(/--[a-z][a-z0-9-]*/g) ?? []);
                for (const flag of args.filter((value) => value.startsWith('--'))) {
                    if (!acceptedFlags.has(flag)) return false;
                }
            }
            return true;
        } catch {
            return false;
        }
    }

    marketplaceExists(executable: string, host: InstallationHost, cwd: string): boolean {
        const raw = strictJson(
            Buffer.from(this.execute(executable, ['plugin', 'marketplace', 'list', '--json'], cwd)),
        );
        const rows = host === 'codex' ? (raw as { marketplaces?: unknown }).marketplaces : raw;
        if (!Array.isArray(rows) || rows.length > 1024)
            throw new Error('Unsupported native marketplace-list contract.');
        return rows.some((row) => row && typeof row === 'object' && row.name === 'i9-skills');
    }

    observe(
        executable: string,
        host: InstallationHost,
        scope: string,
        cwd: string,
    ): InstalledPluginObservation | null {
        const raw = strictJson(
            Buffer.from(this.execute(executable, ['plugin', 'list', '--json'], cwd)),
        );
        const rows = host === 'codex' ? (raw as { installed?: unknown }).installed : raw;
        if (!Array.isArray(rows) || rows.length > 1024)
            throw new Error('Unsupported native plugin-list contract.');
        const selected = rows.filter(
            (row) =>
                row &&
                typeof row === 'object' &&
                (host === 'codex'
                    ? row.pluginId === 'i9-skills@i9-skills'
                    : row.id === 'i9-skills@i9-skills' &&
                      row.scope === (scope === 'global' ? 'user' : 'project') &&
                      (scope === 'global' ||
                          (typeof row.projectPath === 'string' &&
                              realpathSync(row.projectPath) === realpathSync(cwd)))),
        );
        if (!selected.length) return null;
        if (selected.length !== 1) throw new Error('Ambiguous native plugin installation.');
        const row = selected[0];
        if (
            host === 'codex' &&
            (row.installed !== true ||
                row.name !== 'i9-skills' ||
                row.marketplaceName !== 'i9-skills' ||
                row.source?.source !== 'local' ||
                row.marketplaceSource?.sourceType !== 'git' ||
                ![
                    'https://github.com/i-9-ai/skills',
                    'https://github.com/i-9-ai/skills.git',
                ].includes(row.marketplaceSource?.source))
        )
            throw new Error('Native plugin source is not the selected Git marketplace.');
        const path = host === 'codex' ? row.source?.path : row.installPath;
        if (
            typeof row.version !== 'string' ||
            row.version.length > 128 ||
            !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?![\s\S])/.test(row.version) ||
            typeof row.enabled !== 'boolean'
        )
            throw new Error('Unsupported native plugin identity.');
        return {
            version: row.version,
            enabled: row.enabled,
            path: this.cachePath(path, host),
            sha256: this.fingerprint(path, host),
        };
    }

    cachePath(path: unknown, host: InstallationHost): string {
        if (
            typeof path !== 'string' ||
            path.length > 4096 ||
            !isAbsolute(path) ||
            !path.isWellFormed() ||
            /[\x00-\x1f\x7f]/.test(path)
        )
            throw new Error('Unsupported native plugin cache path.');
        const home = this.environment.HOME ?? homedir();
        const parent =
            host === 'codex'
                ? join(this.environment.CODEX_HOME ?? join(home, '.codex'), 'plugins/cache')
                : join(
                      this.environment.CLAUDE_CODE_PLUGIN_CACHE_DIR ??
                          join(home, '.claude/plugins'),
                      'cache',
                  );
        const canonical = realpathSync(path);
        const base = realpathSync(parent);
        const candidate = relative(base, canonical);
        if (
            !candidate ||
            candidate === '..' ||
            candidate.startsWith(`..${sep}`) ||
            isAbsolute(candidate)
        )
            throw new Error('Native plugin cache escapes the selected host.');
        return canonical;
    }

    fingerprint(path: string, host: InstallationHost): string {
        return this.treeDigest(this.cachePath(path, host));
    }

    private readonly aliases = {
        '.codex/skills': '../.agents/skills',
        '.claude/skills': '../.agents/skills',
        '.github/skills': '../.agents/skills',
        '.github/copilot-instructions.md': '../AGENTS.md',
        'CLAUDE.md': 'AGENTS.md',
        'GEMINI.md': 'AGENTS.md',
    };

    retain(observation: InstalledPluginObservation, host: InstallationHost, target: string) {
        if (this.fingerprint(observation.path, host) !== observation.sha256)
            throw new Error('Native cache changed before retention.');
        const root = new SafeRoot(this.cachePath(observation.path, host));
        try {
            const entries = root
                .inventory({ allowedSymlinks: this.aliases })
                .sort(([a]: [string], [b]: [string]) => (a < b ? -1 : a > b ? 1 : 0));
            mkdirSync(target, { mode: 0o700 });
            for (const [name, info] of entries as [string, import('node:fs').Stats][]) {
                const destination = join(target, name);
                if (info.isDirectory()) {
                    mkdirSync(destination, { mode: 0o700 });
                    continue;
                }
                if (info.isSymbolicLink()) {
                    symlinkSync(this.aliases[name as keyof typeof this.aliases], destination);
                    continue;
                }
                writeFileSync(destination, root.readBytes(name, 4_194_304), {
                    flag: 'wx',
                    mode: info.mode & 0o111 ? 0o700 : 0o600,
                });
            }
            if (
                this.treeDigest(target) !== observation.sha256 ||
                this.fingerprint(observation.path, host) !== observation.sha256
            )
                throw new Error('Retained native cache differs from its preimage.');
        } finally {
            root.close();
        }
    }

    private treeDigest(path: string): string {
        const root = new SafeRoot(path);
        try {
            const rows = root
                .inventory({ allowedSymlinks: this.aliases })
                .map(([name, info]: [string, import('node:fs').Stats]) => ({
                    name,
                    kind: info.isSymbolicLink()
                        ? 'alias'
                        : info.isDirectory()
                          ? 'directory'
                          : 'file',
                    bytes: info.isFile() ? info.size : 0,
                    executable: info.isFile() && Boolean(info.mode & 0o111),
                    sha256: info.isFile()
                        ? installationDigest(root.readBytes(name, 4_194_304))
                        : null,
                }))
                .sort((a: { name: string }, b: { name: string }) =>
                    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
                );
            return installationDigest(JSON.stringify(rows));
        } finally {
            root.close();
        }
    }
}
