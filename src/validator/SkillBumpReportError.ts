// SPDX-License-Identifier: Apache-2.0
const messages = {
    invalid_input:
        'Invalid bump evidence; use the documented closed schemas, identities and bounds.',
    snapshot_unavailable: 'Selected snapshot could not be verified within the observation bounds.',
    onboarding_unavailable:
        'Installed onboarding identity is unavailable; select a valid package artifact.',
    response_too_large: 'Bump evidence exceeds its byte limit; select a smaller scope or page.',
} as const;

/** Static public errors never include caller paths, content or malformed evidence. */
export class SkillBumpReportError extends Error {
    readonly code: keyof typeof messages;

    constructor(code: keyof typeof messages) {
        super(messages[code]);
        this.name = 'SkillBumpReportError';
        this.code = code;
    }
}
