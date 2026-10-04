// SPDX-License-Identifier: Apache-2.0
import { strictJson } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';

export type BenchmarkFile = { path: string; sha256: string; bytes: number };
export type BenchmarkCriterion = { id: string; critical: boolean; description: string };
export type BenchmarkCase = {
    id: string;
    phase: 'final-acceptance' | 'tuning' | 'exploratory';
    class: 'functional' | 'failure' | 'positive' | 'negative' | 'adversarial' | 'boundary';
    prompt: string;
    fixtures: { path: string; target: string }[];
    skills: string[];
    criteria: BenchmarkCriterion[];
    limits: { attempts: number; seconds: number };
};
export type BenchmarkSuite = {
    schema_version: 1;
    id: string;
    description: string;
    cases: BenchmarkCase[];
};
export type BenchmarkManifest = {
    schema_version: 1;
    suite_sha256: string;
    benchmark_sha256: string;
    files: BenchmarkFile[];
    packages: { name: string; tree_sha256: string }[];
};
export type BenchmarkVerdict = 'pass' | 'fail' | 'blocked' | 'not-run';
export type BenchmarkRun = {
    schema_version: 1;
    id: string;
    benchmark_sha256: string;
    case_id: string;
    variant: 'baseline' | 'treatment';
    attempt: number;
    execution: {
        kind: 'agent' | 'manual' | 'fixture';
        status: 'executed' | 'blocked' | 'not-run';
        executor: string;
        model: string | null;
        environment: string | null;
        settings: string | null;
        fresh_context: boolean;
    };
    metrics: {
        wall_time_ms: number | null;
        input_tokens: number | null;
        output_tokens: number | null;
    };
    artifacts: BenchmarkFile[];
    criteria: { id: string; verdict: BenchmarkVerdict; reason: string; evidence: string[] }[];
    limitations: string[];
};

/** Closed data contracts only: no case or run contains an executable command. */
export class SkillBenchmarkValidator {
    parse(bytes: Buffer): unknown {
        this.require(bytes.length <= 524_288, 'JSON exceeds 524288 bytes.');
        return strictJson(bytes);
    }

    suite(value: unknown): BenchmarkSuite {
        const suite = this.object(value, ['schema_version', 'id', 'description', 'cases']);
        this.version(suite.schema_version);
        const cases = this.array(suite.cases, 16, 1).map((item) => this.case(item));
        this.unique(
            cases.map((item) => item.id),
            'case IDs',
        );
        return {
            schema_version: 1,
            id: this.id(suite.id),
            description: this.text(suite.description, 2_000),
            cases,
        };
    }

    manifest(value: unknown): BenchmarkManifest {
        const manifest = this.object(value, [
            'schema_version',
            'suite_sha256',
            'benchmark_sha256',
            'files',
            'packages',
        ]);
        this.version(manifest.schema_version);
        const packages = this.array(manifest.packages, 16, 1).map((item) => {
            const entry = this.object(item, ['name', 'tree_sha256']);
            return { name: this.id(entry.name), tree_sha256: this.hash(entry.tree_sha256) };
        });
        this.unique(
            packages.map((item) => item.name),
            'package names',
        );
        return {
            schema_version: 1,
            suite_sha256: this.hash(manifest.suite_sha256),
            benchmark_sha256: this.hash(manifest.benchmark_sha256),
            files: this.files(manifest.files, 2_048, 1),
            packages,
        };
    }

