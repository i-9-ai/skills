// SPDX-License-Identifier: Apache-2.0
import { SkillPanelConfiguration } from './SkillPanelConfiguration.ts';

const object = (properties: Record<string, unknown>) => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
});
const skill = { type: 'string', maxLength: 64, pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$' };
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
                'Open the optional local skill-change pilot and read its explicitly selected live catalog. No state, hooks or telemetry are created.',
            inputSchema: object({}),
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: {
                ui: { resourceUri: SkillPanelConfiguration.resourceUri },
                'openai/ui': { entrypoints: [{ type: 'global' }] },
            },
        },
        {
            name: 'skill_panel_inspect',
            description:
                'Read an ordinary direct selected skill and its exact entrypoint/package identity; no scripts execute or state is written.',
            inputSchema: object({ skill }),
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        {
            name: 'skill_panel_propose',
            description:
                'Retain supplied SKILL.md candidate text, original package and local structural checks for review. Does not generate, approve or apply a change.',
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
