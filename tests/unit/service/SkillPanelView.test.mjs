// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../../assets/skill-panel.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const Panel = vm.runInNewContext(
    script.replace('new SkillChangePanel();', 'SkillChangePanel;'),
    {},
);

test('the served panel binds apply/recovery controls to reviewed, valid, certain state', () => {
    const elements = new Map();
    const panel = Object.create(Panel.prototype);
    panel.el = (id) => {
        if (!elements.has(id)) elements.set(id, { checked: false, value: '', disabled: false });
        return elements.get(id);
    };
    panel.selected = { text: 'original' };
    panel.proposal = { status: 'proposed', validation: { local: { status: 'passed' } } };
    panel.mode = 'apply';
    panel.busy = false;
    panel.uncertain = false;
    panel.actions();
    assert.equal(panel.el('apply').disabled, true);
    panel.el('approval').checked = true;
    panel.actions();
    assert.equal(panel.el('apply').disabled, false);
    panel.proposal.validation.local.status = 'failed';
    panel.actions();
    assert.equal(panel.el('apply').disabled, true);
    panel.proposal.validation.local.status = 'passed';
    panel.uncertain = true;
    panel.actions();
    assert.equal(panel.el('apply').disabled, true);
    assert.equal(
        panel.el('edit').disabled,
        true,
        'An unknown write result must be inspected before editing away its retained identity',
    );
    assert.equal(panel.el('inspect-proposal').disabled, false);
    panel.uncertain = false;
    panel.proposal.status = 'applied';
    panel.actions();
    assert.equal(panel.el('apply').disabled, true);
    assert.equal(panel.el('recover-prepare').hidden, false);
    panel.mode = 'recover';
    panel.el('approval').checked = false;
    panel.actions();
    assert.equal(panel.el('apply').disabled, true);
    panel.el('approval').checked = true;
    panel.actions();
    assert.equal(panel.el('apply').disabled, false);
    panel.invalidate();
    assert.equal(panel.proposal, null);
    assert.equal(panel.el('approval').checked, false);
    assert.equal(panel.el('apply').disabled, true);
});
