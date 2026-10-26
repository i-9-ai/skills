// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { SkillPanelConfiguration } from '../config/SkillPanelConfiguration.ts';

/** Reads fixed packaged UI and optional branding in source and compiled layouts. */
export class SkillPanelResourceRepository {
    icons() {
        try {
            const bytes = readFileSync(
                new URL('../../assets/skill-panel-icon.svg', import.meta.url),
            );
            if (bytes.length === 0 || bytes.length > 8192) return [];
            const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            if (!source.includes('fill="currentColor"')) return [];
            // Pure neutral endpoints preserve a uniform raster color at antialiased
            // edges, so monochrome hosts can retain the transparent alpha mask.
            return [
                { theme: 'light', color: '#000000' },
                { theme: 'dark', color: '#FFFFFF' },
            ].map(({ theme, color }) => ({
                src:
                    'data:image/svg+xml;base64,' +
                    Buffer.from(source.replaceAll('currentColor', color)).toString('base64'),
                mimeType: 'image/svg+xml',
                sizes: ['any'],
                theme,
            }));
        } catch {
            // Optional branding must not make the actual panel unavailable.
            return [];
        }
    }

    read() {
        const bytes = readFileSync(new URL('../../assets/skill-panel.html', import.meta.url));
        if (bytes.length > 200_000) throw new Error('Panel asset exceeds its bound.');
        return {
            uri: SkillPanelConfiguration.resourceUri,
            mimeType: 'text/html;profile=mcp-app',
            text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
            _meta: {
                ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
            },
        };
    }
}
