import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));
test('CLI previews, installs and uninstalls the actual bundle in a disposable global scope', (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-cli-install-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = join(root, 'home');
    mkdirSync(home);
    const state = join(home, '.agents');
    const cli = (args) =>
        spawnSync(process.execPath, [launcher, 'skills', ...args, '--strategy', 'skills'], {
            cwd: root,
            encoding: 'utf8',
            timeout: 30_000,
            env: { ...process.env, HOME: home, I9_AGENT_STATE_ROOT: state },
        });
    const run = (args) => {
        const result = cli(args);
        assert.equal(result.status, 0, result.stderr);
        return JSON.parse(result.stdout);
    };
    const preview = run(['install', '--global']);
    assert.ok(preview.additions.includes('skill-authoring'));
    assert.equal(preview.written, false);
    assert.equal(existsSync(state), false);
    const installed = run(['install', '--global', '--write']);
    assert.equal(installed.written, true);
    assert.equal(run(['install', '--global', '--write']).written, false);
    const status = run(['status', '--global']);
    assert.equal(status.installed, true);
    assert.equal(status.changing, false);
    assert.deepEqual(status.conflicts, []);
    assert.ok(
        readFileSync(join(state, 'skills/skill-authoring/SKILL.md'), 'utf8').includes(
            'Skill Authoring',
        ),
    );
    const database = join(state, 'skills-usage.db');
    writeFileSync(database, 'Inert caller evidence');
    assert.equal(cli(['status', '--global', '--write']).status, 2);
    assert.notEqual(cli(['install', '--global', '--project', root]).status, 0);
    assert.equal(run(['uninstall', '--global', '--write']).written, true);
    assert.equal(existsSync(join(state, 'skills/skill-authoring')), false);
    assert.equal(readFileSync(database, 'utf8'), 'Inert caller evidence');
    assert.equal(run(['uninstall', '--global', '--write']).written, false);
    assert.equal(run(['recover', '--global']).written, false);
});
