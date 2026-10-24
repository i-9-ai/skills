// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SkillPanelConfiguration } from '../../../src/config/SkillPanelConfiguration.ts';
import { SkillPanelService } from '../../../src/service/SkillPanelService.ts';

export function skillPanelFixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'i9-panel-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const collection = join(root, 'selected skills');
    const skill = join(collection, 'example-skill');
    const state = join(root, 'private proposals');
    fs.mkdirSync(join(skill, 'references'), { recursive: true });
    fs.mkdirSync(join(skill, 'scripts'));
    const before =
        '---\nname: example-skill\ndescription: Review one synthetic input and produce an evidenced result.\nlicense: Apache-2.0\n---\n\n# Example skill\n\n## Procedure\n\n1. Read the selected input.\n2. Produce the reviewable result.\n\nSee [reference](references/guide.md).\n';
    const after = before.replace(
        '2. Produce the reviewable result.',
        '2. Verify the required inputs and preserve uncertainty.\n3. Produce the reviewable result with performed checks.',
    );
    fs.writeFileSync(join(skill, 'SKILL.md'), before);
    fs.copyFileSync(
        fileURLToPath(new URL('../../../LICENSE', import.meta.url)),
        join(skill, 'LICENSE'),
    );
    fs.writeFileSync(
        join(skill, 'references', 'guide.md'),
        '# Reference\n\nUse synthetic evidence only.\n',
    );
    fs.writeFileSync(
        join(skill, 'scripts', 'sentinel.mjs'),
        'throw new Error("Candidate scripts must never run");\n',
    );
    const configuration = new SkillPanelConfiguration(collection, state);
    const service = new SkillPanelService(configuration);
    const inspect = () => service.inspect({ skill: 'example-skill' });
    const propose = (changes = {}) =>
        service.propose({
            skill: 'example-skill',
            base_sha256: inspect().package_sha256,
            after,
            rationale: 'Make required inputs and performed verification explicit.',
            ...changes,
        });
    const approval = (proposal, action = 'apply') => ({
        action,
        proposal_id: proposal.proposal_id,
        base_sha256: proposal.base_sha256,
        candidate_sha256: proposal.candidate_sha256,
        approved: true,
    });
    return {
        root,
        collection,
        skill,
        state,
        before,
        after,
        service,
        configuration,
        inspect,
        propose,
        approval,
        entrypoint: join(skill, 'SKILL.md'),
    };
}
