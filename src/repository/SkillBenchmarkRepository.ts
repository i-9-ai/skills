// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { SkillBenchmarkValidator } from '../validator/SkillBenchmarkValidator.ts';
import { SkillPackageTreeValidator } from '../validator/SkillPackageTreeValidator.ts';
import type {
    BenchmarkFile,
    BenchmarkManifest,
    BenchmarkRun,
    BenchmarkSuite,
} from '../validator/SkillBenchmarkValidator.ts';

export type FrozenBenchmark = { suite: BenchmarkSuite; manifest: BenchmarkManifest };
type FileBytes = { path: string; bytes: Buffer };
const MAX_TREE_BYTES = 33_554_432;
const MAX_ARTIFACT_SCAN_BYTES = 67_108_864;

/** Caller-selected, stable local trees only; hashes prove bytes, not executor identity. */
export class SkillBenchmarkRepository {
    private readonly validator: SkillBenchmarkValidator;

    constructor(validator = new SkillBenchmarkValidator()) {
        this.validator = validator;
    }

    prepare(suiteFile: string, skillsDirectory: string, output: string) {
        const source = new SafeRoot(path.dirname(path.resolve(suiteFile)));
        const skills = new SafeRoot(skillsDirectory);
        try {
            const suite = this.validator.suite(
                this.validator.parse(source.readBytes(path.basename(suiteFile), 524_288)),
            );
            const files: FileBytes[] = [];
            let retainedBytes = 0;
            const append = (file: FileBytes): void => {
                this.validator.require(
                    files.length < 2_048 && retainedBytes + file.bytes.length <= MAX_TREE_BYTES,
                    'Combined file inventory exceeds bounds.',
                );
                files.push(file);
                retainedBytes += file.bytes.length;
            };
            append({ path: 'suite.json', bytes: this.json(suite) });
            for (const selected of suite.cases) {
                const prompt = source.readBytes(
                    selected.prompt,
                    Math.min(65_536, MAX_TREE_BYTES - retainedBytes),
                );
                const text = new TextDecoder('utf-8', { fatal: true }).decode(prompt);
                this.validator.require(
                    text.trim().length > 0,
                    'Executor prompt must be nonblank UTF-8 text.',
                );
                append({
                    path: `cases/${selected.id}/prompt.md`,
                    bytes: prompt,
                });
                for (const fixture of selected.fixtures) {
                    append({
                        path: `cases/${selected.id}/fixtures/${fixture.target}`,
                        bytes: source.readBytes(
                            fixture.path,
                            Math.min(4_194_304, MAX_TREE_BYTES - retainedBytes),
                        ),
                    });
                }
                append({
                    path: `cases/${selected.id}/executor.json`,
                    bytes: this.json({
                        schema_version: 1,
                        case_id: selected.id,
                        prompt: `cases/${selected.id}/prompt.md`,
                        fixtures: `cases/${selected.id}/fixtures`,
                        baseline_packages: [],
                        treatment_packages: selected.skills.map((name) => `packages/${name}`),
                        limits: selected.limits,
                    }),
                });
            }
            const names = [...new Set(suite.cases.flatMap((item) => item.skills))].sort();
            this.validator.require(names.length <= 16, 'Suite selects too many packages.');
            const packages = names.map((name) => {
                const snapshot = skills.inspect(name);
                this.validator.require(
                    snapshot.info?.isDirectory(),
                    'Selected package must be a directory.',
                );
                const entries = this.tree(snapshot.absolute, [], MAX_TREE_BYTES - retainedBytes);
                this.validator.require(
                    entries.some((item) => item.path === 'SKILL.md') &&
                        entries.some((item) => item.path === 'LICENSE'),
                    'Selected package lacks SKILL.md or LICENSE.',
                );
                for (const item of entries)
                    append({
                        path: `packages/${name}/${item.path}`,
                        bytes: item.bytes,
                    });
                skills.verifySnapshot(snapshot);
                return { name, tree_sha256: this.treeDigest(this.inventory(entries)) };
            });
            const inventory = this.inventory(files);
            const manifest: BenchmarkManifest = {
                schema_version: 1,
                suite_sha256: this.digest(files[0].bytes),
                benchmark_sha256: this.treeDigest(inventory),
                files: inventory,
                packages,
            };
            this.validator.manifest(manifest);
            const directory = this.newDirectory(output, [source.path, skills.path]);
            this.writeFiles(directory, [
                ...files,
                { path: 'manifest.json', bytes: this.json(manifest) },
            ]);
            for (const selected of suite.cases)
                fs.mkdirSync(path.join(directory, 'cases', selected.id, 'fixtures'), {
                    recursive: true,
                    mode: 0o700,
                });
            fs.mkdirSync(path.join(directory, 'runs'), { mode: 0o700 });
            this.load(directory);
            return {
                schema_version: 1,
                directory,
                suite: suite.id,
                benchmark_sha256: manifest.benchmark_sha256,
                cases: suite.cases.length,
                packages,
            };
        } finally {
            source.close();
            skills.close();
        }
    }

