import fs from 'node:fs';
import path from 'node:path';
import { WikiLinkService } from '../service/WikiLinkService.ts';

/** Update only copied Markdown pages in the workflow-selected Wiki directory. */
export class WikiMirrorRepository {
    /** Mirror reviewed documentation without copying agent instructions or touching Wiki Git state. */
    synchronize(sourceDirectory: string, wikiDirectory: string, repository: string): void {
        const source = fs.realpathSync(sourceDirectory);
        const wiki = fs.realpathSync(wikiDirectory);
        if (
            source === wiki ||
            source.startsWith(wiki + path.sep) ||
            wiki.startsWith(source + path.sep)
        ) {
            throw new Error('Documentation and Wiki directories must be separate');
        }
        if (!fs.lstatSync(path.join(wiki, '.git')).isDirectory()) {
            throw new Error('The Wiki must be an initialized Git repository');
        }

        const directories: string[] = [];
        const files: string[] = [];
        const inspect = (relative: string): void => {
            for (const entry of fs.readdirSync(path.join(source, relative), {
                withFileTypes: true,
            })) {
                if (entry.name === '.git' || entry.name === 'AGENTS.md') continue;

                const child = path.join(relative, entry.name);
                if (entry.isSymbolicLink())
                    throw new Error('Documentation must not contain symbolic links');
                if (entry.isDirectory()) {
                    directories.push(child);
                    inspect(child);
                    continue;
                }
                if (!entry.isFile())
                    throw new Error('Documentation must contain regular files only');
                files.push(child);
            }
        };
        inspect('');
        if (!files.includes('Home.md')) throw new Error('Documentation must include Home.md');

        for (const entry of fs.readdirSync(wiki)) {
            if (entry === '.git') continue;
            fs.rmSync(path.join(wiki, entry), { recursive: true, force: true });
        }
        for (const directory of directories) fs.mkdirSync(path.join(wiki, directory));
        for (const file of files) fs.copyFileSync(path.join(source, file), path.join(wiki, file));

        this.rewrite(wiki, repository);
    }

    rewrite(directory: string, repository: string): void {
        const root = fs.realpathSync(directory);
        const service = new WikiLinkService();

        const visit = (relative: string): void => {
            for (const entry of fs.readdirSync(path.join(root, relative), {
                withFileTypes: true,
            })) {
                if (entry.name === '.git') continue;

                const child = path.join(relative, entry.name);
                if (entry.isSymbolicLink())
                    throw new Error('Wiki pages must not contain symbolic links');
                if (entry.isDirectory()) {
                    visit(child);
                    continue;
                }
                if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

                const filename = path.join(root, child);
                const body = fs.readFileSync(filename, 'utf8');
                fs.writeFileSync(
                    filename,
                    service.rewrite(body, `docs/${child.split(path.sep).join('/')}`, repository),
                );
            }
        };
        visit('');
    }
}
