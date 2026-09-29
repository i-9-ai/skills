// SPDX-License-Identifier: Apache-2.0
import { accessSync, constants, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

type DirectoryIdentity = { dev: number; ino: number };

/** Initializes only the selected external host directory, preserving existing state. */
export class PluginDataRepository {
    /** Resolve caller/protected roots before discovery or any storage mutation. */
    canonicalDirectory(directory: string): string {
        const canonical = realpathSync(directory);
        if (!lstatSync(canonical).isDirectory()) {
            throw new Error('Expected an existing directory');
        }
        return canonical;
    }

    prepareDatabase(filename: string, protectedRoots: string[]): string {
        return this.database(filename, protectedRoots, true);
    }

    /** Verify an existing store without creating directories or upgrading its schema. */
    verifyDatabase(filename: string, protectedRoots: string[]): string {
        return this.database(filename, protectedRoots, false);
    }

    private database(filename: string, protectedRoots: string[], write: boolean): string {
        if (!isAbsolute(filename) || filename.length > 4096 || filename.includes('\0')) {
            throw new Error('Expected a bounded absolute plugin database path');
        }
        const database = resolve(filename);
        const directory = dirname(database);
        const protectedPaths = protectedRoots.map((root) => this.canonicalDirectory(root));
        const protectedIdentities = protectedPaths.map((root) => lstatSync(root));
        if (protectedPaths.some((root) => this.contains(root, directory))) {
            throw new Error('Plugin data must remain outside plugin and caller roots');
        }

        const root = parse(directory).root;
        const components = directory.slice(root.length).split(sep).filter(Boolean);
        if (components.length === 0 || components.length > 64) {
            throw new Error('Expected a bounded plugin data directory');
        }

        let current = root;
        for (const component of components) {
            current = join(current, component);
            this.ensureDirectory(current, protectedIdentities, write);
        }

        if (realpathSync(directory) !== directory) {
            throw new Error('Plugin data directory must be canonical');
        }
        if (write) {
            if ((lstatSync(directory).mode & 0o222) === 0) {
                throw new Error('Plugin data directory is not writable');
            }
            accessSync(directory, constants.W_OK);
        }

        for (const suffix of ['', '-journal', '-wal', '-shm']) {
            this.checkExistingFile(`${database}${suffix}`);
        }
        if (!write) lstatSync(database);

        return database;
    }

    private ensureDirectory(
        directory: string,
        protectedIdentities: DirectoryIdentity[],
        create: boolean,
    ): void {
        let info;
        try {
            info = lstatSync(directory);
        } catch (error) {
            if (!create || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            try {
                mkdirSync(directory, { mode: 0o700 });
            } catch (creationError) {
                if ((creationError as NodeJS.ErrnoException).code !== 'EEXIST') throw creationError;
            }
            info = lstatSync(directory);
        }

        if (!info.isDirectory() || info.isSymbolicLink()) {
            throw new Error('Plugin data ancestors must be non-linked directories');
        }
        // Some filesystems preserve caller casing in realpath(). Compare actual
        // directory identity before the next iteration can create a child.
        if (protectedIdentities.some((root) => root.dev === info.dev && root.ino === info.ino)) {
            throw new Error('Plugin data must remain outside plugin and caller roots');
        }
        if (realpathSync(directory) !== directory) {
            throw new Error('Plugin data ancestors must have canonical paths');
        }
    }

    private checkExistingFile(filename: string): void {
        try {
            const info = lstatSync(filename);
            if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
                throw new Error('Plugin database files must be regular and non-linked');
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
    }

    private contains(root: string, directory: string): boolean {
        const path = relative(root, directory);
        return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
    }
}
