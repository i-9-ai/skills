import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

class TrustedPublishError extends Error {}

function versionAtLeast(value, minimum) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(value);
    if (!match) return false;
    const parts = match.slice(1).map(Number);
    for (let index = 0; index < minimum.length; index += 1) {
        if (parts[index] !== minimum[index]) return parts[index] > minimum[index];
    }
    return true;
}

export function verifyTrustedPublish({ pkg, env, nodeVersion, npmVersion }) {
    if (!versionAtLeast(nodeVersion, [24, 0, 0]) || !versionAtLeast(npmVersion, [11, 5, 1])) {
        throw new TrustedPublishError(
            'Trusted publication requires repository Node 24+ and npm 11.5.1+.',
        );
    }
    if (
        pkg.name !== '@i-9.ai/skills' ||
        pkg.private !== false ||
        pkg.repository?.url !== 'git+https://github.com/i-9-ai/skills.git' ||
        pkg.publishConfig?.registry !== 'https://registry.npmjs.org/' ||
        pkg.publishConfig?.access !== 'public'
    ) {
        throw new TrustedPublishError(
            'The public publication manifest does not match the trusted repository and registry.',
        );
    }
    if (
        env.GITHUB_ACTIONS !== 'true' ||
        env.GITHUB_REPOSITORY !== 'i-9-ai/skills' ||
        env.GITHUB_REF !== 'refs/heads/main' ||
        env.GITHUB_WORKFLOW_REF !== 'i-9-ai/skills/.github/workflows/release.yml@refs/heads/main'
    ) {
        throw new TrustedPublishError(
            'The publication job does not match the intended default-branch workflow identity.',
        );
    }
    if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
        throw new TrustedPublishError(
            'The publication job requires job-scoped id-token: write permission.',
        );
    }
    if (env.NPM_TOKEN || env.NODE_AUTH_TOKEN) {
        throw new TrustedPublishError(
            'Stored publication-token fallback is not part of this workflow.',
        );
    }
    return {
        node: nodeVersion,
        npm: npmVersion,
        publisher: 'i-9-ai/skills/release.yml',
        oidc_environment: true,
        server_binding_verified: false,
    };
}

export function main() {
    const npm = spawnSync('npm', ['--version'], {
        encoding: 'utf8',
        maxBuffer: 1024,
        timeout: 10000,
    });
    if (npm.error || npm.status !== 0)
        throw new TrustedPublishError('The npm runtime version could not be verified.');
    return verifyTrustedPublish({
        pkg: JSON.parse(readFileSync('package.json', 'utf8')),
        env: process.env,
        nodeVersion: process.versions.node,
        npmVersion: npm.stdout.trim(),
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        console.log(JSON.stringify(main()));
    } catch (error) {
        // Diagnostics are fixed messages; no environment value or credential is logged.
        console.error(
            error instanceof TrustedPublishError
                ? error.message
                : 'Publication prerequisite input could not be read.',
        );
        process.exitCode = 1;
    }
}
