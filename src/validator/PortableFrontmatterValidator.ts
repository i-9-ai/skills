// SPDX-License-Identifier: Apache-2.0
import { parseFrontmatter } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';

/** Uses the distributed package parser; unsupported YAML stays a coverage warning. */
export class PortableFrontmatterValidator {
    parse(text: string): unknown {
        return parseFrontmatter(text);
    }
}
