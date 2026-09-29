// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { SkillOnboardingConfiguration } from '../../../src/config/SkillOnboardingConfiguration.ts';
import { SkillBumpReportValidator } from '../../../src/validator/SkillBumpReportValidator.ts';

export const repository = fileURLToPath(new URL('../../../', import.meta.url));
export const validator = new SkillBumpReportValidator();
export const reversed = (value) =>
    Array.isArray(value)
        ? [...value].reverse().map(reversed)
        : value && typeof value === 'object'
          ? Object.fromEntries(
                Object.entries(value)
                    .reverse()
                    .map(([key, item]) => [key, reversed(item)]),
            )
          : value;
export function repin(request, side) {
    request[side] = validator.pin(request[side].observation);
    if (request.assessment) request.assessment[`${side}_sha256`] = request[side].sha256;
    return request;
}
export function bumpFixture(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-bump-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    const environment = {
        PATH: path.dirname(process.execPath) + ':/usr/bin:/bin',
        HOME: home,
        USERPROFILE: home,
        TMPDIR: root,
        NODE_DISABLE_COMPILE_CACHE: '1',
        NODE_NO_WARNINGS: '1',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        npm_config_offline: 'true',
        npm_config_cache: path.join(root, 'npm-cache'),
    };
    for (const file of SkillOnboardingConfiguration.fixture().files) {
        const target = path.join(root, file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.content);
    }
    const run = (args, input, installed = repository) => {
        const result = spawnSync(
            process.execPath,
            [path.join(installed, 'bin/index.mjs'), ...args],
            {
                cwd: root,
                env: environment,
                encoding: 'utf8',
                input,
                timeout: 15000,
                maxBuffer: 4 * 1024 * 1024,
            },
        );
        assert.equal(result.status, 0, result.stderr);
        return JSON.parse(result.stdout);
    };
    const capture = (name, { packageScope = false } = {}) => {
        const snapshot = path.join(root, 'snapshots', name);
        const result = spawnSync(
            process.execPath,
            [
                path.join(repository, '.agents/skills/skills-snapshot/scripts/skills_snapshot.mjs'),
                'create',
                '--source',
                path.join(root, 'collection'),
                '--store',
                path.join(root, 'snapshots'),
                '--scope',
                packageScope ? 'package' : 'collection',
                '--name',
                name,
                ...(packageScope ? ['--package', '.agents/skills/demo-skill'] : []),
            ],
            { cwd: root, env: environment, encoding: 'utf8', timeout: 15000 },
        );
        assert.equal(result.status, 0, result.stderr);
        return snapshot;
    };
    return {
        root,
        home,
        environment,
        run,
        capture,
        subject: JSON.parse(fs.readFileSync(path.join(root, 'subject.json'))),
    };
}
export function treeBytes(root) {
    const files = [];
    function visit(directory, prefix = '') {
        for (const name of fs.readdirSync(directory).sort()) {
            const relative = prefix ? `${prefix}/${name}` : name,
                file = path.join(directory, name),
                info = fs.lstatSync(file);
            if (info.isDirectory()) visit(file, relative);
            else if (info.isSymbolicLink()) files.push([relative, 'link', fs.readlinkSync(file)]);
            else files.push([relative, info.mode & 0o777, fs.readFileSync(file).toString('hex')]);
        }
    }
    visit(root);
    return files;
}
