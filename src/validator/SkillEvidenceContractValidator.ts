// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { relativeParts } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';
import { publicSourceHostname } from '../../.agents/skills/skill-authoring/scripts/lib/public-host.mjs';
import { SkillReadValidator } from './SkillReadValidator.ts';
import { SkillOperationError } from './SkillOperationError.ts';

export type EvidenceSource = {
    repository: string | null;
    source_ref: string | null;
    resolved_git_sha: string | null;
};
export type PackageEvidenceSource = EvidenceSource & {
    package_path: string;
    package_sha256: string;
};
export type EvidenceEnvelope = {
    schema_version: 2;
    event_id: string;
    correlation_id: string;
    occurred_at: string;
    source_host: string;
    source_adapter: string;
};

export type ValidatedEvidenceEvent = EvidenceEnvelope & {
    event_type: string;
    session: string | null;
    payload: unknown;
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
/** Shared normalization only; no filesystem/process/storage effects or provenance proof. */
export class SkillEvidenceContractValidator {
    static evidenceDigest(value: unknown): string {
        return createHash('sha256').update(JSON.stringify(value)).digest('hex');
    }
    static sourceKey(
        source: PackageEvidenceSource | (EvidenceSource & { package_path: string }),
    ): string {
        return this.evidenceDigest([source.repository, source.package_path]);
    }
    static identityKey(source: PackageEvidenceSource): string {
        return this.evidenceDigest([
            this.sourceKey(source),
            source.resolved_git_sha,
            source.package_sha256,
        ]);
    }
    common(event: Record<string, unknown>): EvidenceEnvelope {
        return {
            schema_version: 2,
            event_id: this.uuid(event.event_id),
            correlation_id: this.uuid(event.correlation_id),
            occurred_at: this.timestamp(event.occurred_at),
            source_host: this.slug(event.source_host),
            source_adapter: this.slug(event.source_adapter),
        };
    }
    envelope(value: unknown, limit: number) {
        try {
            if (Buffer.byteLength(JSON.stringify(value), 'utf8') > limit) this.invalid();
        } catch {
            this.invalid();
        }
        const event = this.object(value, envelopeFields);
        if (event.schema_version !== 2) this.invalid();
        return event;
    }
    source(value: unknown): EvidenceSource {
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
    packageSource(value: unknown): PackageEvidenceSource {
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
    path(value: unknown): string {
        try {
            relativeParts(value);
        } catch {
            this.invalid();
        }
        return value as string;
    }
    hash(value: unknown): string {
        if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) this.invalid();
        return value as string;
    }
    slug(value: unknown): string {
        if (
            typeof value !== 'string' ||
            !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value) ||
            value.length > 64
        )
            this.invalid();
        return value as string;
    }
    uuid(value: unknown): string {
        if (typeof value !== 'string' || !uuid.test(value)) this.invalid();
        return value as string;
    }
    timestamp(value: unknown): string {
        try {
            return new SkillReadValidator().timestamp(value);
        } catch {
            return this.invalid();
        }
    }
    integer(value: unknown, minimum: number, maximum: number): number {
        if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum)
            this.invalid();
        return value as number;
    }
    object(value: unknown, fields: string[], exact = true): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) this.invalid();
        const input = value as Record<string, unknown>;
        if (
            Object.keys(input).some((key) => !fields.includes(key)) ||
            (exact && fields.some((key) => !Object.hasOwn(input, key)))
        )
            this.invalid();
        return input;
    }
    invalid(): never {
        throw new SkillOperationError('invalid_input');
    }
}
