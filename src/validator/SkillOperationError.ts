// SPDX-License-Identifier: Apache-2.0
const messages = {
    evidence_conflict:
        'Evidence conflicts with an existing occurrence or attempt; preserve the original identity.',
    schema_upgrade_required:
        'Evidence storage requires an explicit compatible schema upgrade; queries never migrate it.',
    query_limit_exceeded:
        'Evidence query exceeds its work limit; select a smaller period or collection.',
    catalog_unobserved:
        'No complete catalog observation exists for the selected period and collection.',
    invalid_input: 'Invalid input; use only the documented fields, types and limits.',
    catalog_unavailable:
        'Installed catalog unavailable; verify the package identity and catalog freshness.',
    resource_unavailable:
        'Selected resource unavailable; choose a cataloged skill and a supported Markdown file.',
    storage_unavailable:
        'Usage operation unavailable; verify the evidence and an external absolute data location.',
    response_too_large: 'Result exceeds the response limit; request a smaller result.',
    unknown_tool: 'Unknown tool; select a tool returned by tools/list.',
} as const;

export type SkillOperationErrorCode = keyof typeof messages;

/** Stable public failures never retain filesystem paths, requests or source contents. */
export class SkillOperationError extends Error {
    readonly code: SkillOperationErrorCode;

    constructor(code: SkillOperationErrorCode) {
        super(messages[code]);
        this.name = 'SkillOperationError';
        this.code = code;
    }
}
