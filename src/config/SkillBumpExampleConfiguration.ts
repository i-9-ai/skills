// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import {
    SkillBumpReportValidator,
    bumpDigest,
    validationKinds,
} from '../validator/SkillBumpReportValidator.ts';
import type {
    ObservationContract,
    ObservationEntry,
    ReviewReason,
} from '../validator/SkillBumpReportValidator.ts';

const bytesDigest = (value: string) => createHash('sha256').update(value).digest('hex');
const source = { repository: null, source_ref: null, resolved_git_sha: null };
const subject = { scope: 'skill' as const, collection: 'synthetic', skill: 'demo-skill' };
const file = (path: string, content: string): ObservationEntry => ({
    path,
    type: 'file',
    mode: 0o644,
    size: Buffer.byteLength(content),
    sha256: bytesDigest(content),
});

/** Complete inert teaching inputs; their validation receipts are illustrative assertions. */
export class SkillBumpExampleConfiguration {
    static examples() {
        return (['patch', 'minor', 'major', 'undetermined'] as const).map((name) => ({
            name,
            synthetic: true,
            warning:
                'Illustrative review and validation assertions; never reuse them as evidence for a real package.',
            request: this.request(name),
        }));
    }

    static request(kind: 'patch' | 'minor' | 'major' | 'undetermined') {
        const validator = new SkillBumpReportValidator();
        const initial = [
            file('SKILL.md', '# Demonstrate a skill\n\nReturn an example.\n'),
            { path: 'references', type: 'directory' as const, mode: 0o755 },
            file('references/usage.md', '# Example\n\nRead the selected skill.\n'),
        ];
        const changed = initial.map((entry) => ({ ...entry }));
        if (kind === 'patch' || kind === 'undetermined')
            changed[2] = file(
                'references/usage.md',
                '# Example\n\nRead the selected skill and its boundary.\n',
            );
        else
            changed[0] = file(
                'SKILL.md',
                kind === 'minor'
                    ? '# Demonstrate a skill\n\nReturn an example with an optional format.\n'
                    : '# Demonstrate a skill\n\nReturn only the new output.\n',
            );
        const contracts = (entries: ObservationEntry[], after: boolean): ObservationContract[] => {
            const definitions = [{ path: 'SKILL.md', sha256: entries[0].sha256! }];
            const result: ObservationContract[] = [
                {
                    id: 'demonstrate',
                    kind: 'capability',
                    required: true,
                    signature_sha256: bytesDigest('demonstrate-v1'),
                    files: definitions,
                },
                {
                    id: 'example-output',
                    kind: 'output',
                    required: true,
                    signature_sha256: bytesDigest('output-v1'),
                    files: definitions,
                },
            ];
            if (after && kind === 'minor')
                result.push({
                    id: 'format',
                    kind: 'input',
                    required: false,
                    signature_sha256: bytesDigest('optional-format-v1'),
                    files: definitions,
                });
            if (after && kind === 'major') result.pop();
            return result;
        };
        const observation = (entries: ObservationEntry[], after: boolean) => {
            const inventory = validator.inventory({ root_mode: 0o755, entries });
            const content_identity = validator.contentIdentity(subject, inventory);
            return validator.pin({
                schema_version: 1,
                subject,
                source,
                inventory,
                content_identity,
                snapshot_tree_sha256: bumpDigest(inventory.entries),
                contracts: { coverage: 'complete', entries: contracts(entries, after) },
                validation: validationKinds.map((check) => ({
                    kind: check,
                    status: 'passed',
                    content_sha256: content_identity.sha256,
                    evidence_sha256: bytesDigest(`synthetic-${check}-${content_identity.sha256}`),
                })),
            });
        };
        const before = observation(initial, false),
            after = observation(changed, true);
        const reason: ReviewReason =
            kind === 'major'
                ? 'contract_removed'
                : kind === 'minor'
                  ? 'compatible_addition'
                  : 'documentation_only';
        const contractId = kind === 'major' ? 'example-output' : 'format';
        return {
            schema_version: 1,
            before,
            after,
            assessment:
                kind === 'undetermined'
                    ? null
                    : {
                          before_sha256: before.sha256,
                          after_sha256: after.sha256,
                          coverage: 'complete',
                          files: [
                              {
                                  path: kind === 'patch' ? 'references/usage.md' : 'SKILL.md',
                                  reason,
                                  contracts: kind === 'patch' ? [] : [contractId],
                                  evidence_sha256: bytesDigest(`synthetic-${reason}-review`),
                              },
                          ],
                          contracts:
                              kind === 'patch'
                                  ? []
                                  : [
                                        {
                                            id: contractId,
                                            reason,
                                            evidence_sha256: bytesDigest(
                                                `synthetic-${contractId}-review`,
                                            ),
                                        },
                                    ],
                          provenance: null,
                      },
        };
    }
}
