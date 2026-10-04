// SPDX-License-Identifier: Apache-2.0
import { SkillEvidenceContractValidator } from './SkillEvidenceContractValidator.ts';
import type {
    EvidenceEnvelope as Envelope,
    EvidenceSource,
    PackageEvidenceSource,
} from './SkillEvidenceContractValidator.ts';
import { SkillOperationError } from './SkillOperationError.ts';
export type { EvidenceSource, PackageEvidenceSource } from './SkillEvidenceContractValidator.ts';

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
/** Closed caller assertions; validation neither reads packages nor proves provenance. */
export class SkillEvidenceValidator {
    private readonly contract = new SkillEvidenceContractValidator();
    lifecycle(value: unknown): LifecycleEvent {
        const event = this.contract.envelope(value, 8192);
        if (!lifecycleTypes.includes(event.event_type as LifecycleType)) this.invalid();
        const session = this.contract.uuid(event.session);
        const payload = this.contract.object(event.payload, [
            'collection',
            'skill',
            'source',
            'reason',
        ]);
        const type = event.event_type as LifecycleType;
        const reasons: readonly string[] = lifecycleReasons[type];
        if (reasons.length ? !reasons.includes(payload.reason as string) : payload.reason !== null)
            this.invalid();
        return {
            ...this.contract.common(event),
            event_type: type,
            session,
            payload: {
                collection: this.contract.slug(payload.collection),
                skill: this.contract.slug(payload.skill),
                source: this.contract.packageSource(payload.source),
                reason: payload.reason as string | null,
            },
        };
    }

    catalog(value: unknown): CatalogObservation {
        const event = this.contract.envelope(value, 262144);
        if (event.event_type !== 'catalog.observed' || event.session !== null) this.invalid();
        const payload = this.contract.object(event.payload, [
            'collection',
            'source',
            'catalog_sha256',
            'skills',
        ]);
        if (!Array.isArray(payload.skills) || payload.skills.length > 256) this.invalid();
        const skills = (payload.skills as unknown[])
            .map((value) => {
                const member = this.contract.object(value, [
                    'skill',
                    'package_path',
                    'package_sha256',
                    'metadata_sha256',
                ]);
                return {
                    skill: this.contract.slug(member.skill),
                    package_path: this.contract.path(member.package_path),
                    package_sha256: this.contract.hash(member.package_sha256),
                    metadata_sha256: this.contract.hash(member.metadata_sha256),
                };
            })
            .sort((left, right) => left.skill.localeCompare(right.skill, 'en'));
        if (
            new Set(skills.map((member) => member.skill)).size !== skills.length ||
            new Set(skills.map((member) => member.package_path)).size !== skills.length
        )
            this.invalid();
        return {
            ...this.contract.common(event),
            event_type: 'catalog.observed',
            session: null,
            payload: {
                collection: this.contract.slug(payload.collection),
                source: this.contract.source(payload.source),
                catalog_sha256: this.contract.hash(payload.catalog_sha256),
                skills,
            },
        };
    }

    query(value: unknown, kind: 'lifecycle' | 'overlap' | 'inactivity' | 'history'): EvidenceQuery {
        const fields = ['from', 'until', 'collection', 'skill', 'limit'];
        if (kind === 'lifecycle') fields.push('interval');
        if (kind === 'history')
            fields.push('after_sequence', 'observation_sequence', 'after_skill');
        const input = this.contract.object(value, fields, false);
        const from = this.contract.timestamp(input.from),
            until = this.contract.timestamp(input.until);
        if (from >= until || Date.parse(until) - Date.parse(from) > 366 * 86400000) this.invalid();
        const interval = input.interval ?? 'total';
        if (!['total', 'day', 'month'].includes(interval as string)) this.invalid();
        const observation =
            input.observation_sequence === undefined
                ? undefined
                : this.contract.integer(input.observation_sequence, 1, Number.MAX_SAFE_INTEGER);
        if (
            (input.after_skill !== undefined && observation === undefined) ||
            (observation !== undefined && input.after_sequence !== undefined)
        )
            this.invalid();
        return {
            from,
            until,
            ...(input.collection === undefined
                ? {}
                : { collection: this.contract.slug(input.collection) }),
            ...(input.skill === undefined ? {} : { skill: this.contract.slug(input.skill) }),
            limit: this.contract.integer(input.limit ?? 20, 1, 100),
            interval: interval as EvidenceQuery['interval'],
            after_sequence: this.contract.integer(
                input.after_sequence ?? 0,
                0,
                Number.MAX_SAFE_INTEGER,
            ),
            ...(observation === undefined ? {} : { observation_sequence: observation }),
            ...(input.after_skill === undefined
                ? {}
                : { after_skill: this.contract.slug(input.after_skill) }),
        };
    }

    private invalid(): never {
        throw new SkillOperationError('invalid_input');
    }
}
