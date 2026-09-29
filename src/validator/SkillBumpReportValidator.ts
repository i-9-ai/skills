// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { relativeParts } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';
import { publicSourceHostname } from '../../.agents/skills/skill-authoring/scripts/lib/public-host.mjs';
import { SkillBumpReportError } from './SkillBumpReportError.ts';

export const MAX_BUMP_REQUEST_BYTES = 768 * 1024;
export const MAX_OBSERVATION_BYTES = 352 * 1024;
export const MAX_OBSERVATION_ENTRIES = 1024;
export const MAX_OBSERVATION_CONTENT_BYTES = 64 * 1024 * 1024;
export const reviewReasons = [
    'documentation_only',
    'compatible_correction',
    'compatible_addition',
    'optional_integration',
    'contract_removed',
    'incompatible_contract',
    'required_input_added',
    'required_migration',
    'undetermined',
] as const;
export const validationKinds = [
    'structural',
    'official',
    'behavioral',
    'compatibility',
    'security',
] as const;
export type ReviewReason = (typeof reviewReasons)[number];
export type ObservationSubject = {
    scope: 'skill' | 'collection';
    collection: string;
    skill: string | null;
};
export type ObservationSource = {
    repository: string | null;
    source_ref: string | null;
    resolved_git_sha: string | null;
};
export type ObservationEntry = {
    path: string;
    type: 'file' | 'directory' | 'symlink';
    mode: number;
    size?: number;
    sha256?: string;
    target_sha256?: string;
    target_is_absolute?: boolean;
};
export type ObservationContract = {
    id: string;
    kind: 'capability' | 'input' | 'output' | 'compatibility' | 'integration';
    required: boolean;
    signature_sha256: string;
    files: Array<{ path: string; sha256: string }>;
};
export type ObservationValidation = {
    kind: (typeof validationKinds)[number];
    status: 'passed' | 'failed' | 'not_run';
    content_sha256: string;
    evidence_sha256: string | null;
};
export type SkillObservation = {
    schema_version: 1;
    subject: ObservationSubject;
    source: ObservationSource;
    inventory: { root_mode: number; entries: ObservationEntry[] };
    content_identity: { algorithm: 'sha256-observation-v1'; sha256: string };
    snapshot_tree_sha256: string;
    contracts: {
        coverage: 'complete' | 'partial' | 'not_provided';
        entries: ObservationContract[];
    };
    validation: ObservationValidation[];
};
export type PinnedObservation = { sha256: string; observation: SkillObservation };
export type BumpAssessment = {
    before_sha256: string;
    after_sha256: string;
    coverage: 'complete' | 'partial';
    files: Array<{
        path: string;
        reason: ReviewReason;
        contracts: string[];
        evidence_sha256: string;
    }>;
    contracts: Array<{ id: string; reason: ReviewReason; evidence_sha256: string }>;
    provenance: {
        reason: 'compatible_correction' | 'required_migration' | 'undetermined';
        evidence_sha256: string;
    } | null;
};
export type BumpRequest = {
    schema_version: 1;
    before: PinnedObservation;
    after: PinnedObservation;
    assessment: BumpAssessment | null;
    limit: number;
    offset: number;
};
export const bumpDigest = (value: unknown): string =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const compareText = (a: string, b: string): number => Buffer.from(a).compare(Buffer.from(b));

/** Canonical closed evidence; hashes identify assertions but do not authenticate them. */
export class SkillBumpReportValidator {
    request(value: unknown): BumpRequest {
        this.bytes(value, MAX_BUMP_REQUEST_BYTES);
        const input = this.object(
            value,
            ['schema_version', 'before', 'after', 'assessment', 'limit', 'offset'],
            ['schema_version', 'before', 'after', 'assessment'],
        );
        if (input.schema_version !== 1) this.invalid();
        const before = this.pinned(input.before),
            after = this.pinned(input.after);
        if (
            JSON.stringify(before.observation.subject) !== JSON.stringify(after.observation.subject)
        )
            this.invalid();
        const assessment = input.assessment === null ? null : this.assessment(input.assessment);
        if (
            assessment &&
            (assessment.before_sha256 !== before.sha256 || assessment.after_sha256 !== after.sha256)
        )
            this.invalid();
        return {
            schema_version: 1,
            before,
            after,
            assessment,
            limit: this.integer(input.limit === undefined ? 20 : input.limit, 1, 100),
            offset: this.integer(input.offset === undefined ? 0 : input.offset, 0, 4096),
        };
    }

