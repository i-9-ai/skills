// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { OfficialQualityValidator } from '../validator/OfficialQualityValidator.ts';
import type { OfficialQualityRequest } from '../validator/OfficialQualityValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';

type RootSelections = {
    installed: string;
    caller: string;
    selected_package: string;
    additional?: string[];
    input_files?: string[];
};
type Identity = { dev: number; ino: number; mode: number };
type CheckedSelection = {
    database: string;
    output: string;
    protectedRoots: string[];
    directories: Map<string, Identity>;
    files: Map<string, Identity | null>;
};
type CheckedInput = {
    filename: string;
    directories: Map<string, Identity>;
    info: Stats;
};
const artifactName = 'official-quality.json';

/** Explicit new artifact retention; never executes a process, opens SQLite or chooses assurance. */
export class SkillQualityArtifactRepository {
    private readonly selections = new WeakMap<object, CheckedSelection>();
    private readonly inputs = new WeakMap<object, CheckedInput>();
    private readonly validator = new OfficialQualityValidator();

    /** Capture a file-backed receipt before reading; stdin needs no file selection. */
    selectInput(file: string): object {
        try {
            const filename = this.absolute(file);
            const directories = new Map<string, Identity>();
            const info = this.inputFile(filename, directories);
            const token = Object.freeze({});
            this.inputs.set(token, { filename, directories, info });
            return token;
        } catch {
            throw new SkillOperationError('invalid_input');
        }
    }

    /** Recheck the selected input and reserved SQLite paths before storage preparation. */
    verifyDatabaseInput(token: object, databaseInput: string): void {
        const input = this.inputs.get(token);
        if (!input) throw new SkillOperationError('invalid_input');
        try {
            for (const [directory, original] of input.directories) {
                const current = fs.lstatSync(directory);
                this.ownedDirectory(directory, current);
                if (!this.same(original, current)) throw new Error('Input parent changed');
            }
            const current = this.inputFile(input.filename, new Map());
            if (
                !this.same(input.info, current) ||
                input.info.size !== current.size ||
                input.info.mtimeMs !== current.mtimeMs ||
                input.info.ctimeMs !== current.ctimeMs
            )
                throw new Error('Input file changed');
            if (
                typeof databaseInput !== 'string' ||
                databaseInput.length > 4096 ||
                !path.isAbsolute(databaseInput)
            )
                throw new Error('Bounded absolute database path required');
            // Ordinary quality storage already normalizes absolute database selections.
            const database = this.absolute(path.resolve(databaseInput));
            const files = this.databaseFiles(database);
            if (
                [...files.keys()].some((filename) => this.contains(input.filename, filename)) ||
                [...files.values()].some(
                    (selected) =>
                        selected !== null &&
                        selected.dev === current.dev &&
                        selected.ino === current.ino,
                )
            )
                throw new Error('Input file aliases a database path');
            this.inputs.delete(token);
        } catch {
            throw new SkillOperationError('invalid_input');
        }
    }

    /** Read-only preflight must run before root's installation/process/storage effects. */
    select(database: string, output: string, roots: RootSelections): object {
        try {
            const selection = this.selection(database, output, roots);
            const token = Object.freeze({});
            this.selections.set(token, selection);
            return token;
        } catch {
            throw new SkillOperationError('invalid_input');
        }
    }

