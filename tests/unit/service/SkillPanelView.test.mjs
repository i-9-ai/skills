// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { SkillPanelDiffService } from '../../../src/service/SkillPanelDiffService.ts';

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
    scrollIntoView() {},
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
        comparison: new SkillPanelDiffService().compare('original', 'candidate'),
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

test('saved workflow stages distinguish unknown history, recorded results and an uninspected candidate without inferring execution', () => {
    const panel = view();
    panel.proposal = null;
    panel.call = () => assert.fail('Stage presentation must not call a tool');
    panel.renderReviewProgress();
    assert.match(panel.el('progress-request').textContent, /History not loaded/);
    assert.match(panel.el('progress-decision').textContent, /not inspected/);
    panel.activity = { requests: [], proposals: [] };
    panel.renderReviewProgress();
    assert.equal(panel.el('progress-request').textContent, 'None recorded');
    panel.currentReview = { base_sha256: 'old-base', result: null };
    panel.renderReviewProgress();
    assert.match(panel.el('progress-request').textContent, /different inspected revision/);
    assert.match(panel.el('progress-result').textContent, /Awaiting.*execution is unverified/);
    for (const outcome of ['findings', 'no_changes', 'blocked']) {
        panel.currentReview.result = { outcome };
        panel.renderReviewProgress();
        assert.match(panel.el('progress-result').textContent, /^Recorded/);
        assert.equal(
            panel.el('progress-decision').textContent,
            'No candidate · nothing to approve',
        );
    }
    panel.currentReview.result = { outcome: 'proposal' };
    panel.currentDiff = 'retained-id';
    panel.renderReviewProgress();
    assert.match(panel.el('progress-decision').textContent, /open its diff to inspect state/);
    assert.equal(panel.el('approval').checked, false);
    panel.selected = null;
    panel.renderReviewProgress();
    assert.equal(panel.el('review-progress').hidden, true);
});

test('decision progress uses only the opened proposal and prioritizes unknown writes without changing approval guards', () => {
    const panel = view();
    panel.activity = { requests: [], proposals: [] };
    panel.currentReview = { base_sha256: 'base', result: { outcome: 'no_changes' } };
    panel.el('approval').checked = false;
    panel.actions();
    assert.match(panel.el('progress-result').textContent, /no changes proposed/);
    assert.match(
        panel.el('progress-decision').textContent,
        /Opened proposal.*exact approval required/,
    );
    assert.equal(panel.el('apply').disabled, true);
    panel.proposal.status = 'applied';
    panel.proposal.source_state = 'candidate';
    panel.actions();
    assert.match(
        panel.el('progress-decision').textContent,
        /last inspected as applied.*separate approval/,
    );
    panel.mode = 'recover';
    panel.actions();
    assert.match(panel.el('progress-decision').textContent, /reverse diff open.*exact approval/);
    assert.equal(panel.el('approval').checked, false);
    panel.uncertain = true;
    panel.actions();
    assert.match(panel.el('progress-decision').textContent, /Write outcome unconfirmed/);
    assert.equal(panel.el('approval').disabled, true);
    panel.uncertain = false;
    panel.proposal.write_intent = 'recover';
    panel.actions();
    assert.match(panel.el('progress-decision').textContent, /retained write intent/);
    panel.proposal.write_intent = null;
    panel.proposal.source_state = 'changed';
    panel.actions();
    assert.match(panel.el('progress-decision').textContent, /source changed/);
    assert.equal(panel.el('apply').disabled, true);
    panel.proposal.status = 'recovered';
    panel.proposal.source_state = 'original';
    panel.actions();
    assert.match(panel.el('progress-decision').textContent, /last inspected as recovered/);
    panel.proposal.skill = 'another-skill';
    panel.actions();
    assert.equal(panel.el('progress-decision').textContent, 'No candidate · nothing to approve');
    panel.selected.read_only = true;
    panel.renderReviewProgress();
    assert.match(panel.el('progress-decision').textContent, /Read only.*no change can be approved/);
});

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
    panel.renderComparison(before, after, new SkillPanelDiffService().compare(before, after));
    assert.equal(panel.el('before').textContent, before);
    assert.equal(panel.el('after').textContent, after);
    assert.equal(panel.el('before').children.length, 3);
    assert.equal(panel.el('before').children[0].className, 'code-line');
    assert.equal(panel.el('before').children[2].className, 'code-line removed');
    assert.equal(panel.el('after').children[2].className, 'code-line added');
    assert.equal(panel.el('after').children[2].attributes['data-line'], '3');
    assert.match(panel.el('before-ending').textContent, /CRLF.*No final newline/);
    assert.match(panel.el('after-ending').textContent, /CRLF.*Final newline/);
    panel.renderComparison('', 'one\n', new SkillPanelDiffService().compare('', 'one\n'));
    assert.equal(panel.el('before').children.length, 0);
    assert.match(panel.el('before-ending').textContent, /^0 lines/);
    assert.equal(panel.el('after').children[0].className, 'code-line added');
});

