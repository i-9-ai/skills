// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import {
    accessSync,
    closeSync,
    constants,
    fstatSync,
    lstatSync,
    openSync,
    readFileSync,
    readdirSync,
    realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { InstalledCollectionConfiguration } from '../config/InstalledCollectionConfiguration.ts';

export type HookObserverRuntimeIdentity = {
    executable: { file: string; sha256: string };
    launcher: { file: string; sha256: string };
    inventory: { root: string; sha256: string; file_count: number; byte_length: number };
};

/** Binds the selected local toolkit runtime and its import scopes without running it. */
export class HookObserverRuntimeRepository {
    private readonly configuration: InstalledCollectionConfiguration;

    constructor(configuration = new InstalledCollectionConfiguration()) {
        this.configuration = configuration;
    }

    inspect(executable = process.execPath, launcher?: string): HookObserverRuntimeIdentity {
        const root = this.configuration.root();
        const selectedLauncher = launcher ?? join(root, 'bin', 'index.mjs');
        if (executable !== realpathSync(process.execPath)) {
            throw new Error('Only this running Node executable may launch the metadata observer.');
        }
        if (selectedLauncher !== join(root, 'bin', 'index.mjs')) {
            throw new Error(
                'Select the installed toolkit launcher; unrelated scripts are refused.',
            );
        }
        const rootInfo = lstatSync(root);
        if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || rootInfo.mode & 0o222) {
            throw new Error('Retain a read-only observer runtime root.');
        }
        const node = this.bytes(executable, 160 * 1024 * 1024, true);
        accessSync(executable, constants.X_OK);
        const launch = this.bytes(selectedLauncher);
        const manifest = JSON.parse(this.bytes(join(root, 'package.json')).toString('utf8'));
        if (
            manifest.name !== '@i-9.ai/skills' ||
            manifest.bin?.['i9-skills'] !== './bin/index.mjs'
        ) {
            throw new Error('The selected runtime does not have the expected toolkit identity.');
        }
        this.localDependencies(root);
        return {
            executable: { file: executable, sha256: this.digest(node) },
            launcher: { file: selectedLauncher, sha256: this.digest(launch) },
            inventory: this.inventory(root),
        };
    }

    matches(identity: HookObserverRuntimeIdentity): boolean {
        try {
            return (
                JSON.stringify(this.inspect(identity.executable.file, identity.launcher.file)) ===
                JSON.stringify(identity)
            );
        } catch {
            return false;
        }
    }

    private inventory(root: string): HookObserverRuntimeIdentity['inventory'] {
        const files: Array<{ path: string; sha256: string }> = [];
        let byteLength = 0;
        const visit = (relative: string, depth: number): void => {
            if (depth > 24 || files.length >= 10000)
                throw new Error('Observer runtime inventory exceeds its bound.');
            const absolute = join(root, relative);
            const info = lstatSync(absolute);
            if (info.isSymbolicLink()) throw new Error('Observer runtime assets cannot be linked.');
            if (info.isDirectory()) {
                if (info.mode & 0o222)
                    throw new Error('Retain read-only observer runtime directories.');
                for (const name of readdirSync(absolute).sort()) {
                    // npm command aliases are never entered by this Node-plus-launcher route.
                    if (relative === 'node_modules' && name === '.bin') continue;
                    visit(relative + '/' + name, depth + 1);
                }
                const after = lstatSync(absolute);
                if (after.ino !== info.ino || after.mtimeMs !== info.mtimeMs) {
                    throw new Error('Observer runtime inventory changed during inspection.');
                }
                return;
            }
            const bytes = this.bytes(absolute);
            byteLength += bytes.length;
            if (byteLength > 128 * 1024 * 1024)
                throw new Error('Observer runtime inventory exceeds its bound.');
            files.push({ path: relative, sha256: this.digest(bytes) });
        };
        visit('package.json', 1);
        visit('bin', 1);
        for (const scope of ['src', 'dist', '.agents/skills', 'node_modules']) {
            try {
                lstatSync(join(root, scope));
            } catch (error: any) {
                if (error.code === 'ENOENT') continue;
                throw error;
            }
            visit(scope, 1);
        }
        files.sort((left, right) => left.path.localeCompare(right.path, 'en'));
        return {
            root,
            sha256: this.digest(Buffer.from(JSON.stringify(files))),
            file_count: files.length,
            byte_length: byteLength,
        };
    }

    private localDependencies(root: string): void {
        const modules = join(root, 'node_modules');
        const info = lstatSync(modules);
        if (!info.isDirectory() || info.isSymbolicLink()) {
            throw new Error('Retain the toolkit with its local production dependencies.');
        }
        const require = createRequire(join(root, 'package.json'));
        for (const name of ['@oclif/core', 'yaml']) {
            const selected = require.resolve(name);
            if (!selected.startsWith(modules + '/')) {
                throw new Error(
                    'Observer dependencies must resolve inside the retained runtime inventory.',
                );
            }
        }
    }

    private bytes(file: string, bound = 16 * 1024 * 1024, nodeExecutable = false): Buffer {
        if (!isAbsolute(file) || resolve(file) !== file || /[\x00-\x1f\x7f]/u.test(file)) {
            throw new Error('Select bounded canonical local runtime files.');
        }
        for (let parent = dirname(file); ; parent = dirname(parent)) {
            const info = lstatSync(parent);
            if (!info.isDirectory() || info.isSymbolicLink())
                throw new Error('Observer runtime parents cannot be linked.');
            if (dirname(parent) === parent) break;
        }
        const inspected = lstatSync(file);
        if (
            !inspected.isFile() ||
            inspected.nlink !== 1 ||
            inspected.size > bound ||
            inspected.mode & (nodeExecutable ? 0o022 : 0o222)
        ) {
            throw new Error(
                'Retain read-only regular toolkit assets without links; Node cannot permit shared writes.',
            );
        }
        const descriptor = openSync(
            file,
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        try {
            const before = fstatSync(descriptor);
            if (
                before.dev !== inspected.dev ||
                before.ino !== inspected.ino ||
                before.size !== inspected.size
            ) {
                throw new Error('Observer runtime changed during inspection.');
            }
            const bytes = readFileSync(descriptor);
            const after = fstatSync(descriptor);
            if (
                bytes.length > bound ||
                before.mtimeMs !== after.mtimeMs ||
                before.size !== after.size
            ) {
                throw new Error('Observer runtime changed during inspection.');
            }
            return bytes;
        } finally {
            closeSync(descriptor);
        }
    }

    private digest(bytes: Buffer): string {
        return createHash('sha256').update(bytes).digest('hex');
    }
}
