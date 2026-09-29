// SPDX-License-Identifier: Apache-2.0
import { createRequire } from 'node:module';

/** Retains full YAML metadata support for the dependency-prepared CLI. */
export class YamlFrontmatterValidator {
    parse(text: string): unknown {
        const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
        if (!frontmatter) throw new Error('Missing frontmatter');

        // Resolve only when this parser is selected. Installed plugin hooks inject
        // the package-owned parser and must never load an external dependency.
        const { parseDocument } = createRequire(import.meta.url)('yaml') as typeof import('yaml');
        const document = parseDocument(frontmatter[1], { uniqueKeys: true, strict: true });
        if (document.errors.length > 0 || document.warnings.length > 0) {
            throw new Error('Invalid frontmatter');
        }

        return document.toJS({ maxAliasCount: 0 });
    }
}