    importRun(directory: string, runFile: string, artifactsDirectory: string) {
        const frozen = this.load(directory);
        const run = this.validator.run(
            this.document(runFile),
            frozen.suite,
            frozen.manifest.benchmark_sha256,
        );
        const existing = this.runs(directory, frozen);
        this.validator.require(existing.length < 160, 'Run count exceeds 160.');
        this.validator.require(
            !existing.some(
                (item) =>
                    item.id === run.id ||
                    (item.case_id === run.case_id &&
                        item.variant === run.variant &&
                        item.attempt === run.attempt),
            ),
            'A run ID or case/variant/attempt already exists.',
        );
        const retainedBytes = existing.reduce((total, item) => total + this.artifactBytes(item), 0);
        this.validator.require(
            retainedBytes + this.artifactBytes(run) <= MAX_ARTIFACT_SCAN_BYTES,
            'Comparison artifact scan exceeds 67108864 bytes.',
        );
        // Validate the actual stored JSON sizes before reading payloads or creating a destination.
        const runBytes = this.json(run);
        const runSha256 = this.digest(runBytes);
        const receiptBytes = this.json({ schema_version: 1, run_sha256: runSha256 });
        const artifacts = new SafeRoot(artifactsDirectory);
        const files: FileBytes[] = [];
        try {
            for (const entry of run.artifacts) {
                const bytes = artifacts.readBytes(entry.path, 4_194_304);
                this.match(entry, bytes);
                files.push({ path: `artifacts/${entry.path}`, bytes });
            }
        } finally {
            artifacts.close();
        }
        files.push(
            { path: 'run.json', bytes: runBytes },
            { path: 'receipt.json', bytes: receiptBytes },
        );
        // Recheck the freeze after inspecting external run artifacts and before writing.
        this.load(directory);
        const runDirectory = this.newDirectory(path.join(path.resolve(directory), 'runs', run.id));
        this.writeFiles(runDirectory, files);
        this.readRun(runDirectory, frozen);
        return {
            schema_version: 1,
            id: run.id,
            benchmark_sha256: run.benchmark_sha256,
            run_sha256: runSha256,
            retained_artifacts: run.artifacts.length,
            execution_kind: run.execution.kind,
            execution_status: run.execution.status,
            verification:
                'Retained artifact integrity; execution and grading remain caller assertions.',
        };
    }

    load(directory: string): FrozenBenchmark {
        const { suite, manifest } = this.loadEvidence(directory);
        return { suite, manifest };
    }

    loadEvidence(directory: string) {
        const root = new SafeRoot(directory);
        try {
            const manifestBytes = root.readBytes('manifest.json', 524_288);
            const manifest = this.validator.manifest(this.validator.parse(manifestBytes));
            const suiteBytes = root.readBytes('suite.json', 524_288);
            this.validator.require(
                this.digest(suiteBytes) === manifest.suite_sha256,
                'Frozen suite changed.',
            );
            const suite = this.validator.suite(this.validator.parse(suiteBytes));
            const runs = root.inspect('runs');
            this.validator.require(runs.info?.isDirectory(), 'Runs must be a real directory.');
            const entries = this.tree(root.path, ['manifest.json', 'runs']);
            const inventory = this.inventory(entries);
            this.validator.require(
                JSON.stringify(inventory) === JSON.stringify(manifest.files),
                'Frozen inventory changed.',
            );
            this.validator.require(
                this.treeDigest(inventory) === manifest.benchmark_sha256,
                'Freeze digest does not match.',
            );
            const names = [...new Set(suite.cases.flatMap((item) => item.skills))].sort();
            const packages = names.map((name) => {
                const prefix = `packages/${name}/`;
                const files = inventory
                    .filter((file) => file.path.startsWith(prefix))
                    .map((file) => ({ ...file, path: file.path.slice(prefix.length) }));
                this.validator.require(
                    files.some((file) => file.path === 'SKILL.md') &&
                        files.some((file) => file.path === 'LICENSE'),
                    'Frozen package is incomplete.',
                );
                return { name, tree_sha256: this.treeDigest(files) };
            });
            this.validator.require(
                JSON.stringify(packages) === JSON.stringify(manifest.packages),
                'Frozen package identity changed.',
            );
            const expected = new Set(['suite.json']);
            for (const selected of suite.cases) {
                expected.add(`cases/${selected.id}/prompt.md`);
                expected.add(`cases/${selected.id}/executor.json`);
                for (const fixture of selected.fixtures)
                    expected.add(`cases/${selected.id}/fixtures/${fixture.target}`);
            }
            this.validator.require(
                inventory.every(
                    (file) =>
                        expected.has(file.path) ||
                        names.some((name) => file.path.startsWith(`packages/${name}/`)),
                ),
                'Unexpected frozen file.',
            );
            this.validator.require(
                [...expected].every((entry) => inventory.some((file) => file.path === entry)),
                'Missing frozen case resource.',
            );
            return { suite, manifest, manifest_sha256: this.digest(manifestBytes) };
        } finally {
            root.close();
        }
    }

