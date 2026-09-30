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
            if (/^(?:[A-Za-z][A-Za-z\d+.-]*:|\/|#|\?)/.test(link.target)) continue;

            const suffixIndex = link.target.search(/[?#]/);
            const destination =
                suffixIndex === -1 ? link.target : link.target.slice(0, suffixIndex);
            const suffix = suffixIndex === -1 ? '' : link.target.slice(suffixIndex);
            const resolved = path.posix.normalize(
                path.posix.join(path.posix.dirname(sourcePath), decodeURIComponent(destination)),
            );
            if (
                resolved === '..' ||
                resolved.startsWith('../') ||
                path.posix.isAbsolute(resolved)
            ) {
                throw new Error('Wiki link escapes the repository');
            }

            const isDocumentation = resolved.startsWith('docs/');
            const isPage = /\.md$/i.test(resolved);
            if (isDocumentation && !isPage) continue;

            const pageTitle = path.posix.basename(resolved).slice(0, -3).replaceAll(' ', '-');
            const repositoryPath = resolved.split('/').map(encodeURIComponent).join('/');
            const url = isDocumentation
                ? `https://github.com/${repository}/wiki/${encodeURIComponent(pageTitle)}${suffix}`
                : `https://github.com/${repository}/blob/main/${repositoryPath}${suffix}`;
            parts.push(body.slice(cursor, link.start), url);
            cursor = link.end;
        }
        parts.push(body.slice(cursor));
        return parts.join('');
    }
}
