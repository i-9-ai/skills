// SPDX-License-Identifier: Apache-2.0
import { SkillOperationError } from './SkillOperationError.ts';

export const PANEL_TEXT_BYTES = 32_768;
export type PanelApproval = {
    action: 'apply' | 'recover';
    proposal_id: string;
    base_sha256: string;
    candidate_sha256: string;
    approved: true;
};
export type PanelRequest = {
    skill: string;
    kind: 'review' | 'proposal';
    focus: string | null;
};
export type PanelCompletion = {
    request_id: string;
    outcome: 'no_changes' | 'findings' | 'proposal' | 'blocked';
    summary: string;
    proposal_id: string | null;
};

/** Closed, bounded inputs for one entrypoint change in an explicitly selected collection. */
export class SkillPanelValidator {
    object(value: unknown, keys: string[]): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) this.invalid();
        const object = value as Record<string, unknown>;
        if (
            Object.keys(object).length !== keys.length ||
            keys.some((key) => !Object.hasOwn(object, key))
        )
            this.invalid();
        return object;
    }

    name(value: unknown): string {
        if (
            typeof value !== 'string' ||
            value.length > 64 ||
            !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)
        )
            this.invalid();
        return value as string;
    }

    hash(value: unknown): string {
        if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) this.invalid();
        return value as string;
    }

    id(value: unknown): string {
        if (
            typeof value !== 'string' ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
        )
            this.invalid();
        return value as string;
    }

    text(value: unknown, maximum = PANEL_TEXT_BYTES): string {
        if (
            typeof value !== 'string' ||
            !value.trim() ||
            !value.isWellFormed() ||
            /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) ||
            Buffer.byteLength(value) > maximum
        )
            this.invalid();
        return value as string;
    }

    selection(value: unknown): string {
        return this.name(this.object(value, ['skill']).skill);
    }

    inspection(value: unknown): string {
        const skill = this.object(value, ['skill']).skill;
        if (typeof skill === 'string' && /^global:[a-f0-9]{64}$/.test(skill)) return skill;
        return this.name(skill);
    }

    catalog(value: unknown) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) this.invalid();
        const query = value as Record<string, unknown>;
        if (Object.keys(query).some((key) => !['offset', 'limit'].includes(key))) this.invalid();
        const offset = query.offset === undefined ? 0 : query.offset;
        const limit = query.limit === undefined ? 128 : query.limit;
        if (!Number.isInteger(offset) || (offset as number) < 0 || (offset as number) > 1024)
            this.invalid();
        if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 128)
            this.invalid();
        return { offset: offset as number, limit: limit as number };
    }

    candidate(value: unknown) {
        const data = this.object(value, ['skill', 'base_sha256', 'after', 'rationale']);
        return {
            skill: this.inspection({ skill: data.skill }),
            base_sha256: this.hash(data.base_sha256),
            after: this.text(data.after),
            rationale: this.text(data.rationale, 2000),
        };
    }

    workflowRequest(value: unknown): PanelRequest {
        const data = this.object(value, ['skill', 'kind', 'focus']);
        const skill = this.inspection({ skill: data.skill });
        if (!['review', 'proposal'].includes(data.kind as string)) this.invalid();
        return {
            skill,
            kind: data.kind as PanelRequest['kind'],
            focus: data.focus === null ? null : this.text(data.focus, 2000),
        };
    }

    completion(value: unknown): PanelCompletion {
        const data = this.object(value, ['request_id', 'outcome', 'summary', 'proposal_id']);
        if (!['no_changes', 'findings', 'proposal', 'blocked'].includes(data.outcome as string))
            this.invalid();
        if ((data.outcome === 'proposal') !== (data.proposal_id !== null)) this.invalid();
        return {
            request_id: this.id(data.request_id),
            outcome: data.outcome as PanelCompletion['outcome'],
            summary: this.text(data.summary, 2000),
            proposal_id: data.proposal_id === null ? null : this.id(data.proposal_id),
        };
    }

    approval(value: unknown): PanelApproval {
        const data = this.object(value, [
            'action',
            'proposal_id',
            'base_sha256',
            'candidate_sha256',
            'approved',
        ]);
        if (data.approved !== true || !['apply', 'recover'].includes(data.action as string))
            this.invalid();
        return {
            action: data.action as 'apply' | 'recover',
            proposal_id: this.id(data.proposal_id),
            base_sha256: this.hash(data.base_sha256),
            candidate_sha256: this.hash(data.candidate_sha256),
            approved: true,
        };
    }

    invalid(): never {
        throw new SkillOperationError('invalid_input');
    }
}
