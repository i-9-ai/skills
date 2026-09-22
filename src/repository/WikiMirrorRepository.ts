import fs from 'node:fs';
import path from 'node:path';
import { WikiLinkService } from '../service/WikiLinkService.ts';

/** Update only copied Markdown pages in the workflow-selected Wiki directory. */
export class WikiMirrorRepository {
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