    run(value: unknown, suite: BenchmarkSuite, benchmarkSha256: string): BenchmarkRun {
        const run = this.object(value, [
            'schema_version',
            'id',
            'benchmark_sha256',
            'case_id',
            'variant',
            'attempt',
            'execution',
            'metrics',
            'artifacts',
            'criteria',
            'limitations',
        ]);
        this.version(run.schema_version);
        const caseId = this.id(run.case_id);
        const selected = suite.cases.find((item) => item.id === caseId);
        this.require(selected !== undefined, 'Run refers to an unknown case.');
        this.require(
            this.hash(run.benchmark_sha256) === benchmarkSha256,
            'Run freeze identity does not match.',
        );
        const execution = this.object(run.execution, [
            'kind',
            'status',
            'executor',
            'model',
            'environment',
            'settings',
            'fresh_context',
        ]);
        const status = this.choice(execution.status, ['executed', 'blocked', 'not-run'] as const);
        const metrics = this.object(run.metrics, ['wall_time_ms', 'input_tokens', 'output_tokens']);
        const artifacts = this.files(run.artifacts, 256);
        const paths = new Set(artifacts.map((item) => item.path));
        const criteria = this.array(run.criteria, 64, 1).map((item) => {
            const result = this.object(item, ['id', 'verdict', 'reason', 'evidence']);
            const evidence = this.array(result.evidence, 16).map((entry) => this.relative(entry));
            this.unique(evidence, 'evidence paths');
            this.require(
                evidence.every((entry) => paths.has(entry)),
                'Criterion evidence is not a retained artifact.',
            );
            const verdict = this.choice(result.verdict, [
                'pass',
                'fail',
                'blocked',
                'not-run',
            ] as const);
            this.require(
                verdict !== 'pass' || evidence.length > 0,
                'Passing criteria require artifact evidence.',
            );
            this.require(
                status === 'executed' || verdict === 'blocked' || verdict === 'not-run',
                'Unexecuted runs cannot claim passing or failing behavior.',
            );
            return {
                id: this.id(result.id),
                verdict,
                reason: this.text(result.reason, 2_000),
                evidence,
            };
        });
        this.unique(
            criteria.map((item) => item.id),
            'criterion result IDs',
        );
        this.require(
            JSON.stringify(criteria.map((item) => item.id).sort()) ===
                JSON.stringify(selected!.criteria.map((item) => item.id).sort()),
            'Run must grade every frozen criterion exactly once.',
        );
        return {
            schema_version: 1,
            id: this.id(run.id),
            benchmark_sha256: benchmarkSha256,
            case_id: caseId,
            variant: this.choice(run.variant, ['baseline', 'treatment'] as const),
            attempt: this.integer(run.attempt, 1, selected!.limits.attempts),
            execution: {
                kind: this.choice(execution.kind, ['agent', 'manual', 'fixture'] as const),
                status,
                executor: this.text(execution.executor, 500),
                model: this.optionalText(execution.model),
                environment: this.optionalText(execution.environment),
                settings: this.optionalText(execution.settings),
                fresh_context: this.boolean(execution.fresh_context),
            },
            metrics: {
                wall_time_ms: this.metric(metrics.wall_time_ms),
                input_tokens: this.metric(metrics.input_tokens),
                output_tokens: this.metric(metrics.output_tokens),
            },
            artifacts,
            criteria,
            limitations: this.array(run.limitations, 32).map((item) => this.text(item, 2_000)),
        };
    }

    receipt(value: unknown): { schema_version: 1; run_sha256: string } {
        const receipt = this.object(value, ['schema_version', 'run_sha256']);
        this.version(receipt.schema_version);
        return { schema_version: 1, run_sha256: this.hash(receipt.run_sha256) };
    }

    relative(value: unknown): string {
        const selected = this.text(value, 512);
        const parts = selected.split('/');
        this.require(
            parts.length <= 16 &&
                parts.every(
                    (part) => /^[A-Za-z0-9._ -]+$/.test(part) && part !== '.' && part !== '..',
                ),
            'Paths must be portable relative paths without traversal.',
        );
        return selected;
    }

    hash(value: unknown): string {
        this.require(
            typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
            'Expected a SHA-256 digest.',
        );
        return value as string;
    }

    require(condition: unknown, message: string): asserts condition {
        if (!condition) throw new Error(`Invalid benchmark: ${message}`);
    }

