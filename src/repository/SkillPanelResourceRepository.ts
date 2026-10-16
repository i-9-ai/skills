// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { SkillPanelConfiguration } from '../config/SkillPanelConfiguration.ts';

/** Reads only the fixed packaged UI, identically in source and compiled layouts. */
export class SkillPanelResourceRepository {
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
