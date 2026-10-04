// SPDX-License-Identifier: Apache-2.0
// Filesystem/process adapters for the external official tool used by CI.
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OfficialRequirements } from '../validator/OfficialValidator.ts';
import { spawnSync } from 'node:child_process';
import { strictJson } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';
import { initSkill } from '../../.agents/skills/skill-authoring/scripts/skill_tools.mjs';

export interface OfficialPackage {
    readonly name: string;
    readonly path: string;
}

export type OfficialProcessSignal =
    | 'SIGTERM'
    | 'SIGKILL'
    | 'SIGINT'
    | 'SIGHUP'
    | 'SIGQUIT'
    | 'SIGABRT'
    | 'SIGSEGV'
    | 'SIGPIPE'
    | 'SIGILL'
    | 'SIGBUS'
    | 'SIGFPE'
    | 'SIGBREAK'
    | 'other';

export interface OfficialProcessObservation {
    readonly status: 'completed' | 'timeout' | 'unavailable' | 'interrupted' | 'execution_error';
    readonly exit_code: number | null;
    readonly signal: OfficialProcessSignal | null;
}

export interface OfficialVersionObservation {
    readonly state: 'verified' | 'version_unavailable' | 'version_mismatch';
    readonly observed_version: string | null;
    readonly process: OfficialProcessObservation;
}

/** Internal synchronous hooks around observed processes, excluding the generated scaffold. */
export interface OfficialValidatorCallbacks {
    onVersion?: (observation: OfficialVersionObservation) => void;
    beforeValidate?: (skill: OfficialPackage) => void;
    afterValidate?: (skill: OfficialPackage, process: OfficialProcessObservation) => void;
}

/** Owns official-tool filesystem discovery and shell-free process execution. */
export class OfficialValidatorProcessRepository {
    readOfficialConfiguration(root: string): unknown {
        return strictJson(readFileSync(join(root, 'package.json'))).config?.officialSkillValidator;
    }

    installOfficialValidator(
        root: string,
        requirements: OfficialRequirements,
        execute = spawnSync,
    ) {
        const python = join(root, '.work', 'validation-env', 'bin', 'python');
        const run = (args: string[]) => {
            const result = execute(python, args, {
                cwd: root,
                shell: false,
                stdio: 'inherit',
                timeout: 120_000,
            });
            if (result.error || result.status !== 0) {
                throw new Error('Official validator setup failed; later phases were not run.');
            }
        };
        run([
            '-I',
            '-c',
            'import sys; sys.exit(0 if sys.prefix != sys.base_prefix and sys.version_info >= (3, 11) else 1)',
        ]);
        const temporary = mkdtempSync(join(tmpdir(), 'i9-validation-install-'));
        try {
            for (const [index, phase] of requirements.phases.entries()) {
                const requirement = join(temporary, `phase-${index}.txt`);
                writeFileSync(requirement, phase.content, { flag: 'wx', mode: 0o600 });
                run([
                    '-I',
                    '-m',
                    'pip',
                    '--isolated',
                    'install',
                    '--require-hashes',
                    ...phase.flags,
                    '-r',
                    requirement,
                ]);
            }
        } finally {
            rmSync(temporary, { recursive: true, force: true });
        }
    }

