// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { initSkill } from '../../../.agents/skills/skill-authoring/scripts/skill_tools.mjs';
import { syncCatalog } from '../../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';
import { CollectionAuditService } from '../../../src/service/CollectionAuditService.ts';
import { CollectionRemediationService } from '../../../src/service/CollectionRemediationService.ts';

export const repository = fileURLToPath(new URL('../../../', import.meta.url));
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function inventory(root) {
    const result = [];
    function visit(filename, path = '') {
        const info = fs.lstatSync(filename);
        const record = { path, mode: info.mode & 0o777 };
        if (info.isSymbolicLink()) {
            result.push({ ...record, link: fs.readlinkSync(filename) });
            return;
        }
        if (info.isDirectory()) {
            result.push({ ...record, directory: true });
            for (const name of fs.readdirSync(filename).sort())
                visit(join(filename, name), path ? `${path}/${name}` : name);
            return;
        }
        if (!info.isFile()) {
            result.push({ ...record, special: true });
            return;
        }
        result.push({ ...record, sha256: digest(fs.readFileSync(filename)) });
    }
    visit(root);
    return result;
}

export function maintenanceFixture(t, { layout = 'repository', catalog = 'missing' } = {}) {
    const root = fs.realpathSync.native(fs.mkdtempSync(join(tmpdir(), 'i9 collection % & ')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const collection = join(root, 'selected');
    const skills = join(collection, layout === 'repository' ? '.agents/skills' : 'skills');
    fs.mkdirSync(skills, { recursive: true });
    const alpha = initSkill('alpha-skill', skills);
    const beta = initSkill('beta-skill', skills);
    fs.mkdirSync(join(alpha, 'references'));
    fs.writeFileSync(
        join(alpha, 'references/example.md'),
        '# Ordinary example\n\nUseful UTF-8: ação.\n',
    );
    fs.appendFileSync(join(alpha, 'SKILL.md'), '\n[Example](references/example.md)\n');
    const catalogFile = join(collection, 'skills-catalog.json');
    if (catalog !== 'missing') {
        syncCatalog(collection, { layout });
        if (catalog === 'stale') fs.appendFileSync(catalogFile, '\n');
    }
    const selection = { collection, layout };
    const home = join(root, 'home');
    fs.mkdirSync(home);
    const store = join(root, 'recovery');
    const audit = () => new CollectionAuditService().audit(selection);
    const plan = () => new CollectionRemediationService().plan(selection, audit());
    const environment = {
        PATH: dirname(process.execPath),
        HOME: home,
        USERPROFILE: home,
        XDG_CONFIG_HOME: join(home, 'config'),
        XDG_CACHE_HOME: join(home, 'cache'),
        NODE_NO_WARNINGS: '1',
        NODE_DISABLE_COMPILE_CACHE: '1',
    };
    return {
        root,
        collection,
        skills,
        alpha,
        beta,
        selection,
        catalogFile,
        home,
        store,
        audit,
        plan,
        environment,
    };
}