    /** One owned new directory and one wx file; evidence is never removed on later failure. */
    retain(token: object, value: unknown, request: OfficialQualityRequest) {
        const artifact = this.validator.artifact(value, request);
        const selection = this.selections.get(token);
        if (!selection) throw new SkillOperationError('invalid_input');
        this.recheck(selection);
        if (!Number.isInteger(fs.constants.O_NOFOLLOW))
            throw new SkillOperationError('invalid_input');
        const bytes = Buffer.from(JSON.stringify(artifact) + '\n');
        let descriptor: number | undefined;
        // Consume before the first effect. Retrying requires a new read-only preflight.
        this.selections.delete(token);
        try {
            fs.mkdirSync(selection.output, { mode: 0o700 });
            const directory = fs.lstatSync(selection.output);
            this.ownedDirectory(selection.output, directory);
            this.recheck(selection, directory);
            const filename = path.join(selection.output, artifactName);
            descriptor = fs.openSync(
                filename,
                fs.constants.O_RDWR |
                    fs.constants.O_CREAT |
                    fs.constants.O_EXCL |
                    fs.constants.O_NOFOLLOW,
                0o600,
            );
            fs.writeFileSync(descriptor, bytes);
            fs.fsyncSync(descriptor);
            const opened = fs.fstatSync(descriptor);
            this.regular(opened);
            if (opened.size !== bytes.length) throw new Error('Incomplete artifact');
            const retained = Buffer.alloc(bytes.length);
            let offset = 0;
            while (offset < retained.length) {
                const count = fs.readSync(
                    descriptor,
                    retained,
                    offset,
                    retained.length - offset,
                    offset,
                );
                if (count === 0) throw new Error('Incomplete artifact');
                offset += count;
            }
            const after = fs.fstatSync(descriptor);
            const located = fs.lstatSync(filename);
            this.regular(after);
            this.regular(located);
            if (
                !retained.equals(bytes) ||
                !this.same(opened, after) ||
                !this.same(after, located) ||
                after.size !== opened.size ||
                after.mtimeMs !== opened.mtimeMs ||
                after.ctimeMs !== opened.ctimeMs
            )
                throw new Error('Artifact changed');
            this.recheck(selection, directory);
            const listing = fs.opendirSync(selection.output);
            try {
                const entry = listing.readSync();
                if (entry?.name !== artifactName || listing.readSync() !== null)
                    throw new Error('Unexpected artifact entry');
            } finally {
                listing.closeSync();
            }
            return {
                locator: artifactName,
                sha256: createHash('sha256').update(retained).digest('hex'),
            };
        } catch {
            // Never unlink evidence or attempt a compensating database mutation.
            throw new SkillOperationError('storage_unavailable');
        } finally {
            if (descriptor !== undefined) fs.closeSync(descriptor);
        }
    }

    private selection(
        databaseInput: string,
        outputInput: string,
        roots: RootSelections,
    ): CheckedSelection {
        const database = this.absolute(databaseInput);
        const output = this.absolute(outputInput);
        if (
            !roots ||
            typeof roots !== 'object' ||
            Array.isArray(roots) ||
            Object.keys(roots).some(
                (key) =>
                    ![
                        'installed',
                        'caller',
                        'selected_package',
                        'additional',
                        'input_files',
                    ].includes(key),
            ) ||
            ['installed', 'caller', 'selected_package'].some((key) => !Object.hasOwn(roots, key)) ||
            (roots.additional !== undefined &&
                (!Array.isArray(roots.additional) || roots.additional.length > 32)) ||
            (roots.input_files !== undefined &&
                (!Array.isArray(roots.input_files) || roots.input_files.length > 8))
        )
            throw new Error('Closed protected roots required');
        const protectedRoots = [
            ...new Set(
                [
                    roots.installed,
                    roots.caller,
                    roots.selected_package,
                    ...(roots.additional ?? []),
                ].map((root) => this.absolute(root)),
            ),
        ];
        if (
            this.overlapsDatabase(database, output) ||
            protectedRoots.some(
                (root) => this.contains(root, database) || this.contains(root, output),
            )
        )
            throw new Error('Selections overlap protected paths');
        const directories = new Map<string, Identity>();
        for (const root of protectedRoots) this.directoryChain(root, directories);
        this.directoryChain(path.dirname(database), directories);
        this.directoryChain(path.dirname(output), directories);
        const protectedInfo = protectedRoots.map((root) => directories.get(root)!);
        for (const parent of [path.dirname(database), path.dirname(output)]) {
            const components = this.ancestors(parent);
            if (
                components.some((part) =>
                    protectedInfo.some((root) => this.same(root, directories.get(part)!)),
                )
            )
                throw new Error('Protected directory alias');
        }
        this.missing(output);
        const files = this.databaseFiles(database);
        // Protect explicitly selected input files without excluding valid sibling destinations.
        for (const input of new Set((roots.input_files ?? []).map((file) => this.absolute(file)))) {
            const info = this.inputFile(input, directories);
            if (
                this.contains(output, input) ||
                files.has(input) ||
                [...files.values()].some(
                    (selected) =>
                        selected !== null && selected.dev === info.dev && selected.ino === info.ino,
                )
            )
                throw new Error('Input file aliases an output or database path');
            files.set(input, this.identity(info));
        }
        return { database, output, protectedRoots, directories, files };
    }

