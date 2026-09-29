// SPDX-License-Identifier: Apache-2.0
import { SkillBumpExampleConfiguration } from './SkillBumpExampleConfiguration.ts';

const cli = ['node', '<installed-root>/bin/index.mjs'];
const snapshot = [
    'node',
    '<installed-root>/.agents/skills/skills-snapshot/scripts/skills_snapshot.mjs',
];
const selection = ['--collection', '<workspace>/collection', '--layout', 'repository'];
const skillContent =
    '---\nname: demo-skill\ndescription: Use to inspect a synthetic skill example and report its declared boundary.\nlicense: MIT\n---\n\n# Inspect a Skill Example\n\nRead the selected synthetic package and return its responsibility and boundary. Do not edit, install or publish anything.\n\nUse only for a requested inspection of a skill example. Read [the example](references/usage.md) when needed. Report missing input rather than inventing an outcome.\n';
const license =
    'MIT License\n\nCopyright (c) 2026 Synthetic Example\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n';

/** Versioned command data ships in compiled artifacts and never executes itself. */
export class SkillOnboardingConfiguration {
    static readonly version = 'onboarding-v1';
    static readonly sections = [
        {
            id: 'inspect',
            purpose:
                'Inspect one explicitly selected catalog and keep Git provenance separate from content digests.',
            commands: [{ argv: [...cli, 'catalog', 'inspect', ...selection], effect: 'read_only' }],
            limits: [
                'Catalog inspection validates the manifest format, not freshness, activation or compatibility.',
                'No cwd or home collection is selected implicitly. Record public source assertions in subject.json; a content hash is not a Git commit.',
            ],
        },
        {
            id: 'snapshot',
            purpose:
                'Capture and verify a caller-selected package or minimal collection before an authorized transformation.',
            commands: [
                {
                    argv: [
                        ...snapshot,
                        'create',
                        '--source',
                        '<workspace>/collection',
                        '--store',
                        '<workspace>/snapshots',
                        '--scope',
                        'collection',
                        '--name',
                        'before',
                    ],
                    effect: 'explicit_snapshot_write',
                },
                {
                    argv: [...snapshot, 'verify', '--snapshot', '<workspace>/snapshots/before'],
                    effect: 'read_only',
                },
                {
                    argv: [
                        ...cli,
                        'skills',
                        'observe',
                        '--snapshot',
                        '<workspace>/snapshots/before',
                        '--subject',
                        '<workspace>/subject.json',
                    ],
                    effect: 'read_only',
                    stdout_file: '<workspace>/before.json',
                },
            ],
            limits: [
                'Select public/non-sensitive content explicitly; snapshot stores stay outside collection and discovery roots.',
                'Snapshots retain full selected bytes. Ordinary restore does not restore external linked-target contents.',
                'Observation export supports schema-2 snapshots, at most 1,024 combined entries and 64 MiB of object reads; it does not capture or restore.',
            ],
        },
        {
            id: 'audit',
            purpose:
                'Record bounded package structure and catalog freshness evidence before proposing changes.',
            commands: [
                {
                    argv: [...cli, 'collection', 'audit', ...selection],
                    effect: 'read_only',
                    stdout_file: '<workspace>/audit.json',
                },
            ],
            limits: [
                'Local checks cover structure, metadata, declared licensing, local links and interfaces. They do not establish behavioral quality, semantic overlap, license compatibility, visual quality, upstream freshness or native host behavior.',
                'Incomplete inventories block catalog writes. Semantic findings remain explicit specialist handoffs.',
            ],
        },
        {
            id: 'plan',
            purpose:
                'Regenerate a proposal from the selected current audit and review supported operations and handoffs.',
            commands: [
                {
                    argv: [
                        ...cli,
                        'collection',
                        'plan',
                        ...selection,
                        '--audit',
                        '<workspace>/audit.json',
                    ],
                    effect: 'read_only',
                    stdout_file: '<workspace>/plan.json',
                },
                {
                    argv: [
                        ...cli,
                        'collection',
                        'evolve',
                        ...selection,
                        '--plan',
                        '<workspace>/plan.json',
                    ],
                    effect: 'read_only',
                },
            ],
            limits: [
                'Changed selected bytes invalidate old audit/plan evidence. Re-audit before continuing.',
                'The current implementation supports catalog synchronization only; it does not automatically repair skill semantics.',
            ],
        },
        {
            id: 'evolve',
            purpose:
                'Apply only the explicitly chosen supported plan after review, retaining verified recovery evidence.',
            commands: [
                {
                    argv: [
                        ...cli,
                        'collection',
                        'evolve',
                        ...selection,
                        '--plan',
                        '<workspace>/plan.json',
                        '--apply',
                        '--snapshot-store',
                        '<workspace>/recovery',
                    ],
                    effect: 'explicit_catalog_write',
                },
            ],
            limits: [
                '--apply is a separate explicit action. Without it, evolve is a preview.',
                'The result distinguishes applied content, rollback verification and receipt persistence. Preserve the returned recovery path.',
                'Installation, discovery, routing and MCP initialization never run this workflow.',
            ],
        },
        {
            id: 'verify',
            purpose:
                'Verify the result and retain exact-content validation evidence with honest unsupported checks.',
            commands: [
                { argv: [...cli, 'catalog', 'check', ...selection], effect: 'read_only' },
                { argv: [...cli, 'collection', 'audit', ...selection], effect: 'read_only' },
                {
                    argv: [
                        ...cli,
                        'repo',
                        'validate-official',
                        '--project',
                        '<prepared-repository>',
                    ],
                    effect: 'prepared_ci_only',
                },
                {
                    argv: [
                        ...snapshot,
                        'create',
                        '--source',
                        '<workspace>/collection',
                        '--store',
                        '<workspace>/snapshots',
                        '--scope',
                        'collection',
                        '--name',
                        'after',
                    ],
                    effect: 'explicit_snapshot_write',
                },
                {
                    argv: [
                        ...cli,
                        'skills',
                        'observe',
                        '--snapshot',
                        '<workspace>/snapshots/after',
                        '--subject',
                        '<workspace>/subject.json',
                    ],
                    effect: 'read_only',
                    stdout_file: '<workspace>/after.json',
                },
            ],
            limits: [
                'Official repository validation needs its prepared Python/validator environment and may install pinned dependencies. It is not part of the offline walkthrough.',
                'Run required behavioral, compatibility and security checks separately; no generic command here proves those outcomes.',
                'Review receipts bind to the exported content_identity. Export again with --evidence only after gathering actual checks and reviewed contract definitions.',
            ],
        },
        {
            id: 'bump',
            purpose:
                'Compare exact observation documents and explicit reviewed evidence before separate version/release work.',
            commands: [
                {
                    argv: [
                        ...cli,
                        'skills',
                        'report',
                        'bump',
                        '--file',
                        '<workspace>/comparison.json',
                        '--limit',
                        '20',
                    ],
                    effect: 'read_only',
                },
            ],
            limits: [
                'Create comparison.json as {schema_version:1,before:<before.json>,after:<after.json>,assessment:null}; missing review correctly returns undetermined.',
                'A justified recommendation requires complete file/contract coverage and reported passing candidate checks. The tool does not infer compatibility from hashes or rerun validation.',
                'Maximum request 768 KiB; pagination changes display only. No version, release, installation or database mutation occurs.',
            ],
        },
    ];

