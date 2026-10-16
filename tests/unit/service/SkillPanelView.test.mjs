// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../../assets/skill-panel.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const element = () => ({
    checked: false,
    value: '',
    disabled: false,
    hidden: false,
    open: false,
    textContent: '',
    replaceChildren() {},
    append() {},
    focus() {
        this.focused = true;
    },
    showModal() {
        this.open = true;
    },
    close() {
        this.open = false;
    },
});
const Panel = vm.runInNewContext(script.replace('new SkillChangePanel();', 'SkillChangePanel;'), {
    document: { createElement: element },
});

function view() {
    const elements = new Map();
    const panel = Object.create(Panel.prototype);
    panel.el = (id) => {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
    };
    panel.selected = { skill: 'example-skill', text: 'original', package_sha256: 'base' };
    panel.proposal = {
        proposal_id: 'retained-identity',
        skill: 'example-skill',
        base_sha256: 'base',
        candidate_sha256: 'candidate',
        before: 'original',
        after: 'candidate',
        diff: '-original\n+candidate\n',
        recovery_diff: '-candidate\n+original\n',
        status: 'proposed',
        source_state: 'original',
        write_intent: null,
        rationale: 'Explain the change.',
        validation: {
            local: { status: 'passed', detail: 'Local only.' },
            official: 'not_run',
            behavioral: 'not_run',
        },
    };
    panel.mode = 'apply';
    panel.busy = false;
    panel.uncertain = false;
    panel.unresolved = null;
    panel.renderCatalog = () => {};
    return panel;
}

test('the served panel binds apply/recovery controls to reviewed, valid, certain state', () => {
    const panel = view();
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
    panel.proposal.source_state = 'candidate';
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

for (const action of ['apply', 'recover']) {
    test(
        'an unknown ' +
            action +
            ' retains its identity across closing, reopening, selection and incoming proposals',
        async () => {
            const panel = view();
            panel.mode = action;
            if (action === 'recover') {
                panel.proposal.status = 'applied';
                panel.proposal.source_state = 'candidate';
            }
            const retained = panel.proposal;
            let calls = 0;
            panel.call = async () => {
                calls++;
                throw new Error('Fixture response timeout.');
            };
            panel.el('approval').checked = true;
            await panel.commit();
            assert.equal(calls, 1);
            assert.equal(panel.unresolved.proposal, retained);
            assert.equal(panel.unresolved.action, action);
            assert.equal(panel.el('unresolved-write').hidden, false);
            assert.equal(panel.el('apply').disabled, true);
            assert.equal(panel.el('edit').disabled, true);
            assert.equal(panel.el('preview').disabled, true);
            panel.el('workflow-dialog').close();
            panel.startEditor();
            assert.equal(panel.el('workflow-dialog').open, true);
            panel.invalidate();
            await panel.inspect('other-skill');
            await panel.acceptIncoming({ skill: 'other-skill', proposal_id: 'new-identity' });
            await panel.preview();
            assert.equal(panel.proposal, retained);
            assert.equal(panel.selected.skill, 'example-skill');
            assert.equal(panel.uncertain, true);
            assert.equal(
                calls,
                1,
                'A UI transition must not replace or retry the pending operation',
            );
            assert.match(panel.el('workflow-base').textContent, /retained-identity/);
            panel.el('approval').checked = true;
            await panel.commit();
            assert.equal(calls, 1);
            await assert.rejects(panel.refreshProposal(), /Fixture response timeout/);
            assert.equal(
                panel.unresolved.proposal,
                retained,
                'Failed inspection retains the recovery identity',
            );
            const reconciled = {
                ...retained,
                source_state: action === 'apply' ? 'candidate' : 'original',
                write_intent: action,
                status: action === 'apply' ? 'proposed' : 'applied',
            };
            panel.call = async (name, args) => {
                assert.equal(name, 'skill_panel_proposal');
                assert.equal(args.proposal_id, 'retained-identity');
                return reconciled;
            };
            await panel.refreshProposal();
            assert.equal(panel.unresolved, null);
            assert.equal(panel.uncertain, false);
            assert.equal(panel.proposal, reconciled);
            assert.equal(panel.el('approval').checked, false);
            assert.equal(panel.el('apply').disabled, true, 'Reconciliation never reuses consent');
            panel.el('approval').checked = true;
            panel.actions();
            assert.equal(
                panel.el('apply').disabled,
                false,
                'An inspected intent permits explicit idempotent finalization',
            );
        },
    );
}

test('inspection of changed source keeps both write directions disabled', async () => {
    const panel = view();
    panel.proposal.source_state = 'changed';
    panel.proposal.status = 'applied';
    panel.el('approval').checked = true;
    panel.actions();
    assert.equal(panel.el('apply').disabled, true);
    assert.equal(panel.el('recover-prepare').hidden, true);
    panel.mode = 'recover';
    panel.actions();
    assert.equal(panel.el('apply').disabled, true);
});
