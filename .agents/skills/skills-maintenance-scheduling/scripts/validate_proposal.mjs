#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 256 * 1024;
const MAX_PACKAGES = 256;
const MAX_ROUTE_STEPS = 32;
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const MOVING_REVISION = /^(?:\*|head|latest|current|main|master)$/iu;
const SENSITIVE_FIELD = /(?:apikey|credential|password|privatekey|secret|token)/u;

export class ProposalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProposalError';
  }
}

function requireCondition(condition, message) {
  if (!condition) throw new ProposalError(message);
}

function strictJson(bytes) {
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ProposalError('proposal must be valid UTF-8 JSON');
  }
  let cursor = 0;
  const whitespace = () => {
    while (cursor < source.length && /[ \t\r\n]/u.test(source[cursor])) cursor += 1;
  };
  const fail = () => { throw new ProposalError('proposal must be valid bounded JSON'); };
  function string() {
    if (source[cursor] !== '"') fail();
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      if (source[cursor] === '\\') {
        cursor += 2;
        continue;
      }
      if (source[cursor] === '"') {
        cursor += 1;
        try {
          const result = JSON.parse(source.slice(start, cursor));
          requireCondition(result.isWellFormed(), 'proposal contains invalid Unicode');
          return result;
        } catch (error) {
          if (error instanceof ProposalError) throw error;
          fail();
        }
      }
      cursor += 1;
    }
    fail();
  }
  function value(depth) {
    requireCondition(depth <= 64, 'proposal nesting exceeds 64 levels');
    whitespace();
    const character = source[cursor];
    if (character === '"') return string();
    if (character === '{') {
      cursor += 1;
      whitespace();
      const result = {};
      const seen = new Set();
      if (source[cursor] === '}') { cursor += 1; return result; }
      while (cursor < source.length) {
        whitespace();
        const key = string();
        requireCondition(!seen.has(key), 'proposal contains a duplicate JSON field');
        seen.add(key);
        whitespace();
        if (source[cursor] !== ':') fail();
        cursor += 1;
        Object.defineProperty(result, key, {
          value: value(depth + 1), enumerable: true, writable: true, configurable: true,
        });
        whitespace();
        const delimiter = source[cursor];
        cursor += 1;
        if (delimiter === '}') return result;
        if (delimiter !== ',') fail();
      }
      fail();
    }
    if (character === '[') {
      cursor += 1;
      whitespace();
      const result = [];
      if (source[cursor] === ']') { cursor += 1; return result; }
      while (cursor < source.length) {
        result.push(value(depth + 1));
        whitespace();
        const delimiter = source[cursor];
        cursor += 1;
        if (delimiter === ']') return result;
        if (delimiter !== ',') fail();
      }
      fail();
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) {
      if (source.startsWith(literal, cursor)) {
        cursor += literal.length;
        return result;
      }
    }
    const number = source.slice(cursor).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (!number) fail();
    cursor += number[0].length;
    const result = Number(number[0]);
    requireCondition(Number.isFinite(result), 'proposal contains a non-finite number');
    return result;
  }
  const result = value(0);
  whitespace();
  if (cursor !== source.length) fail();
  return result;
}

function exactObject(value, fields, label) {
  requireCondition(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  const keys = Object.keys(value);
  requireCondition(keys.length === fields.length && fields.every((field) => Object.hasOwn(value, field)),
    `${label} has missing or unexpected fields`);
  return value;
}

function text(value, label, limit = 1024) {
  requireCondition(typeof value === 'string' && value.trim() === value && value.length > 0
    && value.length <= limit && value.isWellFormed() && !/[\x00-\x1f\x7f]/u.test(value),
  `${label} must be a nonblank string of at most ${limit} characters`);
  return value;
}

function nullableText(value, label, limit = 1024) {
  if (value === null) return null;
  return text(value, label, limit);
}

function slug(value, label) {
  text(value, label, 64);
  requireCondition(SLUG.test(value), `${label} must be a lowercase ASCII slug`);
  return value;
}

function uniqueStrings(value, label, { max = 64, slugs = false, empty = false } = {}) {
  requireCondition(Array.isArray(value) && value.length <= max && (empty || value.length > 0),
    `${label} must contain ${empty ? `at most ${max}` : `between 1 and ${max}`} items`);
  const result = value.map((item, index) => (slugs ? slug(item, `${label}[${index}]`)
    : text(item, `${label}[${index}]`, 512)));
  requireCondition(new Set(result).size === result.length, `${label} must not contain duplicates`);
  return result;
}

function rejectSensitiveFields(value, location = 'proposal') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitiveFields(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replaceAll(/[^A-Za-z0-9]/gu, '').toLowerCase();
    requireCondition(!SENSITIVE_FIELD.test(normalized), `${location} contains a credential-bearing field`);
    rejectSensitiveFields(child, `${location}.${key}`);
  }
}

