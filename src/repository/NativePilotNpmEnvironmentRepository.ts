// SPDX-License-Identifier: Apache-2.0
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { NativePilotInventoryRepository, pilotDigest } from './NativePilotInventoryRepository.ts';
import { requireContainer } from '../validator/NativePilotContainerValidator.ts';

/** Fixed disposable npm configuration shared by installation and observer child processes. */
export class NativePilotNpmEnvironmentRepository {
    static readonly root = '/pilot/work/npm-offline';
    static readonly additions = Object.freeze({
        NPM_CONFIG_OFFLINE: 'true',
        NPM_CONFIG_IGNORE_SCRIPTS: 'true',
        NPM_CONFIG_AUDIT: 'false',
        NPM_CONFIG_FUND: 'false',
        NPM_CONFIG_CACHE: `${this.root}/cache`,
        NPM_CONFIG_USERCONFIG: `${this.root}/user.npmrc`,
        NPM_CONFIG_GLOBALCONFIG: `${this.root}/global.npmrc`,
    });
    readonly inventory = new NativePilotInventoryRepository();
    readonly root: string;
    constructor(root = NativePilotNpmEnvironmentRepository.root) {
        requireContainer(resolve(root) === root, 'Canonical owned npm preparation root required.');
        this.root = root;
    }

    /** Only the complete fixed addition set is accepted; inherited HOME is never rewritten. */
    static environment(environment: NodeJS.ProcessEnv, required = false) {
        const fixed = this.additions as Record<string, string>;
        const keys = Object.keys(environment).filter((key) => /^npm_config_/i.test(key));
        requireContainer(
            (keys.length === 0 && !required) ||
                (keys.length === Object.keys(fixed).length &&
                    keys.every(
                        (key) => Object.hasOwn(fixed, key) && environment[key] === fixed[key],
                    )),
            'Unknown or changed offline npm environment.',
        );
        return { ...environment, ...this.additions };
    }

    private present(path: string) {
        try {
            lstatSync(path);
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
            throw error;
        }
    }
    private directory(path: string) {
        this.inventory.canonicalDirectory(path);
        const value = lstatSync(path);
        requireContainer(
            value.uid === process.getuid?.() && (value.mode & 0o777) === 0o700,
            'Offline npm directory ownership or mode differs.',
        );
    }
    private empty(path: string) {
        const value = this.inventory.file(path, 0);
        const stat = lstatSync(path);
        requireContainer(
            value.bytes === 0 && stat.uid === process.getuid?.() && (stat.mode & 0o777) === 0o600,
            'Offline npm configuration is not an unchanged owned empty file.',
        );
        return { path, bytes: 0, sha256: value.sha256 };
    }

    prepare(environment: NodeJS.ProcessEnv) {
        const child = NativePilotNpmEnvironmentRepository.environment(environment);
        // The public worker always uses the fixed root. Alternate constructor roots exist
        // only for disposable filesystem unit fixtures, never in an operator request.
        this.inventory.canonicalDirectory(dirname(this.root));
        const descriptor = {
            schema_version: 1,
            kind: 'native-pilot-offline-npm',
            native_acceptance: false,
            cache_initially_empty: true,
            user_config_empty: true,
            global_config_empty: true,
            recipe: NativePilotNpmEnvironmentRepository.additions,
        };
        const record = JSON.stringify(descriptor) + '\n';
        if (!this.present(this.root)) {
            mkdirSync(this.root, { mode: 0o700 });
            mkdirSync(join(this.root, 'cache'), { mode: 0o700 });
            for (const name of ['user.npmrc', 'global.npmrc'])
                writeFileSync(join(this.root, name), '', { flag: 'wx', mode: 0o600 });
            requireContainer(
                readdirSync(join(this.root, 'cache')).length === 0,
                'New npm cache is not empty.',
            );
            writeFileSync(join(this.root, 'preparation.json'), record, { flag: 'wx', mode: 0o600 });
        }
        this.directory(this.root);
        this.directory(join(this.root, 'cache'));
        requireContainer(
            JSON.stringify(readdirSync(this.root).sort()) ===
                JSON.stringify(['cache', 'global.npmrc', 'preparation.json', 'user.npmrc']),
            'Unowned offline npm preparation entries.',
        );
        const user = this.empty(join(this.root, 'user.npmrc'));
        const global = this.empty(join(this.root, 'global.npmrc'));
        requireContainer(
            user.path !== global.path && lstatSync(user.path).ino !== lstatSync(global.path).ino,
            'User and global npm configuration must be distinct files.',
        );
        const receipt = this.inventory.file(join(this.root, 'preparation.json'), 4096);
        requireContainer(
            receipt.sha256 === pilotDigest(record) &&
                readFileSync(join(this.root, 'preparation.json'), 'utf8') === record,
            'Offline npm preparation receipt differs.',
        );
        return {
            environment: child,
            evidence: {
                ...descriptor,
                user,
                global,
                preparation_sha256: receipt.sha256,
                cache: this.inventory.tree(join(this.root, 'cache')),
            },
        };
    }
}