    observation(value: unknown): SkillObservation {
        this.bytes(value, MAX_OBSERVATION_BYTES);
        const input = this.object(value, [
            'schema_version',
            'subject',
            'source',
            'inventory',
            'content_identity',
            'snapshot_tree_sha256',
            'contracts',
            'validation',
        ]);
        if (input.schema_version !== 1) this.invalid();
        const subject = this.subject(input.subject),
            source = this.source(input.source);
        const inventory = this.inventory(input.inventory);
        const identity = this.object(input.content_identity, ['algorithm', 'sha256']);
        const expected = this.contentIdentity(subject, inventory);
        if (identity.algorithm !== expected.algorithm || identity.sha256 !== expected.sha256)
            this.invalid();
        const contracts = this.contracts(input.contracts, inventory.entries);
        const validation = this.validations(input.validation, expected.sha256);
        return {
            schema_version: 1,
            subject,
            source,
            inventory,
            content_identity: expected,
            snapshot_tree_sha256: this.hash(input.snapshot_tree_sha256),
            contracts,
            validation,
        };
    }

    subject(value: unknown): ObservationSubject {
        const input = this.object(value, ['scope', 'collection', 'skill']);
        const scope = this.oneOf(input.scope, ['skill', 'collection'] as const);
        const skill = scope === 'skill' ? this.slug(input.skill) : null;
        if (scope === 'collection' && input.skill !== null) this.invalid();
        return { scope, collection: this.slug(input.collection), skill };
    }