test('large comparisons retain full text without an unbounded row-node expansion', () => {
    const panel = view();
    const before = 'a\n'.repeat(5000);
    const after = before + 'b\n';
    panel.renderComparison(before, after, new SkillPanelDiffService().compare(before, after));
    assert.equal(panel.el('before').textContent, before);
    assert.equal(panel.el('after').textContent, after);
    assert.equal(panel.el('before').children.length, 0);
    assert.match(panel.el('before-ending').textContent, /Full plain text/);
    assert.equal(panel.el('change-previous').disabled, true);
    assert.equal(panel.el('change-next').disabled, true);
    assert.match(panel.el('change-position').textContent, /navigation unavailable/);
});

test('changed-block controls scroll each pane independently and never infer consent or call tools', () => {
    const panel = view();
    const before = 'first\nkeep\nremove\nlast\n';
    const after = 'insert one\ninsert two\nfirst\nkeep\nlast\nappend\n';
    panel.proposal.before = before;
    panel.proposal.after = after;
    panel.proposal.comparison = new SkillPanelDiffService().compare(before, after);
    panel.call = () => assert.fail('Reading a changed block must not call a tool');
    panel.renderProposal(panel.proposal);
    for (const [id, stride] of [
        ['before', 100],
        ['after', 150],
    ]) {
        const pane = panel.el(id);
        pane.scrollHeight = 2000;
        pane.clientHeight = 300;
        pane.offsetTop = 500;
        pane.children.forEach((row, i) => (row.offsetTop = i * stride));
    }
    assert.match(panel.el('change-position').textContent, /^Change 1 of 3/);
    assert.equal(panel.el('change-previous').disabled, true);
    panel.navigateChange(1);
    assert.equal(panel.el('before').scrollTop, 136);
    assert.equal(panel.el('after').scrollTop, 536);
    assert.match(
        panel.el('change-position').textContent,
        /Change 2 of 3.*left line 3 \/ right line 5/,
    );
    assert.equal(panel.el('approval').checked, false);
    assert.equal(panel.el('apply').disabled, true);
    panel.el('approval').checked = true;
    panel.navigateChange(1);
    assert.equal(
        panel.el('before').scrollTop,
        236,
        'EOF insertion anchors the last available left line',
    );
    assert.equal(panel.el('after').scrollTop, 686);
    assert.equal(panel.el('change-next').disabled, true);
    panel.navigateChange(1);
    assert.equal(panel.changeIndex, 2);
    panel.navigateChange(-1);
    assert.equal(panel.changeIndex, 1);
    assert.equal(panel.el('approval').checked, true, 'Navigation preserves exact operator consent');
    assert.equal(panel.proposal.proposal_id, 'retained-identity');

    panel.mode = 'recover';
    panel.renderProposal(panel.proposal);
    panel.navigateChange(1);
    assert.match(panel.el('change-position').textContent, /left line 5 \/ right line 3/);
    assert.equal(panel.el('approval').checked, false, 'Recovery requires new approval');
    panel.renderComparison('', 'new\n', new SkillPanelDiffService().compare('', 'new\n'));
    panel.scrollComparison();
    assert.equal(panel.el('before').scrollTop, 0);
    assert.equal(panel.el('change-next').disabled, true);
});