    runs(directory: string, frozen = this.load(directory)): BenchmarkRun[] {
        return this.retainedRuns(directory, frozen).map((entry) => entry.run);
    }

    retainedRuns(directory: string, frozen = this.load(directory)) {
        const root = new SafeRoot(directory);
        const runs: Array<{ run: BenchmarkRun; run_sha256: string }> = [];
        let retainedBytes = 0;
        try {
            const selected = root.inspect('runs');
            this.validator.require(selected.info?.isDirectory(), 'Runs must be a real directory.');
            const listing = fs.opendirSync(selected.absolute);
            try {
                let entry;
                while ((entry = listing.readSync()) !== null) {
                    this.validator.require(runs.length < 160, 'Run count exceeds 160.');
                    const snapshot = root.inspect(`runs/${entry.name}`);
                    this.validator.require(
                        snapshot.info?.isDirectory(),
                        'Run entry must be a real directory.',
                    );
                    const retained = this.readRunEvidence(snapshot.absolute, frozen);
                    const run = retained.run;
                    this.validator.require(
                        run.id === entry.name,
                        'Run directory identity does not match.',
                    );
                    retainedBytes += this.artifactBytes(run);
                    this.validator.require(
                        retainedBytes <= MAX_ARTIFACT_SCAN_BYTES,
                        'Comparison artifact scan exceeds 67108864 bytes.',
                    );
                    this.validator.require(
                        !runs.some(
                            (item) =>
                                item.run.case_id === run.case_id &&
                                item.run.variant === run.variant &&
                                item.run.attempt === run.attempt,
                        ),
                        'Duplicate case/variant/attempt.',
                    );
                    root.verifySnapshot(snapshot);
                    runs.push(retained);
                }
            } finally {
                listing.closeSync();
            }
            root.verifySnapshot(selected);
            return runs.sort((left, right) =>
                left.run.id < right.run.id ? -1 : Number(left.run.id > right.run.id),
            );
        } finally {
            root.close();
        }
    }

    private readRun(directory: string, frozen: FrozenBenchmark): BenchmarkRun {
        return this.readRunEvidence(directory, frozen).run;
    }

    private readRunEvidence(directory: string, frozen: FrozenBenchmark) {
        const root = new SafeRoot(directory);
        try {
            const bytes = root.readBytes('run.json', 524_288);
            const receipt = this.validator.receipt(
                this.validator.parse(root.readBytes('receipt.json', 524_288)),
            );
            this.validator.require(
                this.digest(bytes) === receipt.run_sha256,
                'Imported run record changed.',
            );
            const run = this.validator.run(
                this.validator.parse(bytes),
                frozen.suite,
                frozen.manifest.benchmark_sha256,
            );
            // Each metadata JSON has its own bounded read; the 32 MiB payload budget
            // must not include that overhead after accepting a full-size artifact set.
            const expected = new Set(run.artifacts.map((file) => `artifacts/${file.path}`));
            const entries = this.tree(root.path, ['run.json', 'receipt.json']);
            this.validator.require(
                entries.length === expected.size &&
                    entries.every((item) => expected.has(item.path)),
                'Imported run contains unexpected or missing files.',
            );
            for (const artifact of run.artifacts)
                this.match(artifact, root.readBytes(`artifacts/${artifact.path}`, 4_194_304));
            return { run, run_sha256: this.digest(bytes) };
        } finally {
            root.close();
        }
    }

    private document(file: string): unknown {
        const selected = path.resolve(file);
        const root = new SafeRoot(path.dirname(selected));
        try {
            return this.validator.parse(root.readBytes(path.basename(selected), 524_288));
        } finally {
            root.close();
        }
    }

