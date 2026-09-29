// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { relativeParts } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';
import { publicSourceHostname } from '../../.agents/skills/skill-authoring/scripts/lib/public-host.mjs';
import { SkillReadValidator } from './SkillReadValidator.ts';
import { SkillOperationError } from './SkillOperationError.ts';

export const lifecycleTypes = [
    'skill.routed',
    'skill.activated',
    'skill.completed',
    'skill.not_applicable',
    'skill.blocked',
    'skill.abandoned',
] as const;
export type LifecycleType = (typeof lifecycleTypes)[number];
export const lifecycleReasons = {
    'skill.routed': [],
    'skill.activated': [],
    'skill.completed': [],
    'skill.not_applicable': ['outside_scope', 'prerequisite_mismatch', 'superseded'],
    'skill.blocked': [
        'missing_input',
        'missing_dependency',
        'permission_required',
        'validation_failed',
        'unavailable_resource',
        'incompatible_environment',
    ],
    'skill.abandoned': ['caller_cancelled', 'superseded', 'execution_interrupted'],
} as const;
export type EvidenceSource = {
    repository: string | null;
    source_ref: string | null;
    resolved_git_sha: string | null;
};
export type PackageEvidenceSource = EvidenceSource & {
    package_path: string;
    package_sha256: string;
};
type Envelope = {
    schema_version: 2;
    event_id: string;
    correlation_id: string;
    occurred_at: string;
    source_host: string;
    source_adapter: string;
};
export type LifecycleEvent = Envelope & {
    event_type: LifecycleType;
    session: string;
    payload: {
        collection: string;
        skill: string;
        source: PackageEvidenceSource;
        reason: string | null;
    };
};
export type CatalogMember = {
    skill: string;
    package_path: string;
    package_sha256: string;
    metadata_sha256: string;
};
export type CatalogObservation = Envelope & {
    event_type: 'catalog.observed';
    session: null;
    payload: {
        collection: string;
        source: EvidenceSource;
        catalog_sha256: string;
        skills: CatalogMember[];
    };
};
export type EvidenceQuery = {
    from: string;
    until: string;
    collection?: string;
    skill?: string;
    limit: number;
    interval: 'total' | 'day' | 'month';
    after_sequence: number;
    observation_sequence?: number;
    after_skill?: string;
};
const envelopeFields = [
    'schema_version',
    'event_type',
    'event_id',
    'correlation_id',
    'occurred_at',
    'source_host',
    'source_adapter',
    'session',
    'payload',
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const evidenceDigest = (value: unknown): string =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sourceKey = (
    source: PackageEvidenceSource | (EvidenceSource & { package_path: string }),
): string => evidenceDigest([source.repository, source.package_path]);
export const identityKey = (source: PackageEvidenceSource): string =>
    evidenceDigest([sourceKey(source), source.resolved_git_sha, source.package_sha256]);

/** Closed caller assertions; validation neither reads packages nor proves provenance. */
export class SkillEvidenceValidator {
    lifecycle(value: unknown): LifecycleEvent {
        const event = this.envelope(value, 8192);
        if (!lifecycleTypes.includes(event.event_type as LifecycleType)) this.invalid();
        const session = this.uuid(event.session);
        const payload = this.object(event.payload, ['collection', 'skill', 'source', 'reason']);
        const type = event.event_type as LifecycleType;
        const reasons: readonly string[] = lifecycleReasons[type];
        if (reasons.length ? !reasons.includes(payload.reason as string) : payload.reason !== null)
            this.invalid();
        return {
            ...this.common(event),
            event_type: type,
            session,
            payload: {
                collection: this.slug(payload.collection),
                skill: this.slug(payload.skill),
                source: this.packageSource(payload.source),
                reason: payload.reason as string | null,
            },
        };
    }

    catalog(value: unknown): CatalogObservation {
        const event = this.envelope(value, 262144);
        if (event.event_type !== 'catalog.observed' || event.session !== null) this.invalid();
        const payload = this.object(event.payload, [
            'collection',
            'source',
            'catalog_sha256',
            'skills',
        ]);
        if (!Array.isArray(payload.skills) || payload.skills.length > 256) this.invalid();
        const skills = (payload.skills as unknown[])
            .map((value) => {
                const member = this.object(value, [
                    'skill',
                    'package_path',
                    'package_sha256',
                    'metadata_sha256',
                ]);
                return {
                    skill: this.slug(member.skill),
                    package_path: this.path(member.package_path),
                    package_sha256: this.hash(member.package_sha256),
                    metadata_sha256: this.hash(member.metadata_sha256),
                };
            })
            .sort((left, right) => left.skill.localeCompare(right.skill, 'en'));
        if (
            new Set(skills.map((member) => member.skill)).size !== skills.length ||
            new Set(skills.map((member) => member.package_path)).size !== skills.length
        )
            this.invalid();
        return {
            ...this.common(event),
            event_type: 'catalog.observed',
            session: null,
            payload: {
                collection: this.slug(payload.collection),
                source: this.source(payload.source),
                catalog_sha256: this.hash(payload.catalog_sha256),
                skills,
            },
        };
    }

    query(value: unknown, kind: 'lifecycle' | 'overlap' | 'inactivity' | 'history'): EvidenceQuery {
        const fields = ['from', 'until', 'collection', 'skill', 'limit'];
        if (kind === 'lifecycle') fields.push('interval');
        if (kind === 'history')
            fields.push('after_sequence', 'observation_sequence', 'after_skill');
        const input = this.object(value, fields, false);
        const from = this.timestamp(input.from),
            until = this.timestamp(input.until);
        if (from >= until || Date.parse(until) - Date.parse(from) > 366 * 86400000) this.invalid();
        const interval = input.interval ?? 'total';
        if (!['total', 'day', 'month'].includes(interval as string)) this.invalid();
        const observation =
            input.observation_sequence === undefined
                ? undefined
                : this.integer(input.observation_sequence, 1, Number.MAX_SAFE_INTEGER);
        if (
            (input.after_skill !== undefined && observation === undefined) ||
            (observation !== undefined && input.after_sequence !== undefined)
        )
            this.invalid();
        return {
            from,
            until,
            ...(input.collection === undefined ? {} : { collection: this.slug(input.collection) }),
            ...(input.skill === undefined ? {} : { skill: this.slug(input.skill) }),
            limit: this.integer(input.limit ?? 20, 1, 100),
            interval: interval as EvidenceQuery['interval'],
            after_sequence: this.integer(input.after_sequence ?? 0, 0, Number.MAX_SAFE_INTEGER),
            ...(observation === undefined ? {} : { observation_sequence: observation }),
            ...(input.after_skill === undefined
                ? {}
                : { after_skill: this.slug(input.after_skill) }),
        };
    }

    private common(event: Record<string, unknown>): Envelope {
        return {
            schema_version: 2,
            event_id: this.uuid(event.event_id),
            correlation_id: this.uuid(event.correlation_id),
            occurred_at: this.timestamp(event.occurred_at),
            source_host: this.slug(event.source_host),
            source_adapter: this.slug(event.source_adapter),
        };
    }
    private envelope(value: unknown, limit: number) {
        try {
            if (Buffer.byteLength(JSON.stringify(value), 'utf8') > limit) this.invalid();
        } catch {
            this.invalid();
        }
        const event = this.object(value, envelopeFields);
        if (event.schema_version !== 2) this.invalid();
        return event;
    }
    private source(value: unknown): EvidenceSource {
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
                const url = new URL(input.repository as string);
                if (
                    url.protocol !== 'https:' ||
                    url.username ||
                    url.password ||
                    url.search ||
                    url.hash ||
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
    private packageSource(value: unknown): PackageEvidenceSource {
        const input = this.object(value, [
            'repository',
            'source_ref',
            'resolved_git_sha',
            'package_path',
            'package_sha256',
        ]);
        return {
            ...this.source({
                repository: input.repository,
                source_ref: input.source_ref,
                resolved_git_sha: input.resolved_git_sha,
            }),
            package_path: this.path(input.package_path),
            package_sha256: this.hash(input.package_sha256),
        };
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
    private slug(value: unknown): string {
        if (
            typeof value !== 'string' ||
            !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value) ||
            value.length > 64
        )
            this.invalid();
        return value as string;
    }
    private uuid(value: unknown): string {
        if (typeof value !== 'string' || !uuid.test(value)) this.invalid();
        return value as string;
    }
    private timestamp(value: unknown): string {
        try {
            return new SkillReadValidator().timestamp(value);
        } catch {
            return this.invalid();
        }
    }
    private integer(value: unknown, minimum: number, maximum: number): number {
        if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum)
            this.invalid();
        return value as number;
    }
    private object(value: unknown, fields: string[], exact = true): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) this.invalid();
        const input = value as Record<string, unknown>;
        if (
            Object.keys(input).some((key) => !fields.includes(key)) ||
            (exact && fields.some((key) => !Object.hasOwn(input, key)))
        )
            this.invalid();
        return input;
    }
    private invalid(): never {
        throw new SkillOperationError('invalid_input');
    }
}
