// SPDX-License-Identifier: Apache-2.0
import { lstatSync, readlinkSync } from 'node:fs';
import { devNull } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as skillTools from '../../.agents/skills/skill-creator/scripts/skill_tools.mjs';
import { CollectionValidationError, REPOSITORY_ALIASES } from '../domain/collection-policy.mjs';

export const LIMITS = skillTools.LIMITS;

export class CollectionFilesystem extends skillTools.SafeRoot {
  checkAlias(relative, target) {
    const before = this.inspect(relative, { allowSymlinkLeaf: true });
    if (!before.info.isSymbolicLink()) {
      throw new CollectionValidationError(`repository alias must be a symlink: ${relative}`);
    }
    if (readlinkSync(before.absolute) !== target) {
      throw new CollectionValidationError(`unexpected repository alias target: ${relative}`);
    }
    const after = this.inspect(relative, { allowSymlinkLeaf: true });
    if (before.info.dev !== after.info.dev || before.info.ino !== after.info.ino) {
      throw new CollectionValidationError(`repository alias changed during inspection: ${relative}`);
    }
    const canonical = skillTools.localLinkPath(relative, target);
    if (canonical === null) throw new CollectionValidationError('repository alias must name a local target');
    super.info(canonical);
    return canonical;
  }

  info(relative) {
    for (const [alias, target] of Object.entries(REPOSITORY_ALIASES)) {
      if (relative === alias || relative.startsWith(`${alias}/`)) {
        const canonical = this.checkAlias(alias, target);
        relative = canonical + relative.slice(alias.length);
        break;
      }
    }
    return super.info(relative);
  }

  readJson(relative) {
    return skillTools.strictJson(this.readBytes(relative, LIMITS.jsonBytes));
  }

  validatePackage(relative) {
    const result = skillTools.validateSkill(join(this.path, relative));
    const metadata = skillTools.parseFrontmatter(this.readText(`${relative}/SKILL.md`));
    skillTools.validateModelMetadata(metadata.metadata ?? {}, { required: true });
    return result;
  }

  checkMarkdown(relative, text) {
    return skillTools.checkMarkdown(this, relative, text);
  }

  validateExampleRun(relative) {
    return skillTools.validateRun(join(this.path, relative));
  }
}

export function rejectTrackedScratch(root) {
  try { lstatSync(join(root, '.git')); } catch (error) {
    if (error.code === 'ENOENT') return; // Exported trees have no publication index to inspect.
    throw error;
  }
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE']) delete env[key];
  const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', root,
    'ls-files', '-z', '--', '.work', 'tmp'], {
    env, stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000, maxBuffer: 1, windowsHide: true,
  });
  // Any output is sufficient; never decode, echo, or inspect the scratch filenames.
  if (result.stdout?.length || result.error?.code === 'ENOBUFS') {
    throw new CollectionValidationError('root .work/ and tmp/ scratch must not be tracked; remove them from the publication index');
  }
  if (result.error?.code === 'ETIMEDOUT') {
    throw new CollectionValidationError('timed out inspecting the Git index for tracked scratch');
  }
  if (result.error || result.status !== 0) {
    throw new CollectionValidationError('cannot inspect the Git index for tracked scratch');
  }
}
