// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncCatalog } from '../../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';

export const repository = fileURLToPath(new URL('../../../', import.meta.url));

export function write(root, file, content) {
    fs.mkdirSync(dirname(join(root, file)), { recursive: true });
    fs.writeFileSync(join(root, file), content);
}

export function digest(content) {
    return createHash('sha256').update(content).digest('hex');
}

export function snapshot(root) {
    return Object.fromEntries(
        fs
            .readdirSync(root, { recursive: true, withFileTypes: true })
            .map((entry) => {
                const filename = join(entry.parentPath, entry.name);
                const content = entry.isSymbolicLink()
                    ? `link:${fs.readlinkSync(filename)}`
                    : entry.isDirectory()
                      ? 'directory'
                      : digest(fs.readFileSync(filename));
                return [relative(root, filename), content];
            })
            .sort(([left], [right]) => left.localeCompare(right)),
    );
}

export function catalogFixture(t, { runtime = false } = {}) {
    const root = fs.realpathSync.native(fs.mkdtempSync(join(tmpdir(), 'i9-installed-catalog-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const installed = join(root, 'installed collection with spaces');
    const caller = join(root, 'unrelated caller');
    const home = join(root, 'synthetic home');
    const data = join(root, 'host state', 'selected plugin');
    for (const directory of [installed, caller, home]) fs.mkdirSync(directory);

    write(
        installed,
        'package.json',
        JSON.stringify({
            name: '@i-9-ai/skills',
            version: '9.8.7',
            type: 'module',
            repository: { type: 'git', url: 'git+https://github.com/i-9-ai/skills.git' },
        }) + '\n',
    );
    const skill = (name, description, tags = ['synthetic']) => {
        const resource = `.agents/skills/${name}/SKILL.md`;
        write(
            installed,
            resource,
            `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\nmetadata:\n  tags: ${JSON.stringify(tags.join(', '))}\n---\n# ${name}\n\nA complete synthetic procedure.\n`,
        );
        return join(installed, resource);
    };
    skill('alpha-guide', 'Match a literal [.*] query and preserve Markdown.', [
        'analysis',
        'catalog',
    ]);
    skill('beta-guide', 'Inspect synthetic catalog metadata.', ['catalog']);
    skill('gamma-guide', 'Explain an unrelated synthetic procedure.', ['workflow']);
    write(
        installed,
        '.agents/skills/alpha-guide/references/example.md',
        '# Reference example\n\nRead Unicode safely: ação, café.\n\n```sh\nexample --dry-run\n```\n',
    );
    write(
        installed,
        '.agents/skills/alpha-guide/references/nested/guide.md',
        '# Nested reference\n',
    );
    write(
        installed,
        '.agents/skills/alpha-guide/scripts/forbidden.mjs',
        `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(join(root, 'script-executed'))}, 'unexpected');\n`,
    );
    for (const directory of [caller, home]) {
        write(
            directory,
            '.agents/skills/decoy-guide/SKILL.md',
            '---\nname: decoy-guide\ndescription: Must never enter the installed collection.\n---\n# Decoy\n',
        );
    }
    if (runtime) {
        fs.cpSync(join(repository, 'src'), join(installed, 'src'), { recursive: true });
        for (const [name, resource] of [
            ['skill-authoring', 'scripts/lib'],
            ['skills-catalog', 'scripts'],
        ]) {
            const path = `.agents/skills/${name}/${resource}`;
            fs.cpSync(join(repository, path), join(installed, path), { recursive: true });
            skill(name, 'Provide a synthetic local runtime helper.');
        }
    }
    const sync = () => syncCatalog(installed, { layout: 'repository' });
    sync();
    const environment = {
        PATH: process.env.PATH,
        HOME: home,
        USERPROFILE: home,
        XDG_CONFIG_HOME: join(home, '.config'),
        I9_SKILLS_PROJECT_ROOT: caller,
        PLUGIN_ROOT: caller,
        CLAUDE_PLUGIN_ROOT: caller,
        NODE_DISABLE_COMPILE_CACHE: '1',
        NODE_NO_WARNINGS: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
    };
    return { root, installed, caller, home, data, environment, skill, sync };
}