test('package file reader uses the frozen identity and never treats a text resource as executable', async () => {
    const panel = view();
    const selected = {
        ...panel.selected,
        name: 'example-skill',
        resources: [{ path: 'SKILL.md' }, { path: 'references/guide.md' }],
        files: 2,
        bytes: 100,
        description: 'Synthetic skill.',
    };
    panel.selected = selected;
    panel.renderSelection(selected);
    assert.equal(panel.el('resource-select').children.length, 2);
    assert.equal(panel.el('resource-select').disabled, false);
    panel.el('resource-select').value = 'references/guide.md';
    panel.call = async (name, args) => {
        assert.equal(name, 'skill_panel_inspect');
        assert.deepEqual(JSON.parse(JSON.stringify(args)), {
            skill: 'example-skill',
            resource: 'references/guide.md',
            base_sha256: 'base',
        });
        return {
            ...selected,
            resource: { path: 'references/guide.md', text: '<script>inert</script>' },
        };
    };
    await panel.loadResource();
    assert.equal(panel.el('source').value, '<script>inert</script>');
    assert.match(panel.el('resource-status').textContent, /no script was executed/);
    assert.equal(panel.selected, selected);
});

test('a late or failed resource preview cannot replace a later selection or imply current bytes', async () => {
    const panel = view();
    panel.el('resource-select').value = 'references/guide.md';
    let deliver;
    panel.call = () =>
        new Promise((resolve) => {
            deliver = resolve;
        });
    const pending = panel.loadResource();
    panel.el('resource-select').value = 'SKILL.md';
    await panel.loadResource();
    deliver({ ...panel.selected, resource: { path: 'references/guide.md', text: 'late' } });
    await pending;
    assert.equal(panel.el('source').value, 'original');
    panel.el('resource-select').value = 'assets/icon.png';
    panel.call = async () => {
        throw new Error('Unsupported or changed');
    };
    await panel.loadResource();
    assert.equal(panel.el('source').value, '');
    assert.match(panel.el('resource-status').textContent, /Preview unavailable.*Reinspect/);
    assert.equal(panel.proposal.proposal_id, 'retained-identity');
});

test('findings without a proposal still expose reported resource reading without inventing a diff', () => {
    const panel = view();
    panel.renderCurrentResult(
        {
            requests: [
                {
                    base_sha256: 'base',
                    result: {
                        outcome: 'findings',
                        summary: 'The reference needs clarification.',
                        proposal_id: null,
                        reviewed_files: ['SKILL.md', 'references/guide.md'],
                    },
                },
            ],
            proposals: [],
        },
        { findings: 'Review findings' },
    );
    assert.match(panel.el('result-coverage').textContent, /reading 2 files/);
    assert.match(panel.el('result-files').textContent, /references\/guide.md/);
    assert.equal(panel.el('current-result-details').hidden, false);
    assert.equal(panel.currentDiff, null);
});

