// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  ProposalError, readProposal, validateProposal,
} from '../.agents/skills/skills-maintenance-scheduling/scripts/validate_proposal.mjs';

const PACKAGE = fileURLToPath(new URL('../.agents/skills/skills-maintenance-scheduling/', import.meta.url));
const EXAMPLES = path.join(PACKAGE, 'examples');

function example(name) {
  return JSON.parse(fs.readFileSync(path.join(EXAMPLES, name), 'utf8'));
}

test('documented scheduling decisions pass the portable contract', () => {
  for (const filename of [
    'existing-scheduler.json',
    'no-scheduler.json',
    'configure-authorized.json',
    'no-recurring-need.json',
  ]) {
    const proposal = readProposal(path.join(EXAMPLES, filename));
    assert.ok(['propose', 'none'].includes(proposal.decision));
  }
});

test('existing and absent scheduler cases preserve proposal-only configuration by default', () => {
  const existing = validateProposal(example('existing-scheduler.json'));
  const absent = validateProposal(example('no-scheduler.json'));
  assert.equal(existing.scheduler.status, 'existing');
  assert.equal(absent.scheduler.status, 'not-found');
  for (const proposal of [existing, absent]) {
    assert.equal(proposal.scheduler.configuration.authorization, 'not-authorized');
    assert.equal(proposal.scheduler.configuration.adapter, null);
    assert.equal(proposal.authority.cadence_grants_authority, false);
  }
});

test('explicit configuration authority requires an existing scheduler, adapter, and receipt', () => {
  const proposal = example('configure-authorized.json');
  assert.equal(validateProposal(proposal).scheduler.configuration.receipt_required, true);

  for (const mutate of [
    (value) => { value.scheduler.status = 'not-found'; value.scheduler.mechanism = null; },
    (value) => { value.scheduler.configuration.adapter = null; },
    (value) => { value.scheduler.configuration.receipt_required = false; },
  ]) {
    const invalid = structuredClone(proposal);
    mutate(invalid);
    assert.throws(() => validateProposal(invalid), ProposalError);
  }
});

test('unbounded targets and moving revisions are rejected', () => {
  const proposal = example('existing-scheduler.json');
  for (const mutate of [
    (value) => { value.target.packages = ['*']; },
    (value) => { value.target.packages = []; },
    (value) => { value.target.revision = 'latest'; },
    (value) => { value.target.revision = 'HEAD'; },
  ]) {
    const invalid = structuredClone(proposal);
    mutate(invalid);
    assert.throws(() => validateProposal(invalid), ProposalError);
  }
});

test('target exclusions cannot contradict the selected package set', () => {
  const proposal = example('existing-scheduler.json');
  proposal.target.exclusions = [proposal.target.packages[0]];
  assert.throws(() => validateProposal(proposal), /must not overlap/);
});

test('time designator requires a duration component', () => {
  const proposal = example('existing-scheduler.json');
  for (const duration of ['P1YT', 'PT', 'P2DT']) {
    proposal.recurrence.cadence.minimum_interval = duration;
    assert.throws(() => validateProposal(proposal), /ISO 8601 duration/);
  }
  proposal.recurrence.cadence.minimum_interval = 'P1YT2H';
  assert.equal(validateProposal(proposal).recurrence.cadence.minimum_interval, 'P1YT2H');
});

test('cadence never grants approval or maintenance side effects', () => {
  const proposal = example('existing-scheduler.json');
  for (const control of [
    'cadence_grants_authority',
    'scheduled_run_can_approve',
    'scheduled_run_can_modify',
    'scheduled_run_can_install',
    'scheduled_run_can_merge',
    'scheduled_run_can_publish',
  ]) {
    const invalid = structuredClone(proposal);
    invalid.authority[control] = true;
    assert.throws(() => validateProposal(invalid), new RegExp(control));
  }
});

test('credential-bearing schedule fields are rejected without exposing their values', () => {
  const proposal = example('existing-scheduler.json');
  for (const field of ['api_token', 'apiToken', 'privateKey']) {
    const invalid = structuredClone(proposal);
    invalid.scheduler.configuration[field] = 'synthetic-value';
    assert.throws(() => validateProposal(invalid), /credential-bearing field/);
  }
  const embedded = structuredClone(proposal);
  embedded.maintenance_goal = `Review ${'sk-proj-' + 'A'.repeat(44)} monthly`;
  assert.throws(() => validateProposal(embedded), /credential-like content/);
});

test('a blocked decision can carry an unresolved target without inventing its identity', () => {
  const blocked = {
    schema_version: 1,
    decision: 'blocked',
    target: null,
    reason: 'The collection has not been identified.',
    required_action: 'Identify the collection and freeze its revision.',
  };
  assert.equal(validateProposal(blocked).target, null);
  assert.throws(() => validateProposal({ ...blocked, decision: 'none', required_action: undefined }),
    ProposalError);
});

test('none is a minimal decision and cannot smuggle a cadence into authorization', () => {
  const proposal = example('no-recurring-need.json');
  proposal.recurrence = { cadence: 'daily' };
  assert.throws(() => validateProposal(proposal), /missing or unexpected fields/);
});

test('the CLI works from an unrelated directory and does not change its package', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maintenance-scheduling-test-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const script = path.join(PACKAGE, 'scripts', 'validate_proposal.mjs');
  const before = fs.readFileSync(script);
  const result = spawnSync(process.execPath, [script, path.join(EXAMPLES, 'existing-scheduler.json')], {
    cwd: temporary,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    valid: true,
    decision: 'propose',
    proposal_id: 'monthly-collection-audit',
    packages: 2,
  });
  assert.deepEqual(fs.readFileSync(script), before);
  assert.deepEqual(fs.readdirSync(temporary), []);
});

test('linked proposal files are rejected', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maintenance-scheduling-link-test-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const link = path.join(temporary, 'proposal.json');
  fs.symlinkSync(path.join(EXAMPLES, 'existing-scheduler.json'), link);
  assert.throws(() => readProposal(link), /regular, non-linked file/);
});

test('duplicate JSON fields and zero-length cadences are rejected', (t) => {
  const proposal = example('existing-scheduler.json');
  proposal.recurrence.cadence.minimum_interval = 'P0D';
  assert.throws(() => validateProposal(proposal), /greater than zero/);

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maintenance-scheduling-json-test-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const filename = path.join(temporary, 'duplicate.json');
  fs.writeFileSync(filename, '{"schema_version":1,"schema_version":1,"decision":"none"}\n');
  assert.throws(() => readProposal(filename), /duplicate JSON field/);
});