    /** Run the stricter collection check first, on the same stable checkout. */
    canonicalSkills(root: string) {
        const container = join(root, '.agents', 'skills');
        for (const directory of [join(root, '.agents'), container]) {
            const info = lstatSync(directory);
            if (!info.isDirectory() || info.isSymbolicLink()) {
                throw new Error('Canonical skill directories must be real directories.');
            }
        }
        const packages = readdirSync(container, { withFileTypes: true })
            .filter((entry) => {
                if (entry.isSymbolicLink())
                    throw new Error('Canonical packages must not be symlinks.');
                return entry.isDirectory();
            })
            .map((entry) => entry.name)
            .sort();
        if (!packages.length) throw new Error('No canonical skills were found.');
        for (const name of packages) {
            if (
                !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) ||
                name.trim() !== name ||
                name.length > 64
            ) {
                throw new Error('Invalid skill directory name.');
            }
            const entrypoint = lstatSync(join(container, name, 'SKILL.md'));
            if (!entrypoint.isFile() || entrypoint.isSymbolicLink()) {
                throw new Error('A skill entrypoint must be a regular file.');
            }
        }
        return packages.map((name) => ({ name, path: join(container, name) }));
    }

    runOfficialValidator(
        root: string,
        packages: readonly OfficialPackage[],
        expectedVersion: string,
        execute = spawnSync,
        callbacks: OfficialValidatorCallbacks = {},
    ) {
        const executable = join(root, '.work', 'validation-env', 'bin', 'skills-ref');
        const options = {
            cwd: root,
            shell: false,
            encoding: 'utf8' as const,
            timeout: 30_000,
            maxBuffer: 1_048_576,
        };
        const canonical = packages.map((skill) =>
            Object.freeze({ name: skill.name, path: skill.path }),
        );
        const identityError = new Error(
            'Official validator unavailable or version does not match the reviewed source.',
        );
        let identity;
        try {
            identity = execute(executable, ['--version'], options);
        } catch (error) {
            try {
                callbacks.onVersion?.(
                    Object.freeze({
                        state: 'version_unavailable',
                        observed_version: null,
                        process: this.observedProcess({ error }),
                    }),
                );
            } finally {
                throw identityError;
            }
        }
        const process = this.observedProcess(identity);
        const output = identity.stdout?.trim() ?? '';
        const observedVersion =
            /^skills-ref, version ([0-9]+(?:\.[0-9]+)*(?:\.post[0-9]+)?)$/.exec(output)?.[1] ??
            null;
        const state =
            process.status !== 'completed' || process.exit_code !== 0
                ? 'version_unavailable'
                : output !== 'skills-ref, version ' + expectedVersion
                  ? 'version_mismatch'
                  : 'verified';
        const versionObservation = Object.freeze({
            state,
            observed_version:
                observedVersion && observedVersion.length <= 64 ? observedVersion : null,
            process,
        });
        if (state !== 'verified') {
            try {
                callbacks.onVersion?.(versionObservation);
            } finally {
                throw identityError;
            }
        }
        callbacks.onVersion?.(versionObservation);
        const temporary = mkdtempSync(join(tmpdir(), 'i9-validation-scaffold-'));
        try {
            const trial = initSkill('official-scaffold-trial', temporary);
            return [...canonical, { name: 'generated-scaffold', path: trial }].map(
                (skill, index) => {
                    const observed = index < canonical.length;
                    if (observed) callbacks.beforeValidate?.(skill);
                    let result;
                    try {
                        result = execute(executable, ['validate', skill.path], options);
                    } catch (error) {
                        if (observed)
                            callbacks.afterValidate?.(skill, this.observedProcess({ error }));
                        throw error;
                    }
                    const process = this.observedProcess(result);
                    if (observed) callbacks.afterValidate?.(skill, process);
                    return {
                        name: skill.name,
                        passed: process.status === 'completed' && process.exit_code === 0,
                        diagnostic: result.error
                            ? 'Official validation execution failed.'
                            : `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
                    };
                },
            );
        } finally {
            rmSync(temporary, { recursive: true, force: true });
        }
    }

    private observedProcess(result: {
        status?: number | null;
        signal?: string | null;
        error?: unknown;
    }): OfficialProcessObservation {
        const knownSignals: readonly string[] = [
            'SIGTERM',
            'SIGKILL',
            'SIGINT',
            'SIGHUP',
            'SIGQUIT',
            'SIGABRT',
            'SIGSEGV',
            'SIGPIPE',
            'SIGILL',
            'SIGBUS',
            'SIGFPE',
            'SIGBREAK',
        ];
        const signal: OfficialProcessSignal | null =
            result.signal == null
                ? null
                : knownSignals.includes(result.signal)
                  ? (result.signal as OfficialProcessSignal)
                  : 'other';
        const code =
            result.error && typeof result.error === 'object' && 'code' in result.error
                ? result.error.code
                : null;
        const exitCode =
            Number.isSafeInteger(result.status) && (result.status as number) >= 0
                ? (result.status as number)
                : null;
        const status =
            code === 'ETIMEDOUT'
                ? 'timeout'
                : code === 'ENOENT' || code === 'EACCES'
                  ? 'unavailable'
                  : code === 'ABORT_ERR'
                    ? 'interrupted'
                    : result.error
                      ? 'execution_error'
                      : signal !== null
                        ? 'interrupted'
                        : exitCode === null
                          ? 'execution_error'
                          : 'completed';
        return Object.freeze({
            status,
            exit_code: status === 'unavailable' ? null : exitCode,
            signal: status === 'unavailable' ? null : signal,
        });
    }
}
