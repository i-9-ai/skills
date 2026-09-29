import path from 'node:path';
import { markdownLinkRanges } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';

/** Rewrite source-repository links while preserving Markdown syntax and examples. */
export class WikiLinkService {
    rewrite(body: string, sourcePath: string, repository: string): string {
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
            throw new Error('Wiki repository must be an owner/name identifier');
        }

        const parts: string[] = [];
        let cursor = 0;
        for (const link of markdownLinkRanges(body)) {
            if (!link.target.startsWith('../')) continue;

            const suffixIndex = link.target.search(/[?#]/);
            const destination =
                suffixIndex === -1 ? link.target : link.target.slice(0, suffixIndex);
            const suffix = suffixIndex === -1 ? '' : link.target.slice(suffixIndex);
            const resolved = path.posix.normalize(
                path.posix.join(path.posix.dirname(sourcePath), destination),
            );
            if (
                resolved === '..' ||
                resolved.startsWith('../') ||
                path.posix.isAbsolute(resolved)
            ) {
                throw new Error('Wiki link escapes the repository');
            }

            const url = `https://github.com/${repository}/blob/main/${resolved}${suffix}`;
            parts.push(body.slice(cursor, link.start), url);
            cursor = link.end;
        }
        parts.push(body.slice(cursor));
        return parts.join('');
    }
}