function validateTarget(value) {
  exactObject(value, ['collection_id', 'revision', 'packages', 'exclusions'], 'target');
  slug(value.collection_id, 'target.collection_id');
  text(value.revision, 'target.revision', 256);
  requireCondition(!MOVING_REVISION.test(value.revision), 'target.revision must be immutable or content-addressed');
  const packages = uniqueStrings(value.packages, 'target.packages', { max: MAX_PACKAGES, slugs: true });
  requireCondition(!packages.includes('*'), 'target.packages must not contain wildcards');
  uniqueStrings(value.exclusions, 'target.exclusions', { max: MAX_PACKAGES, slugs: true, empty: true });
}

function validateNone(value) {
  exactObject(value, ['schema_version', 'decision', 'target', 'reason'], 'none result');
  validateTarget(value.target);
  text(value.reason, 'reason', 2048);
}

function validateBlocked(value) {
  exactObject(value, ['schema_version', 'decision', 'target', 'reason', 'required_action'], 'blocked result');
  validateTarget(value.target);
  text(value.reason, 'reason', 2048);
  text(value.required_action, 'required_action', 2048);
}

function validateRecurrence(value) {
  exactObject(value, ['rationale', 'cadence', 'trigger'], 'recurrence');
  text(value.rationale, 'recurrence.rationale', 2048);
  exactObject(value.cadence, ['description', 'minimum_interval'], 'recurrence.cadence');
  text(value.cadence.description, 'recurrence.cadence.description', 512);
  text(value.cadence.minimum_interval, 'recurrence.cadence.minimum_interval', 32);
  requireCondition(/^P(?=\d|T\d)(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/u
    .test(value.cadence.minimum_interval), 'recurrence.cadence.minimum_interval must be an ISO 8601 duration');
  requireCondition(/[1-9]/u.test(value.cadence.minimum_interval),
    'recurrence.cadence.minimum_interval must be greater than zero');
  exactObject(value.trigger, ['kind', 'description'], 'recurrence.trigger');
  requireCondition(['calendar', 'event', 'hybrid'].includes(value.trigger.kind),
    'recurrence.trigger.kind must be calendar, event, or hybrid');
  text(value.trigger.description, 'recurrence.trigger.description', 1024);
}

function validateScheduler(value) {
  exactObject(value, ['detection_scope', 'status', 'mechanism', 'executor', 'execution_mode', 'configuration'],
    'scheduler');
  requireCondition(value.detection_scope === 'project-local', 'scheduler.detection_scope must be project-local');
  requireCondition(['existing', 'not-found', 'ambiguous'].includes(value.status),
    'scheduler.status must be existing, not-found, or ambiguous');
  nullableText(value.mechanism, 'scheduler.mechanism', 1024);
  if (value.status === 'existing') requireCondition(value.mechanism !== null,
    'an existing scheduler requires a mechanism description');
  text(value.executor, 'scheduler.executor', 1024);
  requireCondition(['proposal-only', 'read-only-evidence'].includes(value.execution_mode),
    'scheduler.execution_mode must be proposal-only or read-only-evidence');

  const configuration = exactObject(value.configuration,
    ['authorization', 'adapter', 'receipt_required'], 'scheduler.configuration');
  requireCondition(['not-authorized', 'explicitly-authorized'].includes(configuration.authorization),
    'scheduler.configuration.authorization is invalid');
  nullableText(configuration.adapter, 'scheduler.configuration.adapter', 1024);
  requireCondition(typeof configuration.receipt_required === 'boolean',
    'scheduler.configuration.receipt_required must be a boolean');
  if (configuration.authorization === 'explicitly-authorized') {
    requireCondition(value.status === 'existing',
      'explicit configuration authority requires an existing scheduler');
    requireCondition(configuration.adapter !== null,
      'explicit configuration authority requires a verified adapter');
    requireCondition(configuration.receipt_required,
      'explicit configuration authority requires a configuration receipt');
  } else {
    requireCondition(configuration.adapter === null,
      'an unauthorized configuration must not name an adapter');
    requireCondition(!configuration.receipt_required,
      'an unauthorized configuration must not claim a receipt');
  }
}

function validateAuthority(value) {
  const controls = [
    'cadence_grants_authority',
    'scheduled_run_can_approve',
    'scheduled_run_can_modify',
    'scheduled_run_can_install',
    'scheduled_run_can_merge',
    'scheduled_run_can_publish',
  ];
  exactObject(value, ['approval_system', 'approval_owner', ...controls], 'authority');
  text(value.approval_system, 'authority.approval_system', 1024);
  text(value.approval_owner, 'authority.approval_owner', 512);
  for (const control of controls) {
    requireCondition(value[control] === false, `authority.${control} must be false`);
  }
}

function validateRoute(value) {
  requireCondition(Array.isArray(value) && value.length > 0 && value.length <= MAX_ROUTE_STEPS,
    `route must contain between 1 and ${MAX_ROUTE_STEPS} steps`);
  for (const [index, step] of value.entries()) {
    exactObject(step, ['capability', 'action', 'when', 'output', 'required'], `route[${index}]`);
    slug(step.capability, `route[${index}].capability`);
    requireCondition(['propose', 'collect-read-only-evidence'].includes(step.action),
      `route[${index}].action is invalid`);
    text(step.when, `route[${index}].when`, 1024);
    text(step.output, `route[${index}].output`, 512);
    requireCondition(typeof step.required === 'boolean', `route[${index}].required must be a boolean`);
  }
}

function validateEvidence(value) {
  exactObject(value, ['owner', 'destination', 'required'], 'evidence');
  text(value.owner, 'evidence.owner', 512);
  text(value.destination, 'evidence.destination', 1024);
  uniqueStrings(value.required, 'evidence.required', { max: 32 });
}

function validateStop(value) {
  exactObject(value, ['condition', 'on_failure', 'max_runs'], 'stop');
  text(value.condition, 'stop.condition', 1024);
  text(value.on_failure, 'stop.on_failure', 1024);
  requireCondition(Number.isSafeInteger(value.max_runs) && value.max_runs > 0 && value.max_runs <= 10_000,
    'stop.max_runs must be an integer between 1 and 10000');
}

function validateRollback(value) {
  exactObject(value, ['configuration', 'artifacts'], 'rollback');
  text(value.configuration, 'rollback.configuration', 1024);
  text(value.artifacts, 'rollback.artifacts', 1024);
}

function validateProposalVariant(value) {
  exactObject(value, [
    'schema_version', 'decision', 'proposal_id', 'target', 'maintenance_goal', 'recurrence',
    'scheduler', 'authority', 'route', 'evidence', 'stop', 'rollback',
  ], 'proposal');
  slug(value.proposal_id, 'proposal_id');
  validateTarget(value.target);
  text(value.maintenance_goal, 'maintenance_goal', 2048);
  validateRecurrence(value.recurrence);
  validateScheduler(value.scheduler);
  validateAuthority(value.authority);
  validateRoute(value.route);
  validateEvidence(value.evidence);
  validateStop(value.stop);
  validateRollback(value.rollback);
}

export function validateProposal(value) {
  rejectSensitiveFields(value);
  requireCondition(value && typeof value === 'object' && !Array.isArray(value), 'proposal must be an object');
  requireCondition(value.schema_version === 1, 'schema_version must be 1');
  requireCondition(['propose', 'none', 'blocked'].includes(value.decision),
    'decision must be propose, none, or blocked');
  if (value.decision === 'propose') validateProposalVariant(value);
  else if (value.decision === 'none') validateNone(value);
  else validateBlocked(value);
  return value;
}

export function readProposal(filename) {
  requireCondition(typeof filename === 'string' && filename.length > 0, 'proposal path is required');
  const resolved = path.resolve(filename);
  let before;
  try {
    before = fs.lstatSync(resolved, { bigint: true });
  } catch {
    throw new ProposalError('proposal file is missing or unreadable');
  }
  requireCondition(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n,
    'proposal must be one regular, non-linked file');
  requireCondition(before.size <= BigInt(MAX_BYTES), `proposal exceeds ${MAX_BYTES} bytes`);
  let descriptor;
  try {
    descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = fs.fstatSync(descriptor, { bigint: true });
    requireCondition(opened.isFile() && opened.nlink === 1n && opened.dev === before.dev && opened.ino === before.ino
      && opened.size === before.size && opened.mtimeNs === before.mtimeNs, 'proposal changed before reading');
    const bytes = fs.readFileSync(descriptor);
    requireCondition(bytes.length <= MAX_BYTES, `proposal exceeds ${MAX_BYTES} bytes`);
    const after = fs.lstatSync(resolved, { bigint: true });
    requireCondition(after.dev === before.dev && after.ino === before.ino && after.size === before.size
      && after.mtimeNs === before.mtimeNs, 'proposal changed while being read');
    return validateProposal(strictJson(bytes));
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function main(argv) {
  requireCondition(argv.length === 1, 'usage: validate_proposal.mjs <proposal.json>');
  const proposal = readProposal(argv[0]);
  return {
    valid: true,
    decision: proposal.decision,
    proposal_id: proposal.decision === 'propose' ? proposal.proposal_id : null,
    packages: proposal.target.packages.length,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)))}\n`);
  } catch (error) {
    process.stderr.write(`${error.name}: ${error.message}\n`);
    process.exitCode = error instanceof ProposalError ? 1 : 2;
  }
}