    source(value: unknown): ObservationSource {
        const input = this.object(value, ['repository', 'source_ref', 'resolved_git_sha']);
        let repository: string | null = null;
        if (input.repository !== null) {
            if (
                typeof input.repository !== 'string' ||
                input.repository.length > 2048 ||
                /[\s\\?#]/u.test(input.repository)
            )
                this.invalid();
            try {
                const url = new URL(input.repository);
                if (
                    url.protocol !== 'https:' ||
                    url.username ||
                    url.password ||
                    (url.port && url.port !== '443') ||
                    !publicSourceHostname(url.hostname)
                )
                    this.invalid();
                url.hostname = url.hostname.replace(/\.$/u, '');
                repository = url.href.replace(/\/$/u, '');
            } catch {
                this.invalid();
            }
        }
        const sha = input.resolved_git_sha;
        if (
            sha !== null &&
            (typeof sha !== 'string' ||
                !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(sha) ||
                repository === null)
        )
            this.invalid();
        const ref = input.source_ref;
        if (
            ref !== null &&
            (typeof ref !== 'string' ||
                !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u.test(ref) ||
                ref.includes('..') ||
                ref.includes('//') ||
                ref.endsWith('/') ||
                sha === null)
        )
            this.invalid();
        return {
            repository,
            source_ref: ref as string | null,
            resolved_git_sha: sha as string | null,
        };
    }

    contentIdentity(subject: ObservationSubject, inventory: SkillObservation['inventory']) {
        return {
            algorithm: 'sha256-observation-v1' as const,
            sha256: bumpDigest({ subject, inventory }),
        };
    }

    pin(value: unknown): PinnedObservation {
        const observation = this.observation(value);
        return { sha256: bumpDigest(observation), observation };
    }

    evidence(value: unknown, entries: ObservationEntry[], identity: string) {
        const input = this.object(value, ['contracts', 'validation']);
        return {
            contracts: this.contracts(input.contracts, entries),
            validation: this.validations(input.validation, identity),
        };
    }

    inventory(value: unknown): SkillObservation['inventory'] {
        const input = this.object(value, ['root_mode', 'entries']);
        const entries = this.array(input.entries, MAX_OBSERVATION_ENTRIES)
            .map((value) => {
                const raw = this.object(
                    value,
                    [
                        'path',
                        'type',
                        'mode',
                        'size',
                        'sha256',
                        'target_sha256',
                        'target_is_absolute',
                    ],
                    ['path', 'type', 'mode'],
                );
                const type = this.oneOf(raw.type, ['file', 'directory', 'symlink'] as const);
                const fields =
                    type === 'file'
                        ? ['path', 'type', 'mode', 'size', 'sha256']
                        : type === 'symlink'
                          ? ['path', 'type', 'mode', 'target_sha256', 'target_is_absolute']
                          : ['path', 'type', 'mode'];
                this.object(raw, fields);
                const entry: ObservationEntry = {
                    path: this.path(raw.path),
                    type,
                    mode: this.integer(raw.mode, 0, 0o777),
                };
                if (type === 'file') {
                    entry.size = this.integer(raw.size, 0, MAX_OBSERVATION_CONTENT_BYTES);
                    entry.sha256 = this.hash(raw.sha256);
                }
                if (type === 'symlink') {
                    entry.target_sha256 = this.hash(raw.target_sha256);
                    entry.target_is_absolute = this.boolean(raw.target_is_absolute);
                }
                return entry;
            })
            .sort((a, b) => compareText(a.path, b.path));
        this.unique(entries.map((entry) => entry.path));
        const seen = new Map<string, string>();
        let total = 0;
        for (const entry of entries) {
            const parent = entry.path.includes('/')
                ? entry.path.slice(0, entry.path.lastIndexOf('/'))
                : null;
            if (parent && seen.get(parent) !== 'directory') this.invalid();
            seen.set(entry.path, entry.type);
            total += entry.size ?? 0;
        }
        if (total > MAX_OBSERVATION_CONTENT_BYTES) this.invalid();
        return { root_mode: this.integer(input.root_mode, 0, 0o777), entries };
    }

    private pinned(value: unknown): PinnedObservation {
        const input = this.object(value, ['sha256', 'observation']);
        const result = this.pin(input.observation);
        if (this.hash(input.sha256) !== result.sha256) this.invalid();
        return result;
    }

    private contracts(value: unknown, files: ObservationEntry[]): SkillObservation['contracts'] {
        const input = this.object(value, ['coverage', 'entries']);
        const coverage = this.oneOf(input.coverage, [
            'complete',
            'partial',
            'not_provided',
        ] as const);
        const inventory = new Map(files.map((file) => [file.path, file]));
        const entries = this.array(input.entries, 128)
            .map((value) => {
                const item = this.object(value, [
                    'id',
                    'kind',
                    'required',
                    'signature_sha256',
                    'files',
                ]);
                const definitions = this.array(item.files, 8)
                    .map((value) => {
                        const definition = this.object(value, ['path', 'sha256']);
                        const path = this.path(definition.path),
                            sha256 = this.hash(definition.sha256);
                        if (
                            inventory.get(path)?.type !== 'file' ||
                            inventory.get(path)?.sha256 !== sha256
                        )
                            this.invalid();
                        return { path, sha256 };
                    })
                    .sort((a, b) => compareText(a.path, b.path));
                this.unique(definitions.map((item) => item.path));
                if (!definitions.length) this.invalid();
                return {
                    id: this.slug(item.id),
                    kind: this.oneOf(item.kind, [
                        'capability',
                        'input',
                        'output',
                        'compatibility',
                        'integration',
                    ] as const),
                    required: this.boolean(item.required),
                    signature_sha256: this.hash(item.signature_sha256),
                    files: definitions,
                };
            })
            .sort((a, b) => compareText(a.id, b.id));
        this.unique(entries.map((item) => item.id));
        if (coverage === 'not_provided' && entries.length) this.invalid();
        return { coverage, entries };
    }

    private validations(value: unknown, identity: string): ObservationValidation[] {
        const records = this.array(value, validationKinds.length)
            .map((value) => {
                const input = this.object(value, [
                    'kind',
                    'status',
                    'content_sha256',
                    'evidence_sha256',
                ]);
                const status = this.oneOf(input.status, ['passed', 'failed', 'not_run'] as const);
                const content_sha256 = this.hash(input.content_sha256);
                if (
                    content_sha256 !== identity ||
                    (status === 'not_run' && input.evidence_sha256 !== null)
                )
                    this.invalid();
                return {
                    kind: this.oneOf(input.kind, validationKinds),
                    status,
                    content_sha256,
                    evidence_sha256: status === 'not_run' ? null : this.hash(input.evidence_sha256),
                };
            })
            .sort((a, b) => compareText(a.kind, b.kind));
        this.unique(records.map((record) => record.kind));
        return records;
    }

    private assessment(value: unknown): BumpAssessment {
        const input = this.object(value, [
            'before_sha256',
            'after_sha256',
            'coverage',
            'files',
            'contracts',
            'provenance',
        ]);
        const files = this.array(input.files, MAX_OBSERVATION_ENTRIES * 2 + 1)
            .map((value) => {
                const item = this.object(value, ['path', 'reason', 'contracts', 'evidence_sha256']);
                const contracts = this.array(item.contracts, 128)
                    .map((value) => this.slug(value))
                    .sort(compareText);
                this.unique(contracts);
                return {
                    path: item.path === '.' ? '.' : this.path(item.path),
                    reason: this.oneOf(item.reason, reviewReasons),
                    contracts,
                    evidence_sha256: this.hash(item.evidence_sha256),
                };
            })
            .sort((a, b) => compareText(a.path, b.path));
        this.unique(files.map((item) => item.path));
        const contracts = this.array(input.contracts, 256)
            .map((value) => {
                const item = this.object(value, ['id', 'reason', 'evidence_sha256']);
                return {
                    id: this.slug(item.id),
                    reason: this.oneOf(item.reason, reviewReasons),
                    evidence_sha256: this.hash(item.evidence_sha256),
                };
            })
            .sort((a, b) => compareText(a.id, b.id));
        this.unique(contracts.map((item) => item.id));
        let provenance: BumpAssessment['provenance'] = null;
        if (input.provenance !== null) {
            const item = this.object(input.provenance, ['reason', 'evidence_sha256']);
            provenance = {
                reason: this.oneOf(item.reason, [
                    'compatible_correction',
                    'required_migration',
                    'undetermined',
                ] as const),
                evidence_sha256: this.hash(item.evidence_sha256),
            };
        }
        return {
            before_sha256: this.hash(input.before_sha256),
            after_sha256: this.hash(input.after_sha256),
            coverage: this.oneOf(input.coverage, ['complete', 'partial'] as const),
            files,
            contracts,
            provenance,
        };
    }

    bytes(value: unknown, maximum: number): void {
        try {
            if (Buffer.byteLength(JSON.stringify(value)) > maximum) this.invalid();
        } catch {
            this.invalid();
        }
    }
    private object(value: unknown, fields: string[], required = fields): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) this.invalid();
        const input = value as Record<string, unknown>;
        if (
            Object.keys(input).some((key) => !fields.includes(key)) ||
            required.some((key) => !Object.hasOwn(input, key))
        )
            this.invalid();
        return input;
    }
    private array(value: unknown, maximum: number): unknown[] {
        if (!Array.isArray(value) || value.length > maximum) this.invalid();
        return value as unknown[];
    }
    private unique(values: string[]): void {
        if (new Set(values).size !== values.length) this.invalid();
    }
    private oneOf<const T extends readonly string[]>(value: unknown, choices: T): T[number] {
        if (typeof value !== 'string' || !choices.includes(value)) this.invalid();
        return value as T[number];
    }
    private integer(value: unknown, minimum: number, maximum: number): number {
        if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum)
            this.invalid();
        return value as number;
    }
    private boolean(value: unknown): boolean {
        if (typeof value !== 'boolean') this.invalid();
        return value as boolean;
    }
    private slug(value: unknown): string {
        if (
            typeof value !== 'string' ||
            !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value) ||
            value.length > 64
        )
            this.invalid();
        return value as string;
    }
    private path(value: unknown): string {
        try {
            relativeParts(value);
        } catch {
            this.invalid();
        }
        return value as string;
    }
    private hash(value: unknown): string {
        if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) this.invalid();
        return value as string;
    }
    private invalid(): never {
        throw new SkillBumpReportError('invalid_input');
    }
}
