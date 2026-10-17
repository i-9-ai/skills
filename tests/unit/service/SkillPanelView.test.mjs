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
    clientHeight: 0,
    scrollHeight: 0,
    offsetTop: 0,
    text: '',
    children: [],
    attributes: {},
    listeners: {},
    get textContent() {
        return this.text + this.children.map((child) => child.textContent).join('');
    },
    set textContent(value) {
        this.text = value;
        this.children = [];
    },
    replaceChildren() {
        this.children = [];
        this.text = '';
    },
    querySelectorAll() {
        return this.children.flatMap((child) => [child, ...child.querySelectorAll()]);
    },
    append(...children) {
        this.children.push(...children);
    },
    setAttribute(name, value) {
        this.attributes[name] = value;
    },
    addEventListener(type, handler) {
        (this.listeners[type] ??= []).push(handler);
    },
    focus() {
        this.focused = true;
    },
    showModal() {
        this.open = true;
        this.modal = true;
    },
    show() {
        this.open = true;
        this.modal = false;
    },
    close() {
        this.open = false;
        const listeners = [...(this.listeners.close || [])];
        if (listeners.length) setTimeout(() => listeners.forEach((listener) => listener()), 0);
    },
});
const constructorElements = new Map();
const standaloneWindow = { addEventListener() {} };
standaloneWindow.parent = standaloneWindow;
const Panel = vm.runInNewContext(script.replace('new SkillChangePanel();', 'SkillChangePanel;'), {
    document: {
        addEventListener() {},
        createElement: element,
        getElementById(id) {
            if (!constructorElements.has(id)) constructorElements.set(id, element());
            return constructorElements.get(id);
        },
    },
    window: standaloneWindow,
    setTimeout,
    clearTimeout,
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
    panel.editing = false;
    panel.workspace = 'overview';
    panel.renderCatalog = () => {};
    panel.loadActivity = async () => {};
    panel.hostCapabilities = {};
    panel.activityVersion = 0;
    return panel;
}

test('workspace navigation preserves a candidate but resets approval when leaving comparison', () => {
    const panel = view();
    panel.el('approval').checked = true;
    panel.setWorkspace('compare');
    assert.equal(panel.el('workflow-dialog').open, true);
    assert.equal(
        panel.el('workflow-dialog').modal,
        false,
        'The library stays available beside the comparison',
    );
    assert.equal(panel.el('tab-compare').attributes['aria-selected'], 'true');
    assert.equal(panel.el('source-view').hidden, true);
    panel.setWorkspace('source');
    assert.equal(panel.el('workflow-dialog').open, false);
    assert.equal(panel.el('source-view').hidden, false);
    assert.equal(panel.el('approval').checked, false);
    assert.equal(panel.el('apply').disabled, true);
    assert.equal(panel.proposal.proposal_id, 'retained-identity');
    panel.setWorkspace('compare');
    assert.equal(panel.el('workflow-dialog').open, true);
    assert.equal(panel.el('approval').checked, false);
});

test('workspace keyboard navigation skips unavailable comparison and exposes one tab stop', () => {
    const panel = view();
    panel.proposal = null;
    panel.actions();
    assert.equal(panel.el('tab-compare').disabled, true);
    let prevented = false;
    panel.navigateTabs(
        {
            key: 'End',
            preventDefault() {
                prevented = true;
            },
        },
        'overview',
    );
    assert.equal(prevented, true);
    assert.equal(panel.workspace, 'source');
    assert.equal(panel.el('tab-source').focused, true);
    assert.equal(panel.el('tab-source').attributes.tabindex, '0');
    assert.equal(panel.el('tab-overview').attributes.tabindex, '-1');
    panel.navigateTabs({ key: 'ArrowRight', preventDefault() {} }, 'source');
    assert.equal(panel.workspace, 'overview');
});

test('comparison preserves untrusted text, line endings and highlights EOF-only edits', () => {
    const panel = view();
    const before = '<script>not executable</script>\r\nshared\r\nlast';
    const after = '<script>not executable</script>\r\nshared\r\nlast\r\n';
    panel.renderComparison(before, after);
    assert.equal(panel.el('before').textContent, before);
    assert.equal(panel.el('after').textContent, after);
    assert.equal(panel.el('before').children.length, 3);
    assert.equal(panel.el('before').children[0].className, 'code-line');
    assert.equal(panel.el('before').children[2].className, 'code-line removed');
    assert.equal(panel.el('after').children[2].className, 'code-line added');
    assert.equal(panel.el('after').children[2].attributes['data-line'], '3');
    assert.match(panel.el('before-ending').textContent, /CRLF.*No final newline/);
    assert.match(panel.el('after-ending').textContent, /CRLF.*Final newline/);
    panel.renderComparison('', 'one\n');
    assert.equal(panel.el('before').children.length, 0);
    assert.match(panel.el('before-ending').textContent, /^0 lines/);
    assert.equal(panel.el('after').children[0].className, 'code-line added');
});

test('large comparisons retain full text without an unbounded row-node expansion', () => {
    const panel = view();
    const before = 'a\n'.repeat(5000);
    const after = before + 'b\n';
    panel.renderComparison(before, after);
    assert.equal(panel.el('before').textContent, before);
    assert.equal(panel.el('after').textContent, after);
    assert.equal(panel.el('before').children.length, 0);
    assert.match(panel.el('before-ending').textContent, /Full plain text/);
});

test('proposal checks remain explicit and a refreshed exact comparison clears approval', () => {
    const panel = view();
    panel.el('approval').checked = true;
    panel.renderProposal(panel.proposal);
    assert.equal(panel.el('approval').checked, false);
    assert.match(panel.el('checks').textContent, /Local structure only · passed/);
    assert.match(panel.el('checks').textContent, /Official validation · not run/);
    assert.match(panel.el('checks').textContent, /Behavioral evaluation · not run/);
    assert.equal(
        panel
            .el('diff')
            .children.map((row) => row.textContent)
            .join('\n'),
        panel.proposal.diff,
    );
    panel.mode = 'recover';
    panel.renderProposal(panel.proposal);
    assert.equal(panel.el('before').textContent, panel.proposal.after);
    assert.equal(panel.el('after').textContent, panel.proposal.before);
    assert.match(panel.el('apply').textContent, /Restore approved/);
    panel.mode = 'apply';
    panel.proposal.source_state = 'candidate';
    panel.proposal.status = 'applied';
    panel.renderProposal(panel.proposal);
    assert.match(panel.el('before-title').textContent, /^Retained/);
    assert.match(panel.el('after-title').textContent, /^Current/);
    panel.mode = 'recover';
    panel.proposal.source_state = 'original';
    panel.proposal.status = 'recovered';
    panel.renderProposal(panel.proposal);
    assert.match(panel.el('before-title').textContent, /^Retained/);
    assert.match(panel.el('after-title').textContent, /^Current/);
    assert.equal(panel.el('apply').disabled, true);
});

test('a delayed close from the old comparison cannot hide a newly opened proposal', async () => {
    constructorElements.clear();
    const panel = new Panel();
    const fixture = view();
    panel.selected = fixture.selected;
    panel.proposal = fixture.proposal;
    panel.renderCatalog = () => {};
    panel.loadActivity = async () => {};
    panel.setWorkspace('compare');
    const incoming = {
        ...fixture.proposal,
        proposal_id: 'new-retained-identity',
        source_sha256: 'base',
    };
    panel.call = async (name) =>
        name === 'skill_panel_proposal'
            ? incoming
            : { ...fixture.selected, description: 'Selected fixture.', files: 1, bytes: 8 };
    await panel.acceptIncoming(incoming);
    assert.equal(panel.workspace, 'compare');
    assert.equal(panel.el('workflow-dialog').open, true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(
        panel.workspace,
        'compare',
        'The earlier close event must not override the new view',
    );
    assert.equal(panel.el('workflow-dialog').open, true);
    assert.equal(panel.proposal.proposal_id, incoming.proposal_id);
    panel.el('workflow-dialog').close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(panel.workspace, 'overview', 'An intentional close must still work');
    assert.equal(panel.el('workflow-dialog').open, false);
});

for (const sourceChangesDuringInspection of [false, true]) {
    test(
        'incoming proposal state is re-read instead of trusting an older tool result' +
            (sourceChangesDuringInspection ? ' when the source changes between reads' : ''),
        async () => {
            const panel = view();
            const old = panel.proposal;
            const current = {
                ...old,
                status: 'applied',
                source_state: 'candidate',
                source_sha256: 'candidate',
            };
            let lookups = 0;
            panel.el('approval').checked = true;
            panel.call = async (name, args) => {
                if (name === 'skill_panel_proposal') {
                    assert.equal(args.proposal_id, old.proposal_id);
                    lookups++;
                    if (sourceChangesDuringInspection && lookups === 1)
                        return { ...old, source_sha256: 'base' };
                    return current;
                }
                assert.equal(name, 'skill_panel_inspect');
                assert.equal(args.skill, old.skill);
                return {
                    skill: old.skill,
                    name: old.skill,
                    text: 'candidate',
                    package_sha256: 'candidate',
                    read_only: false,
                    description: 'An inspected current candidate.',
                    files: 1,
                    bytes: 9,
                };
            };
            await panel.acceptIncoming({ ...old, after: 'obsolete notification text' });
            assert.equal(lookups, sourceChangesDuringInspection ? 2 : 1);
            assert.equal(panel.proposal, current);
            assert.equal(panel.el('candidate').value, 'candidate');
            assert.equal(panel.el('source').value, 'candidate');
            assert.match(panel.el('before-title').textContent, /^Retained/);
            assert.match(panel.el('after-title').textContent, /^Current/);
            assert.equal(panel.el('approval').checked, false);
            assert.equal(panel.el('apply').disabled, true);
        },
    );
}

test('the panel loads every catalog page and searches human names within a source filter', async () => {
    const panel = view();
    const seen = [];
    panel.call = async (_name, query) => {
        seen.push(query);
        if (!query.offset)
            return {
                collection: 'pilot',
                skills: [
                    {
                        skill: 'example-skill',
                        name: 'example-skill',
                        source: 'selected',
                        description: 'Selected copy.',
                    },
                ],
                warnings: [],
                next_offset: 1,
            };
        return {
            collection: 'pilot',
            skills: [
                {
                    skill: 'global:' + 'a'.repeat(64),
                    name: 'personal-reference',
                    source: 'global',
                    description: 'Global source.',
                },
            ],
            warnings: [],
            next_offset: null,
        };
    };
    await panel.loadCatalog();
    assert.equal(panel.catalog.length, 2);
    assert.equal(seen.length, 2);
    panel.el('source-filter').value = 'global';
    panel.el('search').value = 'personal-reference';
    Panel.prototype.renderCatalog.call(panel);
    assert.match(panel.el('result-note').textContent, /^1 skill shown/);
    panel.el('source-filter').value = 'selected';
    Panel.prototype.renderCatalog.call(panel);
    assert.match(panel.el('result-note').textContent, /^0 skills shown/);
});

test('global inspection keeps manual candidate and mutation workflows disabled', async () => {
    const panel = view();
    let calls = 0;
    panel.call = async () => {
        calls++;
        return {
            skill: 'global:' + 'a'.repeat(64),
            name: 'personal-reference',
            source: 'global',
            read_only: true,
            sha256: 'entrypoint-hash',
            package_sha256: null,
            text: 'Actual global source.',
            description: 'A global reference.',
            bytes: 21,
            files: 1,
        };
    };
    await panel.inspect('global:' + 'a'.repeat(64));
    assert.equal(panel.el('selected-title').textContent, 'personal-reference');
    assert.equal(panel.el('selected-hash').textContent, 'entrypoint-hash');
    assert.equal(panel.el('evolve').disabled, true);
    panel.el('candidate').value = 'A previous draft';
    panel.el('rationale').value = 'A previous rationale';
    panel.actions();
    assert.equal(panel.el('preview').disabled, true);
    assert.match(panel.el('selected-state').textContent, /read.only/i);
    panel.startEditor();
    await panel.preview();
    assert.equal(panel.el('workflow-dialog').open, false);
    assert.equal(calls, 1);
});

test('a catalog change between pages preserves the previous view and requires a fresh load', async () => {
    const panel = view();
    panel.catalog = [{ skill: 'retained-entry' }];
    panel.call = async (_name, query) => ({
        collection: 'pilot',
        skills: [],
        warnings: [],
        next_offset: query.offset ? null : 1,
        catalog_revision: query.offset ? 'changed' : 'original',
    });
    await assert.rejects(() => panel.loadCatalog(), /Catalog changed/);
    assert.equal(panel.catalog[0].skill, 'retained-entry');
});

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
            assert.match(panel.el('before-title').textContent, /^Retained/);
            assert.match(panel.el('after-title').textContent, /^Retained/);
            assert.match(
                panel.el('proposal-id').textContent,
                /source: unknown; previous observation:/,
            );
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
            assert.match(panel.el('after-title').textContent, /^Current/);
            assert.doesNotMatch(panel.el('proposal-id').textContent, /source: unknown/);
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

function workflowView() {
    const panel = view();
    panel.scheduleActivity = () => {};
    panel.hostCapabilities = { message: { text: {} }, experimental: { 'openai/message': {} } };
    panel.selected.name = panel.selected.skill;
    return panel;
}

test('one user action retains a request and sends it through the advertised host without applying', async () => {
    const panel = workflowView();
    const calls = [];
    panel.call = async (name, args) => {
        calls.push([name, args]);
        assert.equal(name, 'skill_panel_request');
        return {
            request: { skill: panel.selected.skill },
            instructions: 'A source-bound review instruction.',
        };
    };
    panel.request = async (method, params) => {
        calls.push([method, params]);
        return {};
    };
    await panel.askAgent('review');
    assert.equal(calls.length, 2);
    assert.equal(calls[1][0], 'ui/message');
    assert.equal(calls[1][1].role, 'user');
    assert.equal(calls[1][1].content[0].text, 'A source-bound review instruction.');
    assert.equal(calls[1][1]._meta['openai/message'].send, true);
    assert.equal(calls[1][1]._meta['openai/message'].target, 'active');
    assert.match(panel.el('request-status').textContent, /Awaiting a recorded/);
    assert.equal(panel.el('approval').checked, false);
});

test('unsupported hosts show the manual fallback and never silently send or apply', async () => {
    const panel = workflowView();
    panel.hostCapabilities = {};
    panel.call = async () => ({
        request: { skill: panel.selected.skill },
        instructions: 'Retained request instructions.',
    });
    panel.request = async () => assert.fail('No advertised messaging capability');
    await panel.askAgent('review');
    assert.equal(panel.el('draft-dialog').open, true);
    assert.equal(panel.el('task-draft').value, 'Retained request instructions.');
    assert.match(panel.el('request-status').textContent, /not sent/);
});

test('a standard messaging host receives no unsupported OpenAI extension', async () => {
    const panel = workflowView();
    panel.hostCapabilities = { message: { text: {} } };
    panel.call = async () => ({
        request: { skill: panel.selected.skill },
        instructions: 'Standard request.',
    });
    panel.request = async (method, params) => {
        assert.equal(method, 'ui/message');
        assert.equal(Object.hasOwn(params, '_meta'), false);
        return {};
    };
    await panel.askAgent('review');
});

test('uncertain message delivery never retries and an explicit continuation reuses the retained ID', async () => {
    const panel = workflowView();
    const inputs = [];
    panel.call = async (_name, input) => {
        inputs.push(input);
        return {
            request: { skill: panel.selected.skill },
            instructions: 'The same retained request.',
        };
    };
    let sends = 0;
    panel.request = async () => {
        sends++;
        throw new Error('Fixture timeout.');
    };
    await panel.askAgent('review');
    assert.equal(sends, 1);
    assert.match(panel.el('request-status').textContent, /delivery is unconfirmed/);
    await panel.askAgent('review', 'the-retained-id');
    assert.equal(sends, 2, 'Only the second explicit action may send again');
    assert.equal(inputs[1].request_id, 'the-retained-id');
    assert.equal(Object.keys(inputs[1]).length, 1);
});

test('activity gives no-change results and clickable comparisons without interpreting report text as HTML', () => {
    const panel = workflowView();
    const activity = {
        requests: [
            {
                request_id: 'review-id',
                base_sha256: 'base',
                created_at: '2026-10-17T00:00:00.000Z',
                result: {
                    outcome: 'no_changes',
                    summary: '<script>A report, not markup.</script>',
                    proposal_id: null,
                },
            },
        ],
        proposals: [{ proposal_id: 'retained-id', rationale: 'A supplied improvement.' }],
    };
    panel.renderActivity(activity);
    assert.match(panel.el('request-status').textContent, /No changes proposed/);
    assert.match(panel.el('activity-list').textContent, /<script>A report, not markup.<\/script>/);
    const buttons = panel
        .el('activity-list')
        .querySelectorAll('button')
        .filter((node) => node.textContent === 'Compare proposal');
    assert.equal(buttons.length, 1);
    assert.equal(
        panel.proposal.proposal_id,
        'retained-identity',
        'A summary never replaces the verified proposal',
    );
    assert.equal(panel.el('approval').checked, false);
});

test('activity responses for a previous skill cannot replace the current selection or summary', async () => {
    const panel = workflowView();
    let resolve;
    panel.call = () =>
        new Promise((done) => {
            resolve = done;
        });
    const loading = Panel.prototype.loadActivity.call(panel);
    panel.selected = { ...panel.selected, skill: 'another-skill' };
    resolve({ requests: [], proposals: [] });
    await loading;
    assert.equal(panel.activity, undefined);
    assert.equal(panel.selected.skill, 'another-skill');
});

test('global skills can ask for a review but never request candidates', async () => {
    const panel = workflowView();
    panel.selected = { skill: 'global:' + 'a'.repeat(64), read_only: true };
    panel.call = async (_name, input) => {
        assert.equal(input.kind, 'review');
        return { request: { skill: panel.selected.skill }, instructions: 'Read-only review.' };
    };
    let sends = 0;
    panel.request = async () => {
        sends++;
        return {};
    };
    await panel.askAgent('proposal');
    assert.equal(sends, 0);
    await panel.askAgent('review');
    assert.equal(sends, 1);
    panel.actions();
    assert.equal(panel.el('evolve').disabled, true);
    assert.equal(panel.el('manual-candidate').disabled, true);
});