test('word highlights leave shared text neutral and coverage never infers analysis from inventory', () => {
    const panel = view();
    const before = 'Keep the old value and <unsafe> text.\nunchanged\n';
    const after = before.replace('old', 'new');
    panel.proposal.before = before;
    panel.proposal.after = after;
    panel.proposal.comparison = new SkillPanelDiffService().compare(before, after);
    panel.proposal.resources = [{ path: 'SKILL.md' }, { path: 'references/guide.md' }];
    panel.renderProposal(panel.proposal);
    assert.equal(panel.el('before').textContent, before);
    const row = panel.el('before').children[0];
    assert.equal(
        row.children
            .filter((part) => part.className === 'word-change')
            .map((part) => part.textContent)
            .join(''),
        'old',
    );
    assert.equal(panel.el('before').children[1].className, 'code-line');
    assert.match(panel.el('review-coverage').textContent, /not recorded/);
    assert.match(
        panel.el('proposal-files').textContent,
        /references\/guide.md · unchanged; preserved for integrity · reading not reported/,
    );
    panel.activity = {
        proposals: [],
        requests: [
            {
                base_sha256: 'base',
                created_at: '2026-10-20T01:48:06Z',
                result: {
                    outcome: 'proposal',
                    summary: 'Read the entrypoint.',
                    proposal_id: 'retained-identity',
                    reviewed_files: ['SKILL.md'],
                },
            },
        ],
    };
    panel.el('approval').checked = true;
    panel.renderActivity(panel.activity);
    assert.match(panel.el('review-coverage').textContent, /Agent-reported reading: 1/);
    assert.equal(
        panel.el('approval').checked,
        true,
        'Coverage refresh does not replace or approve the exact comparison',
    );
    panel.activity.requests[0].base_sha256 = 'another-base';
    panel.renderCoverage(panel.proposal);
    assert.match(panel.el('review-coverage').textContent, /not recorded/);
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
    assert.match(panel.el('action-caption').textContent, /Review only/);
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
        'a confirmed ' + action + ' stays confirmed when refreshing skill details fails',
        async () => {
            const panel = view();
            panel.mode = action;
            if (action === 'recover') {
                panel.proposal.status = 'applied';
                panel.proposal.source_state = 'candidate';
            }
            const confirmed = {
                ...panel.proposal,
                status: action === 'apply' ? 'applied' : 'recovered',
                source_state: action === 'apply' ? 'candidate' : 'original',
                write_intent: null,
            };
            const calls = [];
            panel.call = async (name) => {
                calls.push(name);
                if (name === 'skill_panel_' + action) return confirmed;
                assert.equal(name, 'skill_panel_inspect');
                throw new Error('Fixture details refresh failed.');
            };
            panel.el('approval').checked = true;
            await panel.commit();

            assert.equal(
                panel.proposal,
                confirmed,
                'Keep the acknowledged result, not the pre-write state',
            );
            assert.equal(panel.unresolved.confirmed, true);
            assert.equal(panel.unresolved.proposal, confirmed);
            assert.match(panel.el('write-feedback-detail').textContent, /confirmed.*refresh/i);
            assert.doesNotMatch(
                panel.el('workflow-status').textContent,
                /write result is unknown/i,
            );
            assert.equal(panel.el('approval').checked, false);
            assert.equal(panel.el('apply').disabled, true);
            assert.equal(panel.el('evolve').disabled, true);
            panel.el('approval').checked = true;
            await panel.commit();
            assert.equal(
                calls.length,
                2,
                'A display failure must never replay the confirmed write',
            );

            panel.call = async (name) => {
                calls.push(name);
                if (name === 'skill_panel_proposal') return confirmed;
                assert.equal(name, 'skill_panel_inspect');
                return {
                    ...panel.selected,
                    text: action === 'apply' ? 'candidate' : 'original',
                    package_sha256: action === 'apply' ? 'candidate' : 'base',
                };
            };
            await panel.refreshProposal();
            assert.equal(panel.unresolved, null);
            assert.equal(panel.uncertain, false);
            assert.equal(panel.selected.text, action === 'apply' ? 'candidate' : 'original');
            assert.equal(panel.el('approval').checked, false);
            assert.equal(
                panel.el('apply').textContent,
                action === 'apply' ? 'Applied' : 'Recovered',
            );
            assert.equal(panel.el('apply').disabled, true);
        },
    );

    test('reopening a completed ' + action + ' explains why approval is disabled', () => {
        const panel = view();
        panel.proposal.status = action === 'apply' ? 'applied' : 'recovered';
        panel.proposal.source_state = action === 'apply' ? 'candidate' : 'original';
        panel.call = () => assert.fail('Showing a receipt must not request another write');
        panel.renderProposal(panel.proposal);

        assert.equal(panel.el('apply').textContent, action === 'apply' ? 'Applied' : 'Recovered');
        assert.match(panel.el('write-feedback-detail').textContent, /current.*matches/i);
        assert.equal(panel.el('apply').disabled, true);
        assert.equal(panel.el('approval').disabled, true);
        assert.equal(panel.el('keep-proposal').textContent, 'Back to skill');
        assert.doesNotMatch(panel.el('keep-caption').textContent, /without applying/i);
        assert.equal(panel.el('recover-prepare').hidden, action !== 'apply');
    });
}

test('a pending write shows progress and cannot submit a second operation', async () => {
    const panel = view();
    let finish;
    let calls = 0;
    panel.call = async () => {
        calls++;
        await new Promise((resolve) => {
            finish = resolve;
        });
        throw new Error('Fixture acknowledgement lost.');
    };
    panel.el('approval').checked = true;
    const pending = panel.commit();
    assert.match(panel.el('write-feedback-title').textContent, /applying/i);
    assert.match(panel.el('write-feedback-detail').textContent, /waiting/i);
    assert.equal(panel.el('apply').disabled, true);
    panel.el('approval').checked = true;
    await panel.commit();
    assert.equal(calls, 1);
    finish();
    await pending;
    assert.match(panel.el('write-feedback-detail').textContent, /result.*unknown.*refresh/i);
    assert.equal(panel.el('inspect-proposal').disabled, false);
});