    private tree(
        directory: string,
        ignoredRootNames: string[] = [],
        byteLimit = MAX_TREE_BYTES,
    ): FileBytes[] {
        const root = new SafeRoot(directory);
        try {
            // The JS helper supports string lists; its empty defaults infer never[].
            const enumerate = root.inventory.bind(root) as (options: {
                ignoredRootNames: string[];
            }) => [string, fs.Stats][];
            const inventory = enumerate({ ignoredRootNames }).sort((left, right) =>
                this.comparePaths(left[0], right[0]),
            );
            const files = inventory.filter(([, info]: [string, fs.Stats]) => info.isFile());
            this.validator.require(files.length <= 2_048, 'Tree exceeds 2048 files.');
            let total = 0;
            const result = files.map(([relative, info]: [string, fs.Stats]) => {
                this.validator.relative(relative);
                this.validator.require(
                    total + info.size <= byteLimit,
                    `Tree exceeds ${byteLimit} bytes.`,
                );
                const bytes = root.readBytes(relative, Math.min(4_194_304, byteLimit - total));
                total += bytes.length;
                this.validator.require(total <= byteLimit, `Tree exceeds ${byteLimit} bytes.`);
                return { path: relative, bytes };
            });
            // Detect additions/removals and ordinary file identity changes during the scan.
            const after = enumerate({ ignoredRootNames }).sort((left, right) =>
                this.comparePaths(left[0], right[0]),
            );
            this.validator.require(
                inventory.length === after.length &&
                    inventory.every(([relative, info]: [string, fs.Stats], index: number) => {
                        const [nextRelative, nextInfo] = after[index];
                        return (
                            relative === nextRelative &&
                            info.dev === nextInfo.dev &&
                            info.ino === nextInfo.ino &&
                            info.mode === nextInfo.mode &&
                            info.size === nextInfo.size &&
                            info.mtimeMs === nextInfo.mtimeMs &&
                            info.ctimeMs === nextInfo.ctimeMs
                        );
                    }),
                'Tree changed during inspection.',
            );
            return result.sort((left: FileBytes, right: FileBytes) =>
                this.comparePaths(left.path, right.path),
            );
        } finally {
            root.close();
        }
    }

    private inventory(files: FileBytes[]): BenchmarkFile[] {
        const result = files
            .map((file) => ({
                path: file.path,
                sha256: this.digest(file.bytes),
                bytes: file.bytes.length,
            }))
            .sort((left, right) => this.comparePaths(left.path, right.path));
        this.validator.require(
            new Set(result.map((file) => file.path)).size === result.length,
            'Duplicate output paths.',
        );
        this.validator.require(
            result.length <= 2_048 &&
                result.reduce((total, file) => total + file.bytes, 0) <= MAX_TREE_BYTES,
            'Combined file inventory exceeds bounds.',
        );
        return result;
    }

    private newDirectory(destination: string, protectedRoots: string[] = []): string {
        const selected = path.resolve(destination);
        const parent = new SafeRoot(path.dirname(selected));
        try {
            const snapshot = parent.inspect(path.basename(selected), { allowMissingLeaf: true });
            this.validator.require(snapshot.info === null, 'Output directory already exists.');
            for (const protectedRoot of protectedRoots) {
                const relative = path.relative(protectedRoot, snapshot.absolute);
                this.validator.require(
                    relative.startsWith(`..${path.sep}`) ||
                        relative === '..' ||
                        path.isAbsolute(relative),
                    'Output must be outside the selected source trees.',
                );
            }
            fs.mkdirSync(snapshot.absolute, { mode: 0o700 });
            parent.verifySnapshot(snapshot, { includeLeaf: false });
            return snapshot.absolute;
        } finally {
            parent.close();
        }
    }

    private writeFiles(directory: string, files: FileBytes[]): void {
        const root = new SafeRoot(directory);
        try {
            for (const file of files) {
                this.validator.relative(file.path);
                const absolute = path.join(root.path, file.path);
                fs.mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o700 });
                const snapshot = root.inspect(file.path, { allowMissingLeaf: true });
                this.validator.require(snapshot.info === null, 'Output file already exists.');
                fs.writeFileSync(snapshot.absolute, file.bytes, { flag: 'wx', mode: 0o600 });
                root.verifySnapshot(snapshot, { includeLeaf: false });
            }
        } finally {
            root.close();
        }
    }

    private match(file: BenchmarkFile, bytes: Buffer): void {
        this.validator.require(
            file.bytes === bytes.length && file.sha256 === this.digest(bytes),
            `Artifact identity mismatch: ${file.path}`,
        );
    }

    private artifactBytes(run: BenchmarkRun): number {
        return run.artifacts.reduce((total, item) => total + item.bytes, 0);
    }

    private treeDigest(files: BenchmarkFile[]): string {
        return new SkillPackageTreeValidator().digest(files);
    }

    private comparePaths(left: string, right: string): number {
        return Buffer.compare(Buffer.from(left), Buffer.from(right));
    }

    private digest(bytes: Buffer): string {
        return createHash('sha256').update(bytes).digest('hex');
    }

    private json(value: unknown): Buffer {
        const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
        this.validator.require(bytes.length <= 524_288, 'JSON output exceeds 524288 bytes.');
        return bytes;
    }
}
