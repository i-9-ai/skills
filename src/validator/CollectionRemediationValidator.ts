// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export type CollectionSelection = { collection: string; layout: 'repository' | 'global' };
export type CollectionFinding = {
    code: string;
    path: string;
    message: string;
    remediation: 'catalog.sync' | 'handoff';
    owner: 'skills-catalog' | 'skill-evolution' | 'skill-security-review';
};
export type CollectionBaseline = {
    root_identity_sha256: string;
    layout: 'repository' | 'global';
    inventory_sha256: string;
    catalog_sha256: string | null;
    catalog_mode: number | null;
};
export type CollectionAudit = {
    schema_version: 1;
    policy: 'collection-maintenance-v1';
    baseline: CollectionBaseline;
    packages: Array<{ name: string; path: string; validation: 'passed' | 'failed' | 'not_run' }>;
    catalog: {
        status: 'current' | 'missing' | 'stale' | 'malformed' | 'unavailable';
        expected_after_sha256: string | null;
    };
    findings: CollectionFinding[];
    coverage: { complete: boolean; examined_entries: number; omitted: 0 | null };
    validation: { local: 'structural'; official: 'not_run'; behavioral: 'not_run' };
};
export type CollectionPlan = {
    schema_version: 1;
    policy: 'collection-maintenance-v1';
    audit_sha256: string;
    baseline: CollectionBaseline;
    operations: Array<{
        type: 'catalog.sync';
        target: 'skills-catalog.json';
        expected_after_sha256: string;
    }>;
    handoffs: CollectionFinding[];
    coverage: CollectionAudit['coverage'];
};

/** Closed plans are regenerated from current evidence, never interpreted as executable input. */
export class CollectionRemediationValidator {
    selection(input: CollectionSelection): CollectionSelection {
        if (
            !input ||
            Object.keys(input).some((key) => !['collection', 'layout'].includes(key)) ||
            typeof input.collection !== 'string' ||
            !input.collection.trim() ||
            input.collection.length > 4096 ||
            !input.collection.isWellFormed() ||
            /[\x00-\x1f\x7f]/u.test(input.collection) ||
            !['repository', 'global'].includes(input.layout)
        ) {
            throw new Error('Select one explicit collection root and repository or global layout.');
        }
        return { collection: input.collection, layout: input.layout };
    }

    digest(bytes: Buffer | string): string {
        return createHash('sha256').update(bytes).digest('hex');
    }

    encode(value: unknown): Buffer {
        const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
        if (bytes.length > 1_048_576) throw new Error('Maintenance result exceeds its byte limit.');
        return bytes;
    }

    plan(audit: CollectionAudit): CollectionPlan {
        const operations: CollectionPlan['operations'] = [];
        if (
            audit.coverage.complete &&
            ['missing', 'stale'].includes(audit.catalog.status) &&
            audit.catalog.expected_after_sha256
        ) {
            operations.push({
                type: 'catalog.sync',
                target: 'skills-catalog.json',
                expected_after_sha256: audit.catalog.expected_after_sha256,
            });
        }
        return {
            schema_version: 1,
            policy: 'collection-maintenance-v1',
            audit_sha256: this.digest(this.encode(audit)),
            baseline: audit.baseline,
            operations,
            handoffs: audit.findings.filter((finding) => finding.remediation === 'handoff'),
            coverage: audit.coverage,
        };
    }

    auditMatches(selected: unknown, current: CollectionAudit): void {
        if (!isDeepStrictEqual(selected, current)) {
            throw new Error(
                'Selected audit is stale or unsupported; audit the selected collection again.',
            );
        }
    }

    planMatches(selected: unknown, current: CollectionAudit): CollectionPlan {
        const expected = this.plan(current);
        if (!isDeepStrictEqual(selected, expected)) {
            throw new Error(
                'Selected plan is stale or unsupported; generate a new plan from a current audit.',
            );
        }
        if (!current.coverage.complete) {
            throw new Error(
                'Incomplete or unsafe audit coverage prevents evolution; resolve its handoffs first.',
            );
        }
        return expected;
    }
}
