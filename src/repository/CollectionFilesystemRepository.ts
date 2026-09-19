// SPDX-License-Identifier: Apache-2.0
import type { Stats } from 'node:fs';
import { lstatSync, readlinkSync } from 'node:fs';
import { devNull } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as skillTools from '../../.agents/skills/skill-authoring/scripts/skill_tools.mjs';
import { REPOSITORY_ALIASES } from '../validator/CollectionValidator.ts';
import { CollectionValidationError } from '../validator/CollectionValidationError.ts';

export const LIMITS = skillTools.LIMITS;

export class CollectionFilesystemRepository extends skillTools.SafeRoot {
    /** The package JS helper accepts numeric bounds; inference narrows its default literal. */
    override readBytes(relative: string, limit: number = LIMITS.textBytes): Buffer<ArrayBuffer> {
        const read = super.readBytes as (relative: string, limit: number) => Buffer<ArrayBuffer>;
        return read.call(this, relative, limit);
    }

    /** Keep the typed collection boundary separate from the portable package helper. */
    override inventory(
        options: {
            ignoredRootNames?: readonly string[];
            allowedSymlinks?: Readonly<Record<string, string>>;
        } = {},
    ): Array<[string, Stats]> {
        const inventory = super.inventory as (input: typeof options) => Array<[string, Stats]>;
        return inventory.call(this, options);
    }

    checkAlias(relative: string, target: string) {
        const before = this.inspect(relative, { allowSymlinkLeaf: true });
        if (!before.info?.isSymbolicLink()) {
            throw new CollectionValidationError(`repository alias must be a symlink: ${relative}`);
        }
        if (readlinkSync(before.absolute) !== target) {
            throw new CollectionValidationError(`unexpected repository alias target: ${relative}`);
        }
        const after = this.inspect(relative, { allowSymlinkLeaf: true });
        if (
            !after.info ||
            before.info.dev !== after.info.dev ||
            before.info.ino !== after.info.ino
        ) {
            throw new CollectionValidationError(
                `repository alias changed during inspection: ${relative}`,
            );
        }
        const canonical = skillTools.localLinkPath(relative, target);
        if (canonical === null)
            throw new CollectionValidationError('repository alias must name a local target');
        super.info(canonical);
        return canonical;
    }

    info(relative: string) {
        for (const [alias, target] of Object.entries(REPOSITORY_ALIASES)) {
            if (relative === alias || relative.startsWith(`${alias}/`)) {
                const canonical = this.checkAlias(alias, target);
                relative = canonical + relative.slice(alias.length);
                break;
            }
        }
        return super.info(relative);
    }

    readJson(relative: string) {
        return skillTools.strictJson(this.readBytes(relative, LIMITS.jsonBytes));
    }

    validatePackage(relative: string) {
        return skillTools.validateSkill(join(this.path, relative));
    }

    checkMarkdown(relative: string, text: string) {
        return skillTools.checkMarkdown(this, relative, text);
    }

    checkHtml(relative: string, text: string) {
        let count = 0;
        for (const [line, target] of skillTools.htmlLinks(text)) {
            try {
                const local = skillTools.localLinkPath(relative, target);
                if (local !== null) {
                    super.info(local);
                    count += 1;
                }
            } catch (error) {
                throw new CollectionValidationError(
                    `${relative}:${line}: invalid local link (${error instanceof Error ? error.message : 'inspection failed'})`,
                );
            }
        }
        return count;
    }

    validateExampleRun(relative: string) {
        return skillTools.validateRun(join(this.path, relative));
    }
    rejectTrackedScratch() {
        try {
            lstatSync(join(this.path, '.git'));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; // Exported trees have no publication index to inspect.
            throw error;
        }
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: devNull,
        };
        for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE'])
            delete env[key];
        const result = spawnSync(
            'git',
            [
                '--no-optional-locks',
                '-c',
                'core.fsmonitor=false',
                '-C',
                this.path,
                'ls-files',
                '-z',
                '--',
                '.work',
                'tmp',
                'node_modules',
            ],
            {
                env,
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 10_000,
                maxBuffer: 1,
                windowsHide: true,
            },
        );
        // Any output is sufficient; never decode, echo, or inspect the scratch filenames.
        if (
            result.stdout?.length ||
            (result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOBUFS'
        ) {
            throw new CollectionValidationError(
                'root .work/, tmp/, and node_modules/ directories must not be tracked; remove them from the publication index',
            );
        }
        if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT') {
            throw new CollectionValidationError(
                'timed out inspecting the Git index for tracked scratch',
            );
        }
        if (result.error || result.status !== 0) {
            throw new CollectionValidationError('cannot inspect the Git index for tracked scratch');
        }
    }
}