    static examples() {
        return SkillBumpExampleConfiguration.examples();
    }

    static fixture() {
        return {
            synthetic: true,
            instruction:
                'Materialize only in a new disposable caller directory. The catalog is deliberately stale to exercise audit, plan and catalog-only evolution.',
            files: [
                { path: 'collection/.agents/skills/demo-skill/SKILL.md', content: skillContent },
                { path: 'collection/.agents/skills/demo-skill/LICENSE', content: license },
                {
                    path: 'collection/.agents/skills/demo-skill/references/usage.md',
                    content:
                        '# Synthetic example\n\nReport the selected skill responsibility and its no-edit boundary.\n',
                },
                {
                    path: 'collection/skills-catalog.json',
                    content:
                        JSON.stringify(
                            {
                                schema_version: 1,
                                skills: [
                                    {
                                        name: 'demo-skill',
                                        path: '.agents/skills/demo-skill',
                                        description: 'Previous synthetic description.',
                                        tags: [],
                                    },
                                ],
                            },
                            null,
                            2,
                        ) + '\n',
                },
                {
                    path: 'subject.json',
                    content:
                        JSON.stringify(
                            {
                                subject: {
                                    scope: 'collection',
                                    collection: 'synthetic',
                                    skill: null,
                                },
                                source: {
                                    repository: null,
                                    source_ref: null,
                                    resolved_git_sha: null,
                                },
                            },
                            null,
                            2,
                        ) + '\n',
                },
            ],
        };
    }
}
