import { repository, documentation } from './content.mjs';

const support = { text: 'GitHub issue tracker', href: repository + '/issues' };
const license = { text: 'Apache License 2.0', href: repository + '/blob/main/LICENSE' };

export const policies = {
    privacy: {
        title: 'Privacy policy',
        description: 'How I-9 Skills handles local observations, website visits and support.',
        introduction:
            'I-9 Skills is an open-source skill-management toolkit and collection published by I-9 AI. This page describes the current product and website. Updated October 2, 2026.',
        sections: [
            {
                title: 'Local skill observations',
                paragraphs: [
                    [
                        'Optional local telemetry records metadata such as event types, timestamps, logical skill and collection identifiers, revisions, opaque session and event identifiers, and explicitly supplied lifecycle outcomes. The observation store does not record prompts, skill contents, tool response bodies or command text.',
                    ],
                    [
                        'The default SQLite store is ',
                        { code: '~/.agents/skills-usage.db' },
                        '. You may select a different local path. Observations remain on your machine; I-9 Skills does not transmit this store to an I-9 AI server or operate a central telemetry collection service.',
                    ],
                    [
                        'You control whether optional hooks are enabled and how long local evidence is retained. Disabling observations preserves the existing store. To remove evidence, stop its writers and manage the selected database and any SQLite sidecar files yourself. There is no automatic retention pruning. See the ',
                        {
                            text: 'local telemetry documentation',
                            href: documentation + '/Skill-Telemetry',
                        },
                        ' for storage configuration and inspection.',
                    ],
                ],
            },
            {
                title: 'Your agent and connected services',
                paragraphs: [
                    [
                        'Your chosen agent provider processes the conversations, files and tool results that you make available to it under its own settings and policies. This includes local observations if you ask an agent to read or summarize them. Installing skills does not replace those provider rules.',
                    ],
                    [
                        'Package installation and updates contact the distribution services you select, such as GitHub or npm. Those services handle network and account information under their own policies.',
                    ],
                ],
            },
            {
                title: 'This public website',
                paragraphs: [
                    [
                        'The site has no added analytics, tracking scripts, accounts or data-entry forms. Its catalog, privacy page and terms are readable without JavaScript. Browser-language suggestions run locally without a stored preference or automatic redirect.',
                    ],
                    [
                        'Public builds of this site are hosted on GitHub Pages and Cloudflare Pages, including previews. Hosting providers may process network information and request logs under their own policies: ',
                        {
                            text: 'GitHub Privacy Statement',
                            href: 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
                        },
                        ' and ',
                        {
                            text: 'Cloudflare Privacy Policy',
                            href: 'https://www.cloudflare.com/privacypolicy/',
                        },
                        '.',
                    ],
                ],
            },
            {
                title: 'Support and questions',
                paragraphs: [
                    [
                        'Contact the maintainers through the ',
                        support,
                        '. Issues and replies are public and stored by GitHub. Share only the information needed to describe a problem; do not post credentials, private prompts or personal records.',
                    ],
                ],
            },
        ],
    },
    terms: {
        title: 'Terms of use',
        description: 'License, experimental status and service boundaries for I-9 Skills.',
        introduction:
            'I-9 Skills is published by I-9 AI as an open-source skill-management toolkit and collection. Updated October 2, 2026.',
        sections: [
            {
                title: 'Open-source license',
                paragraphs: [
                    [
                        'Use, modification and redistribution of this project are governed by the ',
                        license,
                        '. The license contains the applicable permissions, conditions, warranty disclaimer and liability limitations. This page does not replace the license.',
                    ],
                    [
                        'Retain required license, copyright, attribution and notice files when redistributing project resources. Bundled third-party resources and dependencies may have their own license terms and notices.',
                    ],
                ],
            },
            {
                title: 'Experimental software',
                paragraphs: [
                    [
                        'The project is experimental. Its documentation and tests describe particular interfaces and observed behavior; they do not guarantee universal agent compatibility, performance, security or suitability for a particular purpose.',
                    ],
                    [
                        'Review generated work and configuration changes before using them. You select the agent, installation scope and optional integrations, and control your local files and evidence.',
                    ],
                ],
            },
            {
                title: 'Other providers',
                paragraphs: [
                    [
                        'Agent hosts, marketplaces, package registries and hosting services are separate providers. Their terms, privacy policies, account requirements and usage limits apply to their services. This project does not imply their endorsement.',
                    ],
                ],
            },
            {
                title: 'Support',
                paragraphs: [
                    [
                        'Report questions or problems through the ',
                        support,
                        '. The issue tracker is public. Support availability and a particular resolution are not guaranteed.',
                    ],
                ],
            },
        ],
    },
};