    private overlapsDatabase(database: string, output: string): boolean {
        // Absent names have no inode: conservatively reserve case/normalization aliases.
        const foldedOutput = output.normalize('NFC').toUpperCase();
        return this.databasePaths(database).some((filename) => {
            const foldedFile = filename.normalize('NFC').toUpperCase();
            return (
                this.contains(foldedOutput, foldedFile) || this.contains(foldedFile, foldedOutput)
            );
        });
    }

    private databasePaths(database: string): string[] {
        return ['', '-journal', '-wal', '-shm'].map((suffix) => database + suffix);
    }

    private databaseFiles(database: string): Map<string, Identity | null> {
        const files = new Map<string, Identity | null>();
        for (const filename of this.databasePaths(database)) {
            const info = this.optional(filename);
            if (info) this.regular(info);
            files.set(filename, info ? this.identity(info) : null);
        }
        return files;
    }

    private inputFile(filename: string, directories: Map<string, Identity>): Stats {
        this.directoryChain(path.dirname(filename), directories);
        const info = fs.lstatSync(filename);
        this.regular(info);
        if (fs.realpathSync(filename) !== filename) throw new Error('Canonical input required');
        return info;
    }

    private recheck(selection: CheckedSelection, ownedOutput?: Stats): void {
        try {
            for (const [directory, original] of selection.directories) {
                const current = fs.lstatSync(directory);
                this.ownedDirectory(directory, current);
                if (!this.same(original, current)) throw new Error('Directory changed');
            }
            for (const [filename, original] of selection.files) {
                const current = this.optional(filename);
                if (current) this.regular(current);
                if (
                    (original === null) !== (current === null) ||
                    (original !== null && current !== null && !this.same(original, current))
                )
                    throw new Error('Selected file path changed');
            }
            if (!ownedOutput) {
                this.missing(selection.output);
                return;
            }
            const current = fs.lstatSync(selection.output);
            this.ownedDirectory(selection.output, current);
            if (!this.same(ownedOutput, current)) throw new Error('Artifact directory changed');
        } catch {
            throw new SkillOperationError('invalid_input');
        }
    }

    private directoryChain(directory: string, output: Map<string, Identity>): void {
        for (const entry of this.ancestors(directory)) {
            const info = fs.lstatSync(entry);
            this.ownedDirectory(entry, info);
            output.set(entry, this.identity(info));
        }
    }
    private ancestors(directory: string): string[] {
        const root = path.parse(directory).root;
        const parts = directory.slice(root.length).split(path.sep).filter(Boolean);
        if (parts.length > 64) throw new Error('Too many path components');
        const result = [root];
        let current = root;
        for (const part of parts) {
            current = path.join(current, part);
            result.push(current);
        }
        return result;
    }
    private ownedDirectory(directory: string, info: Stats): void {
        if (
            !info.isDirectory() ||
            info.isSymbolicLink() ||
            fs.realpathSync(directory) !== directory
        )
            throw new Error('Existing canonical non-linked directory required');
    }
    private absolute(value: unknown): string {
        if (
            typeof value !== 'string' ||
            !value.isWellFormed() ||
            Buffer.byteLength(value) > 4096 ||
            !path.isAbsolute(value) ||
            /[\u0000-\u001f\u007f]/u.test(value) ||
            path.resolve(value) !== value
        )
            throw new Error('Bounded canonical absolute path required');
        return value;
    }
    private optional(filename: string): Stats | null {
        try {
            return fs.lstatSync(filename);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
    }
    private missing(filename: string): void {
        if (this.optional(filename) !== null) throw new Error('New artifact root required');
    }
    private regular(info: Stats): void {
        if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
            throw new Error('Regular single-link file required');
    }
    private identity(info: Stats): Identity {
        return { dev: info.dev, ino: info.ino, mode: info.mode };
    }
    private same(left: Identity, right: Identity): boolean {
        return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
    }
    private contains(root: string, selected: string): boolean {
        const relative = path.relative(root, selected);
        return (
            relative === '' ||
            (!path.isAbsolute(relative) &&
                relative !== '..' &&
                !relative.startsWith('..' + path.sep))
        );
    }
}
