// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { SkillPanelConfiguration } from '../config/SkillPanelConfiguration.ts';

/** Reads fixed packaged UI and optional branding in source and compiled layouts. */
export class SkillPanelResourceRepository {
    icons() {
        try {
            const bytes = readFileSync(new URL('../../assets/plugin-icon.png', import.meta.url));
            if (bytes.length < 24 || bytes.length > 65_536) return [];
            const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
            if (!bytes.subarray(0, 8).equals(signature)) return [];
            const width = bytes.readUInt32BE(16);
            const height = bytes.readUInt32BE(20);
            if (width !== height || width < 48 || width > 4096) return [];
            return [
                {
                    src: 'data:image/png;base64,' + bytes.toString('base64'),
                    mimeType: 'image/png',
                    sizes: [`${width}x${height}`],
                },
            ];
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
