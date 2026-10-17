// SPDX-License-Identifier: Apache-2.0
import { SkillPanelConfiguration } from './SkillPanelConfiguration.ts';

const object = (properties: Record<string, unknown>) => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
});
const skill = {
    anyOf: [
        { type: 'string', maxLength: 64, pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$' },
        { type: 'string', pattern: '^global:[a-f0-9]{64}$', maxLength: 71 },
    ],
};
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const proposalId = { type: 'string', format: 'uuid', maxLength: 36 };
const approval = (action: string) =>
    object({
        action: { const: action },
        proposal_id: proposalId,
        base_sha256: hash,
        candidate_sha256: hash,
        approved: { const: true },
    });

/** Advertised only for an explicitly selected local pilot; app-only is not client authentication. */
export class SkillPanelToolConfiguration {
    static readonly resource = {
        uri: SkillPanelConfiguration.resourceUri,
        name: 'I-9 Skills local change panel',
        mimeType: 'text/html;profile=mcp-app',
    };
    static readonly tools = [
        {
            name: 'skill_panel_open',
            title: 'I-9 Skills',
            description:
                'Open the optional local skill-change pilot and page its explicitly selected live catalog and optional globals. Global evolution requires explicit runtime opt-in and package eligibility; inspect read_only and its reason. Use next_offset to retrieve subsequent pages. No state, hooks or telemetry are created.',
            inputSchema: {
                ...object({
                    offset: { type: 'integer', minimum: 0, maximum: 1024 },
                    limit: { type: 'integer', minimum: 1, maximum: 128 },
                }),
                required: [],
            },
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: {
                ui: { resourceUri: SkillPanelConfiguration.resourceUri },
                'openai/ui': { entrypoints: [{ type: 'global' }] },
            },
        },
        {
            name: 'skill_panel_inspect',
            description:
                'Read a selected package or source-qualified global skill. Eligible opted-in globals include the full package identity; other globals return SKILL.md and a read-only reason. No scripts execute or state is written.',
            inputSchema: object({ skill }),
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        {
            name: 'skill_panel_propose',
            description:
                'Retain supplied SKILL.md candidate text, original package and local structural checks for a selected or explicitly enabled eligible global skill. Use its inspected source-qualified ID and exact package base. Does not generate, approve or apply a change.',
            inputSchema: object({
                skill,
                base_sha256: hash,
                after: { type: 'string', maxLength: 32768 },
                rationale: { type: 'string', maxLength: 2000 },
            }),
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false,
            },
            _meta: { ui: { resourceUri: SkillPanelConfiguration.resourceUri } },
        },
        {
            name: 'skill_panel_proposal',
            description:
                'Inspect one retained proposal, its exact diff and observed application/recovery state without writing.',
            inputSchema: object({ proposal_id: proposalId }),
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        {
            name: 'skill_panel_request',
            description:
                'Retain an explicit panel review/change request at the live source identity. The app sends its instructions through the host only after the user clicks; this operation never starts a model or changes skill files.',
            inputSchema: {
                type: 'object',
                oneOf: [
                    object({
                        skill: { type: 'string', maxLength: 71 },
                        kind: { enum: ['review', 'proposal'] },
                        focus: { anyOf: [{ type: 'string', maxLength: 2000 }, { type: 'null' }] },
                    }),
                    object({ request_id: proposalId }),
                ],
            },
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
            _meta: { ui: { visibility: ['app'] } },
        },
        {
            name: 'skill_panel_complete',
            description:
                'Record the result of a panel-requested review: no_changes, findings, proposal or blocked. A proposal must match the request skill and frozen base; other outcomes use proposal_id null. This is an agent assertion, not approval or quality certification. Exact retries are idempotent.',
            inputSchema: object({
                request_id: proposalId,
                outcome: { enum: ['no_changes', 'findings', 'proposal', 'blocked'] },
                summary: { type: 'string', maxLength: 2000 },
                proposal_id: { anyOf: [proposalId, { type: 'null' }] },
            }),
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
            _meta: { ui: { resourceUri: SkillPanelConfiguration.resourceUri } },
        },
        {
            name: 'skill_panel_activity',
            description:
                'List recorded review outcomes and selectable proposal summaries for one skill. No state is created. Summaries are not readiness checks: open a proposal to verify its current source, retained bytes and exact diff.',
            inputSchema: object({ skill: { type: 'string', maxLength: 71 } }),
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        {
            name: 'skill_panel_apply',
            description:
                'Apply only after explicit UI approval of the exact reviewed proposal; reject stale source, failed checks or modified retained bytes. The trusted host owns human consent.',
            inputSchema: approval('apply'),
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: false,
            },
            _meta: { ui: { visibility: ['app'] } },
        },
        {
            name: 'skill_panel_recover',
            description:
                'Restore the retained entrypoint only after explicit UI recovery approval and unchanged candidate bytes. Preserve all recovery state and refuse intervening edits.',
            inputSchema: approval('recover'),
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: false,
            },
            _meta: { ui: { visibility: ['app'] } },
        },
    ];
}