test('matching candidate bytes with an unfinished receipt are not presented as completed', () => {
    const panel = view();
    panel.proposal.source_state = 'candidate';
    panel.proposal.write_intent = 'apply';
    panel.renderProposal(panel.proposal);
    assert.notEqual(panel.el('apply').textContent, 'Applied');
    assert.match(panel.el('write-feedback-detail').textContent, /receipt.*pending/i);
    assert.equal(panel.el('apply').disabled, true);
    panel.el('approval').checked = true;
    panel.actions();
    assert.equal(
        panel.el('apply').disabled,
        false,
        'Inspected intent still needs fresh exact approval',
    );
});

test('refreshing a lost acknowledgement discovers completion without replaying application', async () => {
    const panel = view();
    panel.call = async () => {
        throw new Error('Fixture acknowledgement lost.');
    };
    panel.el('approval').checked = true;
    await panel.commit();
    const completed = { ...panel.proposal, status: 'applied', source_state: 'candidate' };
    panel.call = async (name, args) => {
        if (name === 'skill_panel_inspect') {
            assert.equal(args.skill, 'example-skill');
            return { ...panel.selected, text: 'candidate', package_sha256: 'candidate' };
        }
        assert.equal(name, 'skill_panel_proposal');
        assert.equal(args.proposal_id, 'retained-identity');
        return completed;
    };
    await panel.refreshProposal();
    assert.equal(panel.unresolved, null);
    assert.equal(panel.selected.text, 'candidate', 'The Files view must show the applied text too');
    assert.equal(panel.el('apply').textContent, 'Applied');
    assert.equal(panel.el('apply').disabled, true);
    assert.equal(panel.el('approval').checked, false);
    assert.match(panel.el('workflow-status').textContent, /already applied/);
    assert.equal(panel.el('recover-prepare').hidden, false);
});

