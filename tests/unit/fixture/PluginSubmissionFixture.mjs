// SPDX-License-Identifier: Apache-2.0
import {
    cpSync,
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
import { syncCatalog } from '../../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
export function submissionFixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-submission-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const source = join(root, 'source');
    mkdirSync(join(source, '.agents/skills'), { recursive: true });
    cpSync(
        join(repository, '.agents/skills/skill-design'),
        join(source, '.agents/skills/skill-design'),
        { recursive: true },
    );
    cpSync(join(repository, 'LICENSE'), join(source, 'LICENSE'));
    mkdirSync(join(source, '.codex-plugin'));
    const plugin = JSON.parse(readFileSync(join(repository, '.codex-plugin/plugin.json')));
    plugin.version = '1.2.3';
    writeFileSync(join(source, '.codex-plugin/plugin.json'), JSON.stringify(plugin));
    mkdirSync(join(source, 'assets'));
    cpSync(join(repository, 'assets/plugin-icon.png'), join(source, 'assets/plugin-icon.png'));
    writeFileSync(
        join(source, 'package.json'),
        JSON.stringify({
            name: '@i-9.ai/skills',
            version: '1.2.3',
            description: 'Synthetic meta-skill collection.',
            license: 'Apache-2.0',
            homepage: 'https://example.test/skills',
            repository: { type: 'git', url: 'git+https://example.test/skills.git' },
        }),
    );
    syncCatalog(source, { layout: 'repository' });
    for (const path of [
        'hooks/hooks.json',
        'hooks/codex.json',
        '.mcp.json',
        '.app.json',
        'mcp/local.json',
        'private/usage.db',
    ]) {
        mkdirSync(join(source, path, '..'), { recursive: true });
        writeFileSync(join(source, path), 'private-state-sentinel');
    }
    const environment = {
        ...process.env,
        HOME: join(root, 'home'),
        XDG_CONFIG_HOME: join(root, 'home/.config'),
        NODE_DISABLE_COMPILE_CACHE: '1',
    };
    mkdirSync(environment.HOME);
    return { root, source, output: join(root, 'i9-skills'), environment };
}
