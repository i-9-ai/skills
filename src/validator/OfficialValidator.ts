// SPDX-License-Identifier: Apache-2.0
// Pure policy: validate identity pins and derive a controlled external build.
const digest = /^[0-9a-f]{64}$/;
const version = /^[0-9]+(?:\.[0-9]+)*(?:\.post[0-9]+)?$/;
const fullMatch = (pattern: RegExp, value: unknown): value is string =>
    typeof value === 'string' && pattern.exec(value)?.[0] === value;

export interface OfficialRequirements {
    version: string;
    phases: Array<{ content: string; flags: string[] }>;
}

/** Derives installation requirements only from reviewed source and dependency pins. */
export class OfficialValidator {
    officialRequirements(input: unknown): OfficialRequirements {
        const config = input as {
            version?: unknown;
            source?: unknown;
            sha256?: unknown;
            wheels?: unknown;
        } | null;
        if (
            !config ||
            !fullMatch(version, config.version) ||
            !fullMatch(
                /^https:\/\/codeload\.github\.com\/agentskills\/agentskills\/tar\.gz\/[0-9a-f]{40}$/,
                config.source,
            ) ||
            !fullMatch(digest, config.sha256) ||
            !Array.isArray(config.wheels) ||
            config.wheels.length === 0 ||
            config.wheels.length > 64
        ) {
            throw new Error(
                'Official validator configuration requires a pinned upstream archive and hashed wheels.',
            );
        }
        const names = new Set();
        const wheels = config.wheels.map((input: unknown) => {
            const wheel = input as { name?: unknown; version?: unknown; sha256?: unknown } | null;
            if (
                !wheel ||
                !fullMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, wheel.name) ||
                !fullMatch(version, wheel.version) ||
                !fullMatch(digest, wheel.sha256) ||
                names.has(wheel.name)
            ) {
                throw new Error(
                    'Each official validator dependency needs a unique name, exact version, and SHA-256.',
                );
            }
            names.add(wheel.name);
            return `${wheel.name}==${wheel.version} --hash=sha256:${wheel.sha256}`;
        });
        return {
            version: config.version,
            phases: [
                { content: `${wheels.join('\n')}\n`, flags: ['--only-binary=:all:'] },
                {
                    content: `skills-ref @ ${config.source}#subdirectory=skills-ref --hash=sha256:${config.sha256}\n`,
                    flags: ['--no-deps', '--no-build-isolation'],
                },
            ],
        };
    }
}