test('a source edit observed after write confirmation cannot leave completed recovery controls enabled', async () => {
    const panel = view();
    const completed = {
        ...panel.proposal,
        status: 'applied',
        source_state: 'candidate',
        source_sha256: 'candidate',
    };
    const changed = { ...completed, source_state: 'changed', source_sha256: 'intervening-edit' };
    panel.call = async (name) => {
        if (name === 'skill_panel_apply') return completed;
        if (name === 'skill_panel_inspect')
            return {
                ...panel.selected,
                text: 'intervening edit',
                package_sha256: 'intervening-edit',
            };
        assert.equal(name, 'skill_panel_proposal');
        return changed;
    };
    panel.el('approval').checked = true;
    await panel.commit();
    assert.equal(panel.proposal.source_state, 'changed');
    assert.equal(panel.el('recover-prepare').hidden, true);
    assert.match(panel.el('write-feedback-detail').textContent, /no longer matches/);
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
    assert.match(panel.el('review-outcome').textContent, /No changes proposed/);
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

test('a completed tool result opens its real skill in a fresh panel without trusting its summary', async () => {
    const panel = workflowView();
    panel.selected = null;
    panel.proposal = null;
    let inspected = null;
    panel.inspect = async (skill) => {
        inspected = skill;
    };
    await panel.showCompleted({
        request: { skill: 'example-skill' },
        result: { summary: 'An untrusted notification summary.' },
    });
    assert.equal(inspected, 'example-skill');
    assert.doesNotMatch(panel.el('request-status').textContent, /untrusted notification/);
    panel.selected = { skill: 'another-skill' };
    inspected = null;
    await panel.showCompleted({ request: { skill: 'example-skill' } });
    assert.equal(inspected, null, 'A different current selection is not replaced');
});

test('a global findings result explains the unavailable diff next to the current result', () => {
    const panel = workflowView();
    panel.selected.read_only = true;
    const summary = 'A complete review finding. '.repeat(30) + '<script>inert</script>';
    panel.renderActivity({
        requests: [
            {
                request_id: 'global-review',
                created_at: '2026-10-17T00:00:00.000Z',
                base_sha256: 'base',
                result: { outcome: 'findings', summary, proposal_id: null },
            },
        ],
        proposals: [],
    });
    assert.equal(panel.el('review-outcome').textContent, 'Review findings');
    assert.match(panel.el('diff-status').textContent, /This global skill is read only/);
    assert.equal(panel.el('view-diff').disabled, true);
    assert.equal(panel.el('evolve').disabled, true);
    assert.equal(panel.el('current-result-details').hidden, false);
    assert.equal(panel.el('result-full').textContent, summary);
    assert.equal(panel.el('result-full').children.length, 0, 'Report text never becomes markup');
    assert(panel.el('result-summary').textContent.length < summary.length);
});

test('an editable global retains its source identity and requires scoped exact approval', async () => {
    const panel = workflowView();
    const skill = 'global:' + 'a'.repeat(64);
    panel.selected = {
        ...panel.selected,
        skill,
        name: 'personal-reference',
        source: 'global',
        read_only: false,
    };
    panel.proposal = { ...panel.proposal, skill };
    panel.renderSelection(panel.selected);
    panel.renderProposal(panel.proposal);
    panel.currentDiff = panel.proposal.proposal_id;
    panel.actions();

    assert.equal(panel.el('selected-origin').textContent, 'Global collection · editable');
    assert.equal(panel.el('evolve').disabled, false);
    assert.equal(panel.el('view-diff').disabled, false);
    assert.match(panel.el('write-scope').textContent, /actual global SKILL.md, not a private copy/);
    assert.match(panel.el('approval-label').textContent, /Target: global skill personal-reference/);
    assert.equal(panel.el('approval').checked, false);
    assert.equal(panel.el('apply').disabled, true);

    const received = [];
    panel.call = async (name, args) => {
        received.push([name, args]);
        if (name === 'skill_panel_apply') return { ...panel.proposal, status: 'applied' };
        assert.equal(name, 'skill_panel_inspect');
        assert.equal(args.skill, skill);
        return { ...panel.selected, text: 'candidate', package_sha256: 'candidate' };
    };
    await panel.commit();
    assert.equal(received.length, 0, 'Opening a real global diff grants no approval');
    panel.el('approval').checked = true;
    panel.actions();
    assert.equal(panel.el('apply').disabled, false);
    await panel.commit();
    assert.equal(received[0][0], 'skill_panel_apply');
    assert.equal(received[0][1].approved, true);
    assert.equal(received[0][1].base_sha256, 'base');
    assert.equal(received[0][1].candidate_sha256, 'candidate');
    assert.equal(panel.el('approval').checked, false);
});

test('ineligible globals show their read-only reason and never enable approval', () => {
    const panel = workflowView();
    panel.selected = {
        ...panel.selected,
        source: 'global',
        read_only: true,
        read_only_reason: 'The package resolves outside the configured global root.',
    };
    panel.renderSelection(panel.selected);
    panel.renderProposal(panel.proposal);
    panel.el('approval').checked = true;
    panel.actions();
    assert.match(panel.el('selected-state').textContent, /resolves outside/);
    assert.match(panel.diffExplanation(null, null), /resolves outside/);
    assert.equal(panel.el('approval').disabled, true);
    assert.equal(panel.el('apply').disabled, true);
    assert.equal(panel.el('evolve').disabled, true);
});

test('global catalog badges distinguish editability without claiming a selected copy', () => {
    const panel = view();
    panel.catalog = [
        {
            skill: 'global:' + 'a'.repeat(64),
            source: 'global',
            name: 'editable',
            read_only: false,
            description: '',
        },
        {
            skill: 'global:' + 'b'.repeat(64),
            source: 'global',
            name: 'reference',
            read_only: true,
            description: '',
        },
    ];
    Panel.prototype.renderCatalog.call(panel);
    const cards = panel.el('results').children;
    assert.match(cards[0].attributes['aria-label'], /Global · editable/);
    assert.match(cards[1].attributes['aria-label'], /Global · read only/);
    assert.doesNotMatch(cards[0].attributes['aria-label'], /Selected collection/);
});

test('the current proposal has a direct diff action that still reloads the authoritative proposal', async () => {
    const panel = workflowView();
    panel.renderActivity({
        requests: [
            {
                request_id: 'review',
                created_at: '2026-10-17T00:00:00.000Z',
                base_sha256: 'base',
                result: {
                    outcome: 'proposal',
                    summary: 'A focused candidate.',
                    proposal_id: 'matching-proposal',
                },
            },
        ],
        proposals: [{ proposal_id: 'matching-proposal' }],
    });
    assert.equal(panel.el('view-diff').disabled, false);
    assert.equal(panel.el('view-diff').textContent, 'View proposed diff');
    assert.equal(panel.el('tab-compare').disabled, false);
    assert.match(panel.el('diff-status').textContent, /separate exact approval/);
    let received;
    panel.acceptIncoming = async (value) => {
        received = value.proposal_id;
    };
    await panel.openCurrentDiff();
    assert.equal(received, 'matching-proposal');
    assert.equal(panel.el('workflow-status').focused, true);
    assert.equal(panel.el('approval').checked, false);
    received = null;
    await panel.chooseWorkspace('compare');
    assert.equal(
        received,
        'matching-proposal',
        'The diff tab must open the same authoritative proposal',
    );
});

for (const announced of ['new-result-proposal', 'retained-identity']) {
    test('the diff tab reloads current retained state for ' + announced, async () => {
        const panel = workflowView();
        const current = {
            ...panel.proposal,
            proposal_id: announced,
            source_sha256: 'candidate',
            source_state: 'candidate',
            status: 'applied',
        };
        panel.currentDiff = announced;
        panel.el('approval').checked = true;
        const reads = [];
        panel.call = async (name, args) => {
            reads.push(name);
            if (name === 'skill_panel_proposal') {
                assert.equal(args.proposal_id, announced);
                return current;
            }
            assert.equal(name, 'skill_panel_inspect');
            assert.equal(args.skill, current.skill);
            return {
                ...panel.selected,
                text: 'candidate',
                package_sha256: 'candidate',
                description: 'The actual current candidate.',
                files: 1,
                bytes: 9,
            };
        };

        await panel.chooseWorkspace('compare');

        assert.deepEqual(reads, ['skill_panel_proposal', 'skill_panel_inspect']);
        assert.equal(panel.proposal, current, 'Never reopen the previous cached observation');
        assert.equal(panel.el('source').value, 'candidate');
        assert.equal(panel.el('workflow-dialog').open, true);
        assert.equal(panel.el('approval').checked, false);
        assert.equal(panel.el('apply').disabled, true);
    });
}

test('the diff tab preserves an unfinished manual candidate', async () => {
    const panel = workflowView();
    panel.startEditor();
    panel.el('candidate').value = 'An unfinished manual change';
    panel.el('rationale').value = 'A draft rationale';
    panel.currentDiff = 'saved-proposal';
    panel.setWorkspace('overview');
    panel.call = async () => assert.fail('Do not replace an unfinished manual candidate');

    await panel.chooseWorkspace('compare');

    assert.equal(panel.editing, true);
    assert.equal(panel.el('candidate').value, 'An unfinished manual change');
    assert.equal(panel.el('rationale').value, 'A draft rationale');
    assert.equal(panel.el('workflow-dialog').open, true);
});

test('no-candidate reviews and saved older proposals are distinguished without fabricating a diff', () => {
    const panel = workflowView();
    const requests = [
        {
            request_id: 'review',
            created_at: '2026-10-17T00:00:00.000Z',
            base_sha256: 'base',
            result: { outcome: 'no_changes', summary: 'No justified change.', proposal_id: null },
        },
    ];
    panel.renderActivity({ requests, proposals: [] });
    assert.equal(panel.el('view-diff').disabled, true);
    assert.match(panel.el('diff-status').textContent, /returned no candidate/);
    panel.renderActivity({ requests, proposals: [{ proposal_id: 'saved-proposal' }] });
    assert.equal(panel.el('review-outcome').textContent, 'No changes proposed');
    assert.equal(panel.el('view-diff').disabled, false);
    assert.equal(panel.el('view-diff').textContent, 'Open saved diff');
    assert.match(panel.el('diff-status').textContent, /retained proposal/);
});

test('neither diff entrypoint can bypass an unresolved write', async () => {
    const panel = workflowView();
    const retained = panel.proposal;
    panel.currentDiff = 'another-proposal';
    panel.unresolved = { proposal: retained, action: 'apply' };
    panel.acceptIncoming = async () => assert.fail('Do not replace unresolved write identity');
    await panel.openCurrentDiff();
    await panel.chooseWorkspace('compare');
    assert.equal(panel.proposal, retained);
    assert.equal(panel.uncertain, true);
    assert.equal(panel.el('view-diff').disabled, true);
});