    private case(value: unknown): BenchmarkCase {
        const item = this.object(value, [
            'id',
            'phase',
            'class',
            'prompt',
            'fixtures',
            'skills',
            'criteria',
            'limits',
        ]);
        const fixtures = this.array(item.fixtures, 64).map((value) => {
            const fixture = this.object(value, ['path', 'target']);
            return { path: this.relative(fixture.path), target: this.relative(fixture.target) };
        });
        this.unique(
            fixtures.map((entry) => entry.target),
            'fixture targets',
        );
        this.require(
            !fixtures.some((entry) =>
                fixtures.some((other) => other.target.startsWith(`${entry.target}/`)),
            ),
            'Fixture file/directory targets overlap.',
        );
        const skills = this.array(item.skills, 16, 1).map((entry) => this.id(entry));
        this.unique(skills, 'case skills');
        const criteria = this.array(item.criteria, 64, 1).map((value) => {
            const criterion = this.object(value, ['id', 'critical', 'description']);
            return {
                id: this.id(criterion.id),
                critical: this.boolean(criterion.critical),
                description: this.text(criterion.description, 2_000),
            };
        });
        this.unique(
            criteria.map((entry) => entry.id),
            'criterion IDs',
        );
        this.require(
            criteria.some((entry) => entry.critical),
            'Each case needs a critical criterion.',
        );
        const limits = this.object(item.limits, ['attempts', 'seconds']);
        return {
            id: this.id(item.id),
            phase: this.choice(item.phase, ['final-acceptance', 'tuning', 'exploratory'] as const),
            class: this.choice(item.class, [
                'functional',
                'failure',
                'positive',
                'negative',
                'adversarial',
                'boundary',
            ] as const),
            prompt: this.relative(item.prompt),
            fixtures,
            skills,
            criteria,
            limits: {
                attempts: this.integer(limits.attempts, 1, 5),
                seconds: this.integer(limits.seconds, 1, 3_600),
            },
        };
    }

    private files(value: unknown, limit: number, minimum = 0): BenchmarkFile[] {
        const files = this.array(value, limit, minimum).map((item) => {
            const file = this.object(item, ['path', 'sha256', 'bytes']);
            return {
                path: this.relative(file.path),
                sha256: this.hash(file.sha256),
                bytes: this.integer(file.bytes, 0, 4_194_304),
            };
        });
        this.unique(
            files.map((item) => item.path),
            'file paths',
        );
        this.require(
            files.reduce((total, file) => total + file.bytes, 0) <= 33_554_432,
            'File inventory exceeds 33554432 bytes.',
        );
        return files;
    }

    private object(value: unknown, keys: string[]): Record<string, unknown> {
        this.require(
            value !== null && typeof value === 'object' && !Array.isArray(value),
            'Expected an object.',
        );
        const record = value as Record<string, unknown>;
        this.require(
            Object.keys(record).length === keys.length &&
                keys.every((key) => Object.hasOwn(record, key)),
            'Object has missing or unknown fields.',
        );
        return record;
    }

    private array(value: unknown, limit: number, minimum = 0): unknown[] {
        this.require(
            Array.isArray(value) && value.length >= minimum && value.length <= limit,
            'Array length is outside bounds.',
        );
        return value;
    }

    private text(value: unknown, limit: number): string {
        this.require(
            typeof value === 'string' &&
                value.trim().length > 0 &&
                value.isWellFormed() &&
                !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) &&
                Buffer.byteLength(value) <= limit,
            'Expected bounded nonblank text.',
        );
        return value;
    }

    private id(value: unknown): string {
        this.require(
            typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value),
            'Expected a simple lowercase ID.',
        );
        return value;
    }

    private boolean(value: unknown): boolean {
        this.require(typeof value === 'boolean', 'Expected a boolean.');
        return value;
    }

    private integer(value: unknown, minimum: number, maximum: number): number {
        this.require(
            typeof value === 'number' &&
                Number.isSafeInteger(value) &&
                value >= minimum &&
                value <= maximum,
            'Expected an integer within bounds.',
        );
        return value;
    }

    private metric(value: unknown): number | null {
        if (value === null) return null;
        return this.integer(value, 0, 1_000_000_000);
    }

    private optionalText(value: unknown): string | null {
        if (value === null) return null;
        return this.text(value, 2_000);
    }

    private choice<T extends string>(value: unknown, choices: readonly T[]): T {
        this.require(
            typeof value === 'string' && choices.includes(value as T),
            'Unknown enumerated value.',
        );
        return value as T;
    }

    private unique(values: string[], name: string): void {
        this.require(new Set(values).size === values.length, `Duplicate ${name}.`);
    }

    private version(value: unknown): void {
        this.require(value === 1, 'Unsupported schema version.');
    }
}
