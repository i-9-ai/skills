#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strictJson, validateCatalogData } from "./catalog_data.mjs";

const SOURCE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_SOURCES = 64;
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_TOTAL_SKILLS = 16_384;
const MAX_INDEX_BYTES = 128 * 1024 * 1024;
const MAX_HISTORY_RUNS = 4_096;
const MAX_HISTORY_CHANGES = 262_144;
const MAX_QUERY_RESULTS = 1_000;
const MAX_EVOLUTION_EVENTS = 65_536;
const MAX_EVENT_BYTES = 256 * 1024;
const FORMAT_VERSION = 1;
const DATABASE_SCHEMA_VERSION = 3;
const CATALOG_FILE = "skills-catalog.json";
const JSON_FILE = "skills-catalog.index.json";
const SQLITE_FILE = "skills-catalog.db";
const EVENT_KEY = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const EVOLUTION_ACTIONS = ["rename", "merge", "split", "create", "retire", "update", "relink"];
const EVOLUTION_STATUSES = ["applied", "validated", "blocked", "rolled-back"];
const VALIDATION_STATUSES = ["passed", "failed", "blocked", "skipped"];
const ROLLBACK_METHODS = ["package-bytes", "reverse-patch"];

export class AggregateIndexError extends Error {
  constructor(message) { super(message); this.name = "AggregateIndexError"; }
}

function requireCondition(value, message) {
  if (!value) throw new AggregateIndexError(message);
}

function requireSlug(value, label) {
  requireCondition(typeof value === "string" && value.length <= 64 && SOURCE_ID.test(value), `${label} must be a lowercase ASCII slug`);
  return value;
}

function regularBytes(filename, label, limit) {
  let before;
  try { before = fs.lstatSync(filename, { bigint: true }); }
  catch { throw new AggregateIndexError(`${label} is missing or unreadable`); }
  requireCondition(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n, `${label} must be one regular, non-linked file`);
  requireCondition(before.size <= BigInt(limit), `${label} exceeds ${limit} bytes`);
  let descriptor;
  try {
    descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = fs.fstatSync(descriptor, { bigint: true });
    requireCondition(opened.isFile() && opened.nlink === 1n && opened.dev === before.dev && opened.ino === before.ino
      && opened.size === before.size && opened.mtimeNs === before.mtimeNs, `${label} changed before reading`);
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    requireCondition(offset === bytes.length, `${label} changed while being read`);
    const after = fs.lstatSync(filename, { bigint: true });
    requireCondition(after.dev === before.dev && after.ino === before.ino && after.size === before.size
      && after.mtimeNs === before.mtimeNs, `${label} changed while being read`);
    return bytes;
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

function parseJson(bytes, label) {
  try { return strictJson(bytes, { maxBytes: MAX_INDEX_BYTES }); }
  catch (error) { throw new AggregateIndexError(`${label} must be valid UTF-8 JSON: ${error.message}`); }
}

function sourceRecord(specification) {
  requireCondition(typeof specification === "string", "source must be text");
  const separator = specification.indexOf("=");
  requireCondition(separator > 0, "source must use source-id=/path/to/skills-catalog.json");
  const id = requireSlug(specification.slice(0, separator), "source id");
  const filename = specification.slice(separator + 1);
  requireCondition(filename.length > 0, "source catalog path is required");
  requireCondition(path.basename(filename) === CATALOG_FILE, `source catalog must be named ${CATALOG_FILE}`);
  return { id, filename };
}

export function readSourceCatalog({ id, filename }) {
  requireSlug(id, "source id");
  requireCondition(typeof filename === "string" && path.basename(filename) === CATALOG_FILE,
    `source catalog must be named ${CATALOG_FILE}`);
  const bytes = regularBytes(filename, `source catalog for ${id}`, MAX_SOURCE_BYTES);
  const value = parseJson(bytes, `source catalog for ${id}`);
  try { validateCatalogData(value); }
  catch (error) { throw new AggregateIndexError(`source catalog for ${id} is invalid: ${error.message}`); }
  return {
    id,
    catalog_ref: `${id}/${CATALOG_FILE}`,
    catalog_sha256: createHash("sha256").update(bytes).digest("hex"),
    skills: value.skills,
  };
}

export function deriveAggregateIndex(sourceSpecifications) {
  requireCondition(Array.isArray(sourceSpecifications) && sourceSpecifications.length > 0 && sourceSpecifications.length <= MAX_SOURCES,
    `provide between 1 and ${MAX_SOURCES} sources`);
  const seen = new Set();
  const sources = sourceSpecifications.map(source => {
    requireCondition(source && typeof source === "object", "source must be an object");
    requireSlug(source.id, "source id");
    requireCondition(!seen.has(source.id), "source ids must be distinct");
    seen.add(source.id);
    return readSourceCatalog(source);
  }).sort((left, right) => left.id.localeCompare(right.id));
  const skills = sources.flatMap(source => source.skills.map(skill => ({ source_id: source.id, ...skill })))
    .sort((left, right) => left.source_id.localeCompare(right.source_id) || left.name.localeCompare(right.name));
  requireCondition(skills.length <= MAX_TOTAL_SKILLS, `aggregate index exceeds ${MAX_TOTAL_SKILLS} skills`);
  return {
    schema_version: FORMAT_VERSION,
    format: "skills-aggregate-index",
    sources: sources.map(({ id, catalog_ref, catalog_sha256, skills: entries }) => ({
      id, catalog_ref, catalog_sha256, skill_count: entries.length,
    })),
    skills,
  };
}

function canonicalBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }

function observedTimestamp(value = new Date().toISOString()) {
  requireCondition(typeof value === "string" && value.length <= 32, "observation time must be an ISO 8601 timestamp");
  const parsed = new Date(value);
  requireCondition(!Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value, "observation time must use canonical UTC ISO 8601 form");
  return value;
}

function boundedText(value, label, maximum, { allowEmpty = false } = {}) {
  requireCondition(typeof value === "string" && value.length <= maximum && (allowEmpty || value.length > 0),
    `${label} must be ${allowEmpty ? "at most" : "between 1 and"} ${maximum} characters`);
  requireCondition(!value.includes("\0"), `${label} must not contain NUL`);
  return value;
}

function logicalPath(value, label) {
  boundedText(value, label, 512);
  const portable = value.replaceAll("\\", "/");
  requireCondition(!path.posix.isAbsolute(portable) && !/^[A-Za-z]:\//.test(portable), `${label} must be relative`);
  requireCondition(portable.split("/").every(part => part.length > 0 && part !== "." && part !== ".."),
    `${label} must not contain empty, current, or parent segments`);
  requireCondition(!portable.split("/").includes(".system"), `${label} must exclude protected .system paths`);
  return portable;
}

function operationalPath(value, label, { nullable = false } = {}) {
  if (value === null && nullable) return null;
  boundedText(value, label, 1_024);
  const portable = value.replaceAll("\\", "/");
  requireCondition(!/(^|\/)skills\/\.system(?:\/|$)/.test(portable), `${label} must exclude protected .system paths`);
  return portable;
}

function digestOrNull(value, label) {
  requireCondition(value === null || value === undefined || (typeof value === "string" && /^[a-f0-9]{64}$/.test(value)),
    `${label} must be a lowercase SHA-256 digest or null`);
  return value ?? null;
}

function canonicalJsonField(value, label, { nullable = true } = {}) {
  if (value === null || value === undefined) {
    requireCondition(nullable, `${label} is required`);
    return null;
  }
  requireCondition(typeof value === "object" && !Array.isArray(value), `${label} must be an object or null`);
  let bytes;
  try { bytes = Buffer.from(JSON.stringify(value), "utf8"); }
  catch { throw new AggregateIndexError(`${label} must be JSON serializable`); }
  requireCondition(bytes.length <= MAX_EVENT_BYTES, `${label} exceeds ${MAX_EVENT_BYTES} bytes`);
  return bytes.toString("utf8");
}

function requireExactKeys(value, expected, label) {
  requireCondition(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  requireCondition(JSON.stringify(actual) === JSON.stringify(wanted), `${label} has unexpected or missing fields`);
}

function normalizedSkill(skill) {
  return {
    name: skill.name,
    path: skill.path,
    description: skill.description,
    tags: [...skill.tags],
  };
}

function skillKey(skill) { return `${skill.source_id}\0${skill.name}`; }

function historyDelta(previousIndex, nextIndex) {
  const previousSources = new Map(previousIndex.sources.map(source => [source.id, source]));
  const nextSources = new Map(nextIndex.sources.map(source => [source.id, source]));
  const sourceIds = [...new Set([...previousSources.keys(), ...nextSources.keys()])].sort();
  const sourceObservations = sourceIds.map(sourceId => {
    const before = previousSources.get(sourceId);
    const after = nextSources.get(sourceId);
    let changeType = "unchanged";
    if (!before) changeType = "added";
    else if (!after) changeType = "removed";
    else if (before.catalog_sha256 !== after.catalog_sha256) changeType = "changed";
    return {
      source_id: sourceId,
      change_type: changeType,
      catalog_ref: (after ?? before).catalog_ref,
      previous_catalog_sha256: before?.catalog_sha256 ?? null,
      catalog_sha256: after?.catalog_sha256 ?? null,
      previous_skill_count: before?.skill_count ?? 0,
      skill_count: after?.skill_count ?? 0,
    };
  });

  const previousSkills = new Map(previousIndex.skills.map(skill => [skillKey(skill), skill]));
  const nextSkills = new Map(nextIndex.skills.map(skill => [skillKey(skill), skill]));
  const keys = [...new Set([...previousSkills.keys(), ...nextSkills.keys()])].sort();
  const skillChanges = [];
  for (const key of keys) {
    const before = previousSkills.get(key);
    const after = nextSkills.get(key);
    const beforeValue = before ? normalizedSkill(before) : null;
    const afterValue = after ? normalizedSkill(after) : null;
    if (beforeValue && afterValue && JSON.stringify(beforeValue) === JSON.stringify(afterValue)) continue;
    skillChanges.push({
      source_id: (after ?? before).source_id,
      name: (after ?? before).name,
      change_type: beforeValue ? (afterValue ? "changed" : "removed") : "added",
      before: beforeValue,
      after: afterValue,
    });
  }
  return { sourceObservations, skillChanges };
}

function prepareOutput(directory, sources) {
  requireCondition(typeof directory === "string" && directory.length > 0, "output directory is required");
  const absolute = path.resolve(directory);
  // Resolve existing ancestors before creating anything. An alias must not hide
  // that a proposed output lives in a source collection.
  let ancestor = absolute;
  const missing = [];
  while (true) {
    try {
      const info = fs.lstatSync(ancestor);
      requireCondition(ancestor !== absolute || !info.isSymbolicLink(), "output directory must be a real directory");
      requireCondition(fs.statSync(ancestor).isDirectory(), "output ancestor must be a directory");
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.unshift(path.basename(ancestor));
      const parent = path.dirname(ancestor);
      requireCondition(parent !== ancestor, "output ancestor is missing");
      ancestor = parent;
    }
  }
  const expected = path.join(fs.realpathSync(ancestor), ...missing);
  ensureOutsideSources(expected, sources);
  try { fs.mkdirSync(absolute, { recursive: true, mode: 0o700 }); }
  catch { throw new AggregateIndexError("output directory cannot be created"); }
  const info = fs.lstatSync(absolute, { bigint: true });
  requireCondition(info.isDirectory() && !info.isSymbolicLink(), "output directory must be a real directory");
  const canonical = fs.realpathSync(absolute);
  requireCondition(canonical === expected, "output directory changed during creation");
  ensureOutsideSources(canonical, sources);
  return canonical;
}

function ensureOutsideSources(output, sources) {
  const normalized = `${path.resolve(output)}${path.sep}`;
  for (const source of sources) {
    const parent = `${fs.realpathSync(path.dirname(source.filename))}${path.sep}`;
    requireCondition(!normalized.startsWith(parent), "output directory must be outside source catalog directories");
  }
}

function optionalRegularBytes(filename, label, limit) {
  try { fs.lstatSync(filename); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw new AggregateIndexError(`${label} is unreadable`);
  }
  return regularBytes(filename, label, limit);
}

function replaceAtomically(filename, bytes, { expectedBytes } = {}) {
  try {
    const previous = fs.lstatSync(filename, { bigint: true });
    requireCondition(previous.isFile() && !previous.isSymbolicLink() && previous.nlink === 1n, "existing index must be one regular, non-linked file");
  } catch (error) { if (!(error instanceof AggregateIndexError) && error.code !== "ENOENT") throw error; else if (error instanceof AggregateIndexError) throw error; }
  const temporary = `${filename}.tmp-${process.pid}-${Date.now()}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
    if (expectedBytes !== undefined) {
      const observed = optionalRegularBytes(filename, "existing index", MAX_INDEX_BYTES);
      requireCondition((expectedBytes === null && observed === null)
        || (Buffer.isBuffer(expectedBytes) && Buffer.isBuffer(observed) && observed.equals(expectedBytes)),
      "existing index changed before replacement");
    }
    fs.renameSync(temporary, filename);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

async function sqliteModule(loader = () => import("node:sqlite")) {
  try {
    const module = await loader();
    requireCondition(typeof module.DatabaseSync === "function", "node:sqlite does not expose DatabaseSync");
    return module;
  } catch (error) {
    if (error instanceof AggregateIndexError) throw error;
    return null;
  }
}

function emptyAggregateIndex() {
  return { schema_version: FORMAT_VERSION, format: "skills-aggregate-index", sources: [], skills: [] };
}

const V1_SCHEMA_CHECKSUM = createHash("sha256").update("skills-aggregate-index-database-v1").digest("hex");
const EVOLUTION_SCHEMA_SQL = `
  CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
  CREATE TABLE evolution_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_key TEXT NOT NULL UNIQUE,
    run_id INTEGER NOT NULL,
    occurred_at TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('rename', 'merge', 'split', 'create', 'retire', 'update', 'relink')),
    status TEXT NOT NULL CHECK (status IN ('applied', 'validated', 'blocked', 'rolled-back')),
    reason TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    snapshot_ref TEXT NOT NULL,
    rollback_instruction TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES sync_runs(id)
  );
  CREATE INDEX evolution_events_run ON evolution_events(run_id, id);
  CREATE INDEX evolution_events_action ON evolution_events(action, id);
  CREATE TABLE evolution_event_packages (
    event_id INTEGER NOT NULL,
    ordinal INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('source', 'target')),
    source_id TEXT NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    revision TEXT NOT NULL,
    content_sha256 TEXT,
    PRIMARY KEY (event_id, ordinal),
    FOREIGN KEY (event_id) REFERENCES evolution_events(id) ON DELETE CASCADE
  );
  CREATE INDEX evolution_event_packages_lookup ON evolution_event_packages(source_id, name, event_id);
  CREATE TABLE evolution_event_files (
    event_id INTEGER NOT NULL,
    ordinal INTEGER NOT NULL,
    path TEXT NOT NULL,
    before_sha256 TEXT,
    after_sha256 TEXT,
    PRIMARY KEY (event_id, ordinal),
    FOREIGN KEY (event_id) REFERENCES evolution_events(id) ON DELETE CASCADE
  );
  CREATE TABLE evolution_event_evidence (
    event_id INTEGER NOT NULL,
    ordinal INTEGER NOT NULL,
    kind TEXT NOT NULL,
    reference TEXT NOT NULL,
    sha256 TEXT,
    note TEXT NOT NULL,
    PRIMARY KEY (event_id, ordinal),
    FOREIGN KEY (event_id) REFERENCES evolution_events(id) ON DELETE CASCADE
  );
  CREATE TABLE evolution_event_validations (
    event_id INTEGER NOT NULL,
    ordinal INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'blocked', 'skipped')),
    observed_at TEXT NOT NULL,
    details TEXT NOT NULL,
    PRIMARY KEY (event_id, ordinal),
    FOREIGN KEY (event_id) REFERENCES evolution_events(id) ON DELETE CASCADE
  );`;
const EVOLUTION_SCHEMA_CHECKSUM = createHash("sha256").update(EVOLUTION_SCHEMA_SQL).digest("hex");
const ROLLBACK_PROOF_SCHEMA_SQL = `
  ALTER TABLE evolution_events ADD COLUMN system_excluded INTEGER NOT NULL DEFAULT 0 CHECK (system_excluded IN (0, 1));
  CREATE TABLE evolution_event_rollback_packages (
    event_id INTEGER NOT NULL,
    ordinal INTEGER NOT NULL,
    source_id TEXT NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('package-bytes', 'reverse-patch')),
    artifact_ref TEXT NOT NULL,
    artifact_sha256 TEXT NOT NULL,
    verification_command TEXT NOT NULL,
    verification_status TEXT NOT NULL CHECK (verification_status = 'passed'),
    verified_at TEXT NOT NULL,
    verification_details TEXT NOT NULL,
    PRIMARY KEY (event_id, ordinal),
    FOREIGN KEY (event_id) REFERENCES evolution_events(id) ON DELETE CASCADE
  );
  CREATE INDEX evolution_event_rollback_packages_lookup
    ON evolution_event_rollback_packages(source_id, name, event_id);
  CREATE TABLE evolution_event_link_worktrees (
    event_id INTEGER NOT NULL,
    ordinal INTEGER NOT NULL,
    source_id TEXT NOT NULL,
    name TEXT NOT NULL,
    host_path TEXT,
    link_target TEXT,
    canonical_worktree TEXT,
    canonical_revision TEXT NOT NULL,
    PRIMARY KEY (event_id, ordinal),
    FOREIGN KEY (event_id) REFERENCES evolution_events(id) ON DELETE CASCADE
  );`;
const ROLLBACK_PROOF_SCHEMA_CHECKSUM = createHash("sha256").update(ROLLBACK_PROOF_SCHEMA_SQL).digest("hex");

function databaseSchemaVersion(database) {
  const row = database.prepare("SELECT value FROM metadata WHERE key = 'database_schema_version'").get();
  if (!row) return 1;
  const version = Number(row.value);
  requireCondition(Number.isInteger(version) && version >= 1, "SQLite index has an invalid database schema version");
  return version;
}

function validateMigrationLedger(database, expectedVersion = DATABASE_SCHEMA_VERSION) {
  requireCondition(databaseSchemaVersion(database) === expectedVersion,
    "SQLite index needs migration; run sync, evolution-record, or evolution-prove before reading it");
  const rows = database.prepare("SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version").all();
  requireCondition(rows.length === expectedVersion, "SQLite migration ledger is incomplete");
  requireCondition(rows[0].version === 1 && rows[0].name === "aggregate-history"
    && rows[0].checksum === V1_SCHEMA_CHECKSUM, "SQLite migration ledger has an invalid v1 record");
  requireCondition(rows[1].version === 2 && rows[1].name === "skill-evolution-events"
    && rows[1].checksum === EVOLUTION_SCHEMA_CHECKSUM, "SQLite migration ledger has an invalid v2 record");
  if (expectedVersion >= 3) {
    requireCondition(rows[2].version === 3 && rows[2].name === "skill-evolution-rollback-proof"
      && rows[2].checksum === ROLLBACK_PROOF_SCHEMA_CHECKSUM, "SQLite migration ledger has an invalid v3 record");
  }
  rows.forEach(row => observedTimestamp(row.applied_at));
}

function applySqliteMigrations(database, appliedAt) {
  const version = databaseSchemaVersion(database);
  requireCondition(version <= DATABASE_SCHEMA_VERSION,
    `SQLite index database schema ${version} is newer than supported ${DATABASE_SCHEMA_VERSION}`);
  if (version === DATABASE_SCHEMA_VERSION) {
    validateMigrationLedger(database);
    return [];
  }
  requireCondition(version === 1 || version === 2, `SQLite index cannot migrate database schema ${version}`);
  const timestamp = observedTimestamp(appliedAt);
  database.exec("BEGIN IMMEDIATE");
  try {
    let putMigration;
    if (version === 1) {
      database.exec(EVOLUTION_SCHEMA_SQL);
      putMigration = database.prepare("INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)");
      putMigration.run(1, "aggregate-history", V1_SCHEMA_CHECKSUM, timestamp);
      putMigration.run(2, "skill-evolution-events", EVOLUTION_SCHEMA_CHECKSUM, timestamp);
      database.prepare("INSERT INTO metadata (key, value) VALUES ('database_schema_version', '2')").run();
    } else validateMigrationLedger(database, 2);
    database.exec(ROLLBACK_PROOF_SCHEMA_SQL);
    putMigration ??= database.prepare("INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)");
    putMigration.run(3, "skill-evolution-rollback-proof", ROLLBACK_PROOF_SCHEMA_CHECKSUM, timestamp);
    database.prepare("UPDATE metadata SET value = ? WHERE key = 'database_schema_version'").run(String(DATABASE_SCHEMA_VERSION));
    database.exec("COMMIT");
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch {}
    throw error;
  }
  validateMigrationLedger(database);
  return [
    ...(version === 1 ? [{ version: 2, name: "skill-evolution-events", checksum: EVOLUTION_SCHEMA_CHECKSUM, applied_at: timestamp }] : []),
    { version: 3, name: "skill-evolution-rollback-proof", checksum: ROLLBACK_PROOF_SCHEMA_CHECKSUM, applied_at: timestamp },
  ];
}

function createSqliteSchema(database) {
  database.exec(`PRAGMA journal_mode = DELETE;
    PRAGMA foreign_keys = ON;
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE sources (id TEXT PRIMARY KEY, catalog_ref TEXT NOT NULL, catalog_sha256 TEXT NOT NULL, skill_count INTEGER NOT NULL);
    CREATE TABLE skills (source_id TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, description TEXT NOT NULL, tags_json TEXT NOT NULL, PRIMARY KEY (source_id, name), FOREIGN KEY (source_id) REFERENCES sources(id));
    CREATE INDEX skills_name ON skills(name);
    CREATE INDEX skills_tags ON skills(tags_json);
    CREATE TABLE sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observed_at TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('rebuild', 'sync')),
      source_count INTEGER NOT NULL,
      skill_count INTEGER NOT NULL,
      sources_added INTEGER NOT NULL,
      sources_changed INTEGER NOT NULL,
      sources_unchanged INTEGER NOT NULL,
      sources_removed INTEGER NOT NULL,
      skills_added INTEGER NOT NULL,
      skills_changed INTEGER NOT NULL,
      skills_removed INTEGER NOT NULL
    );
    CREATE TABLE source_observations (
      run_id INTEGER NOT NULL,
      source_id TEXT NOT NULL,
      change_type TEXT NOT NULL CHECK (change_type IN ('added', 'changed', 'unchanged', 'removed')),
      catalog_ref TEXT NOT NULL,
      previous_catalog_sha256 TEXT,
      catalog_sha256 TEXT,
      previous_skill_count INTEGER NOT NULL,
      skill_count INTEGER NOT NULL,
      PRIMARY KEY (run_id, source_id),
      FOREIGN KEY (run_id) REFERENCES sync_runs(id)
    );
    CREATE INDEX source_observations_source ON source_observations(source_id, run_id);
    CREATE TABLE skill_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      source_id TEXT NOT NULL,
      name TEXT NOT NULL,
      change_type TEXT NOT NULL CHECK (change_type IN ('added', 'changed', 'removed')),
      before_json TEXT,
      after_json TEXT,
      FOREIGN KEY (run_id) REFERENCES sync_runs(id)
    );
    CREATE INDEX skill_changes_lookup ON skill_changes(source_id, name, run_id);`);
  const putMetadata = database.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
  putMetadata.run("schema_version", String(FORMAT_VERSION));
  putMetadata.run("format", "skills-aggregate-index");
  putMetadata.run("history", "sqlite-sync-runs");
}

function currentIndexFromDatabase(database) {
  const metadata = Object.fromEntries(database.prepare("SELECT key, value FROM metadata ORDER BY key").all().map(row => [row.key, row.value]));
  requireCondition(Number(metadata.schema_version) === FORMAT_VERSION && metadata.format === "skills-aggregate-index"
    && metadata.history === "sqlite-sync-runs", "SQLite index has an unsupported schema; rebuild it explicitly to start a new history");
  validateMigrationLedger(database);
  const sources = database.prepare("SELECT id, catalog_ref, catalog_sha256, skill_count FROM sources ORDER BY id").all();
  const skills = database.prepare("SELECT source_id, name, path, description, tags_json FROM skills ORDER BY source_id, name").all()
    .map(row => ({ source_id: row.source_id, name: row.name, path: row.path, description: row.description, tags: parseJson(Buffer.from(row.tags_json), "stored skill tags") }));
  return validateIndex({ schema_version: FORMAT_VERSION, format: metadata.format, sources, skills });
}

function writeCurrentIndex(database, index) {
  database.exec("DELETE FROM skills; DELETE FROM sources;");
  const putSource = database.prepare("INSERT INTO sources (id, catalog_ref, catalog_sha256, skill_count) VALUES (?, ?, ?, ?)");
  for (const source of index.sources) putSource.run(source.id, source.catalog_ref, source.catalog_sha256, source.skill_count);
  const putSkill = database.prepare("INSERT INTO skills (source_id, name, path, description, tags_json) VALUES (?, ?, ?, ?, ?)");
  for (const skill of index.skills) putSkill.run(skill.source_id, skill.name, skill.path, skill.description, JSON.stringify(skill.tags));
}

function insertHistory(database, index, delta, mode, observedAt) {
  const existingRuns = Number(database.prepare("SELECT COUNT(*) AS count FROM sync_runs").get().count);
  const existingChanges = Number(database.prepare("SELECT COUNT(*) AS count FROM skill_changes").get().count);
  requireCondition(existingRuns < MAX_HISTORY_RUNS, `SQLite history exceeds ${MAX_HISTORY_RUNS} runs; rebuild explicitly or archive the index`);
  requireCondition(existingChanges + delta.skillChanges.length <= MAX_HISTORY_CHANGES,
    `SQLite history exceeds ${MAX_HISTORY_CHANGES} skill changes; rebuild explicitly or archive the index`);

  const sourceCounts = { added: 0, changed: 0, unchanged: 0, removed: 0 };
  for (const observation of delta.sourceObservations) sourceCounts[observation.change_type] += 1;
  const skillCounts = { added: 0, changed: 0, removed: 0 };
  for (const change of delta.skillChanges) skillCounts[change.change_type] += 1;
  const result = database.prepare(`INSERT INTO sync_runs (
    observed_at, mode, source_count, skill_count, sources_added, sources_changed, sources_unchanged, sources_removed,
    skills_added, skills_changed, skills_removed
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    observedAt, mode, index.sources.length, index.skills.length,
    sourceCounts.added, sourceCounts.changed, sourceCounts.unchanged, sourceCounts.removed,
    skillCounts.added, skillCounts.changed, skillCounts.removed,
  );
  const runId = Number(result.lastInsertRowid);
  const putObservation = database.prepare(`INSERT INTO source_observations (
    run_id, source_id, change_type, catalog_ref, previous_catalog_sha256, catalog_sha256, previous_skill_count, skill_count
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const observation of delta.sourceObservations) {
    putObservation.run(runId, observation.source_id, observation.change_type, observation.catalog_ref,
      observation.previous_catalog_sha256, observation.catalog_sha256, observation.previous_skill_count, observation.skill_count);
  }
  const putChange = database.prepare(`INSERT INTO skill_changes (
    run_id, source_id, name, change_type, before_json, after_json
  ) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const change of delta.skillChanges) {
    putChange.run(runId, change.source_id, change.name, change.change_type,
      change.before === null ? null : JSON.stringify(change.before), change.after === null ? null : JSON.stringify(change.after));
  }
  return {
    run_id: runId,
    observed_at: observedAt,
    sources: sourceCounts,
    skills: skillCounts,
  };
}

function writeSeedFile(filename, bytes) {
  const descriptor = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
}

function writeSqlite(filename, index, DatabaseSync, { mode, observedAt, resetHistory = false }) {
  const temporary = `${filename}.tmp-${process.pid}-${Date.now()}`;
  let database;
  const existingBytes = optionalRegularBytes(filename, "existing SQLite index", MAX_INDEX_BYTES);
  requireCondition(mode === "sync" || existingBytes === null || resetHistory,
    "rebuild would discard SQLite history; pass --reset-history to confirm a new baseline");
  if (mode === "sync" && existingBytes !== null) {
    requireCondition(existingBytes.subarray(0, 16).equals(Buffer.from("SQLite format 3\0", "binary")),
      "sync can preserve history only from a SQLite index");
    writeSeedFile(temporary, existingBytes);
  }
  let summary;
  try {
    database = new DatabaseSync(temporary);
    fs.chmodSync(temporary, 0o600);
    if (existingBytes === null || mode === "rebuild") createSqliteSchema(database);
    applySqliteMigrations(database, observedAt);
    const previousIndex = existingBytes !== null && mode === "sync" ? currentIndexFromDatabase(database) : emptyAggregateIndex();
    const delta = historyDelta(previousIndex, index);
    database.exec("BEGIN IMMEDIATE");
    try {
      summary = insertHistory(database, index, delta, mode, observedAt);
      writeCurrentIndex(database, index);
      database.exec("COMMIT");
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
    database.close(); database = undefined;
    replaceAtomically(filename, regularBytes(temporary, "temporary SQLite index", MAX_INDEX_BYTES), { expectedBytes: existingBytes });
    return summary;
  } finally {
    if (database) database.close();
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

async function writeAggregateIndex({ sources, output, format, sqliteLoader, mode, observedAt, resetHistory }) {
  requireCondition(["auto", "sqlite", "json"].includes(format), "format must be auto, sqlite, or json");
  const parsed = (sources ?? []).map(sourceRecord);
  const index = deriveAggregateIndex(parsed);
  const module = format === "json" ? null : await sqliteModule(sqliteLoader);
  if (format === "sqlite" && module === null) throw new AggregateIndexError("SQLite is unavailable; use format=json or provide Node.js with node:sqlite");
  const timestamp = module ? observedTimestamp(observedAt) : null;
  const directory = prepareOutput(output, parsed);
  const filename = path.join(directory, module ? SQLITE_FILE : JSON_FILE);
  let observation = null;
  if (module) observation = writeSqlite(filename, index, module.DatabaseSync, { mode, observedAt: timestamp, resetHistory });
  else {
    const expectedBytes = optionalRegularBytes(filename, "existing JSON index", MAX_INDEX_BYTES);
    replaceAtomically(filename, canonicalBytes(index), { expectedBytes });
  }
  return {
    format: module ? "sqlite" : "json",
    index: filename,
    sources: index.sources.length,
    skills: index.skills.length,
    history: module !== null,
    ...(observation ? { observation } : {}),
  };
}

export async function rebuildAggregateIndex({ sources, output, format = "auto", sqliteLoader, observedAt, resetHistory = false } = {}) {
  return writeAggregateIndex({ sources, output, format, sqliteLoader, mode: "rebuild", observedAt, resetHistory });
}

export async function syncAggregateIndex({ sources, output, format = "auto", sqliteLoader, observedAt } = {}) {
  return writeAggregateIndex({ sources, output, format, sqliteLoader, mode: "sync", observedAt, resetHistory: false });
}

function validateIndex(value) {
  requireCondition(value && typeof value === "object" && !Array.isArray(value), "aggregate index must be an object");
  requireCondition(value.schema_version === FORMAT_VERSION && value.format === "skills-aggregate-index", "unsupported aggregate index format");
  requireCondition(Array.isArray(value.sources) && Array.isArray(value.skills), "aggregate index must contain sources and skills");
  const sourceIds = new Set();
  for (const source of value.sources) {
    requireCondition(source && typeof source === "object" && Object.keys(source).length === 4, "aggregate source has unexpected fields");
    requireSlug(source.id, "aggregate source id"); requireCondition(!sourceIds.has(source.id), "aggregate source ids must be distinct"); sourceIds.add(source.id);
    requireCondition(source.catalog_ref === `${source.id}/skills-catalog.json`, "aggregate source has invalid catalog reference");
    requireCondition(typeof source.catalog_sha256 === "string" && /^[a-f0-9]{64}$/.test(source.catalog_sha256), "aggregate source has invalid catalog digest");
    requireCondition(Number.isInteger(source.skill_count) && source.skill_count >= 1 && source.skill_count <= 256, "aggregate source has invalid skill count");
  }
  requireCondition(value.skills.length <= MAX_TOTAL_SKILLS, "aggregate index has too many skills");
  let previous = ""; const count = new Map();
  for (const skill of value.skills) {
    requireCondition(skill && typeof skill === "object" && Object.keys(skill).length === 5, "aggregate skill has unexpected fields");
    requireCondition(sourceIds.has(skill.source_id), "aggregate skill names an unknown source");
    try { validateCatalogData({ schema_version: 1, skills: [Object.fromEntries(Object.entries(skill).filter(([key]) => key !== "source_id"))] }); }
    catch (error) { throw new AggregateIndexError(`aggregate skill is invalid: ${error.message}`); }
    const key = `${skill.source_id}\0${skill.name}`;
    requireCondition(key > previous, "aggregate skills must be distinct and sorted"); previous = key;
    count.set(skill.source_id, (count.get(skill.source_id) ?? 0) + 1);
  }
  for (const source of value.sources) requireCondition(count.get(source.id) === source.skill_count, "aggregate source skill count disagrees with skills");
  return value;
}

async function readSqlite(filename, loader) {
  const module = await sqliteModule(loader);
  if (module === null) throw new AggregateIndexError("SQLite index requires Node.js with node:sqlite");
  let database;
  try {
    database = new module.DatabaseSync(filename, { readOnly: true });
    return currentIndexFromDatabase(database);
  } catch (error) {
    if (error instanceof AggregateIndexError) throw error;
    throw new AggregateIndexError(`SQLite index is unreadable: ${error.message}`);
  } finally { if (database) database.close(); }
}

export async function readAggregateIndex(filename, { sqliteLoader } = {}) {
  const absolute = path.resolve(filename);
  const bytes = regularBytes(absolute, "aggregate index", MAX_INDEX_BYTES);
  if (bytes.subarray(0, 16).equals(Buffer.from("SQLite format 3\0", "binary"))) return readSqlite(absolute, sqliteLoader);
  return validateIndex(parseJson(bytes, "aggregate index"));
}

export async function queryAggregateIndex(filename, { name, tag, sourceId, limit, sqliteLoader } = {}) {
  if (name !== undefined) requireSlug(name, "skill name");
  if (tag !== undefined) requireSlug(tag, "skill tag");
  if (sourceId !== undefined) requireSlug(sourceId, "source id");
  requireCondition(name !== undefined || tag !== undefined || sourceId !== undefined, "query needs a name, tag, or source id");
  const maximum = queryLimit(limit, MAX_QUERY_RESULTS);
  const index = await readAggregateIndex(filename, { sqliteLoader });
  const matches = [];
  for (const skill of index.skills) {
    if ((name !== undefined && skill.name !== name) || (tag !== undefined && !skill.tags.includes(tag))
      || (sourceId !== undefined && skill.source_id !== sourceId)) continue;
    matches.push(skill);
    if (matches.length === maximum) break;
  }
  return matches;
}

function queryLimit(value, defaultValue) {
  if (value === undefined) return defaultValue;
  const parsed = typeof value === "number" ? value : Number(value);
  requireCondition(Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_QUERY_RESULTS,
    `limit must be an integer between 1 and ${MAX_QUERY_RESULTS}`);
  return parsed;
}

async function withHistoryDatabase(filename, sqliteLoader, callback) {
  const absolute = path.resolve(filename);
  const bytes = regularBytes(absolute, "aggregate index", MAX_INDEX_BYTES);
  requireCondition(bytes.subarray(0, 16).equals(Buffer.from("SQLite format 3\0", "binary")),
    "history is available only in skills-catalog.db; the JSON fallback retains current state only");
  const module = await sqliteModule(sqliteLoader);
  if (module === null) throw new AggregateIndexError("SQLite history requires Node.js with node:sqlite");
  let database;
  try {
    database = new module.DatabaseSync(absolute, { readOnly: true });
    currentIndexFromDatabase(database);
    return callback(database);
  } catch (error) {
    if (error instanceof AggregateIndexError) throw error;
    throw new AggregateIndexError(`SQLite history is unreadable: ${error.message}`);
  } finally { if (database) database.close(); }
}

function validateHistoryRun(row) {
  requireCondition(Number.isInteger(row.run_id) && row.run_id >= 1, "history contains an invalid run id");
  observedTimestamp(row.observed_at);
  requireCondition(["rebuild", "sync"].includes(row.mode), "history contains an invalid run mode");
  for (const field of ["source_count", "skill_count", "sources_added", "sources_changed", "sources_unchanged",
    "sources_removed", "skills_added", "skills_changed", "skills_removed"]) {
    requireCondition(Number.isInteger(row[field]) && row[field] >= 0, `history contains an invalid ${field}`);
  }
  return row;
}

function validDigestOrNull(value, label) {
  requireCondition(value === null || (typeof value === "string" && /^[a-f0-9]{64}$/.test(value)), `${label} is invalid`);
  return value;
}

function validateSourceHistory(row, sourceId) {
  validateHistoryRun(row);
  requireCondition(["added", "changed", "unchanged", "removed"].includes(row.source_change), "history contains an invalid source change");
  requireCondition(row.catalog_ref === `${sourceId}/${CATALOG_FILE}`, "history contains an invalid source catalog reference");
  validDigestOrNull(row.previous_catalog_sha256, "historical previous catalog digest");
  validDigestOrNull(row.catalog_sha256, "historical catalog digest");
  requireCondition(Number.isInteger(row.previous_skill_count) && row.previous_skill_count >= 0 && row.previous_skill_count <= 256,
    "history contains an invalid previous source skill count");
  requireCondition(Number.isInteger(row.source_skill_count) && row.source_skill_count >= 0 && row.source_skill_count <= 256,
    "history contains an invalid source skill count");
  requireCondition((row.source_change === "added" && row.previous_catalog_sha256 === null && row.catalog_sha256 !== null)
    || (row.source_change === "changed" && row.previous_catalog_sha256 !== null && row.catalog_sha256 !== null
      && row.previous_catalog_sha256 !== row.catalog_sha256)
    || (row.source_change === "unchanged" && row.previous_catalog_sha256 !== null
      && row.previous_catalog_sha256 === row.catalog_sha256)
    || (row.source_change === "removed" && row.previous_catalog_sha256 !== null && row.catalog_sha256 === null),
  "history contains inconsistent source digests");
  requireCondition((row.source_change === "added" && row.previous_skill_count === 0 && row.source_skill_count >= 1)
    || (row.source_change === "changed" && row.previous_skill_count >= 1 && row.source_skill_count >= 1)
    || (row.source_change === "unchanged" && row.previous_skill_count === row.source_skill_count && row.source_skill_count >= 1)
    || (row.source_change === "removed" && row.previous_skill_count >= 1 && row.source_skill_count === 0),
  "history contains inconsistent source skill counts");
  return row;
}

function parseHistoricalSkill(value, label, name) {
  if (value === null) return null;
  const parsed = parseJson(Buffer.from(value), label);
  try { validateCatalogData({ schema_version: 1, skills: [parsed] }); }
  catch (error) { throw new AggregateIndexError(`${label} is invalid: ${error.message}`); }
  requireCondition(parsed.name === name, `${label} names a different skill`);
  return parsed;
}

export async function readHistorySummary(filename, { sourceId, limit, sqliteLoader } = {}) {
  if (sourceId !== undefined) requireSlug(sourceId, "source id");
  const boundedLimit = queryLimit(limit, 20);
  return withHistoryDatabase(filename, sqliteLoader, database => {
    const columns = `r.id AS run_id, r.observed_at, r.mode, r.source_count, r.skill_count,
      r.sources_added, r.sources_changed, r.sources_unchanged, r.sources_removed,
      r.skills_added, r.skills_changed, r.skills_removed`;
    if (sourceId === undefined) {
      return database.prepare(`SELECT ${columns} FROM sync_runs r ORDER BY r.id DESC LIMIT ?`).all(boundedLimit).map(validateHistoryRun);
    }
    return database.prepare(`SELECT ${columns}, o.change_type AS source_change, o.catalog_ref,
      o.previous_catalog_sha256, o.catalog_sha256, o.previous_skill_count, o.skill_count AS source_skill_count
      FROM sync_runs r JOIN source_observations o ON o.run_id = r.id
      WHERE o.source_id = ? ORDER BY r.id DESC LIMIT ?`).all(sourceId, boundedLimit)
      .map(row => validateSourceHistory(row, sourceId));
  });
}

export async function readSkillChanges(filename, { sourceId, name, limit, sqliteLoader } = {}) {
  if (sourceId !== undefined) requireSlug(sourceId, "source id");
  if (name !== undefined) requireSlug(name, "skill name");
  const boundedLimit = queryLimit(limit, 50);
  return withHistoryDatabase(filename, sqliteLoader, database => {
    const conditions = [];
    const parameters = [];
    if (sourceId !== undefined) { conditions.push("c.source_id = ?"); parameters.push(sourceId); }
    if (name !== undefined) { conditions.push("c.name = ?"); parameters.push(name); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = database.prepare(`SELECT c.id, c.run_id, r.observed_at, c.source_id, c.name, c.change_type,
      c.before_json, c.after_json FROM skill_changes c JOIN sync_runs r ON r.id = c.run_id
      ${where} ORDER BY c.id DESC LIMIT ?`).all(...parameters, boundedLimit);
    return rows.map(row => {
      requireSlug(row.source_id, "historical source id");
      requireSlug(row.name, "historical skill name");
      requireCondition(Number.isInteger(row.id) && row.id >= 1 && Number.isInteger(row.run_id) && row.run_id >= 1,
        "history contains an invalid change identity");
      observedTimestamp(row.observed_at);
      requireCondition(["added", "changed", "removed"].includes(row.change_type), "history contains an invalid skill change");
      const before = parseHistoricalSkill(row.before_json, "stored before state", row.name);
      const after = parseHistoricalSkill(row.after_json, "stored after state", row.name);
      requireCondition((row.change_type === "added" && before === null && after !== null)
        || (row.change_type === "changed" && before !== null && after !== null && JSON.stringify(before) !== JSON.stringify(after))
        || (row.change_type === "removed" && before !== null && after === null),
      "history contains inconsistent before and after states");
      return {
        id: row.id,
        run_id: row.run_id,
        observed_at: row.observed_at,
        source_id: row.source_id,
        name: row.name,
        change_type: row.change_type,
        before,
        after,
      };
    });
  });
}

function packageIdentity(item) { return `${item.source_id}\0${item.name}\0${item.path}`; }

function validateRollbackProof(value, packages, label = "rollback_proof") {
  requireExactKeys(value, ["system_excluded", "packages", "link_worktree_map"], label);
  requireCondition(value.system_excluded === true, `${label}.system_excluded must be true`);
  requireCondition(Array.isArray(value.packages) && value.packages.length >= 1 && value.packages.length <= 128,
    `${label}.packages must contain between 1 and 128 entries`);
  const rollbackPackages = value.packages.map((item, index) => {
    const itemLabel = `${label}.packages[${index}]`;
    requireExactKeys(item, ["source_id", "name", "path", "method", "artifact_ref", "artifact_sha256",
      "verification_command", "verification_status", "verified_at", "verification_details"], itemLabel);
    requireSlug(item.source_id, `${itemLabel}.source_id`);
    requireSlug(item.name, `${itemLabel}.name`);
    const packagePath = logicalPath(item.path, `${itemLabel}.path`);
    requireCondition(ROLLBACK_METHODS.includes(item.method), `${itemLabel}.method must be one of ${ROLLBACK_METHODS.join(", ")}`);
    const artifactRef = operationalPath(item.artifact_ref, `${itemLabel}.artifact_ref`);
    const artifactSha256 = digestOrNull(item.artifact_sha256, `${itemLabel}.artifact_sha256`);
    requireCondition(artifactSha256 !== null, `${itemLabel}.artifact_sha256 is required`);
    boundedText(item.verification_command, `${itemLabel}.verification_command`, 2_048);
    requireCondition(item.verification_status === "passed", `${itemLabel}.verification_status must be passed`);
    observedTimestamp(item.verified_at);
    boundedText(item.verification_details, `${itemLabel}.verification_details`, 2_048);
    return { ...item, path: packagePath, artifact_ref: artifactRef, artifact_sha256: artifactSha256 };
  });
  const participants = new Set(packages.map(packageIdentity));
  const proofIdentities = rollbackPackages.map(packageIdentity);
  requireCondition(new Set(proofIdentities).size === proofIdentities.length, `${label}.packages must be distinct`);
  requireCondition(proofIdentities.length === participants.size && proofIdentities.every(identity => participants.has(identity)),
    `${label}.packages must prove every distinct participating package`);

  requireCondition(Array.isArray(value.link_worktree_map) && value.link_worktree_map.length >= 1
    && value.link_worktree_map.length <= 128, `${label}.link_worktree_map must contain between 1 and 128 entries`);
  const linkWorktreeMap = value.link_worktree_map.map((item, index) => {
    const itemLabel = `${label}.link_worktree_map[${index}]`;
    requireExactKeys(item, ["source_id", "name", "host_path", "link_target", "canonical_worktree", "canonical_revision"], itemLabel);
    requireSlug(item.source_id, `${itemLabel}.source_id`);
    requireSlug(item.name, `${itemLabel}.name`);
    const hostPath = operationalPath(item.host_path, `${itemLabel}.host_path`, { nullable: true });
    const linkTarget = operationalPath(item.link_target, `${itemLabel}.link_target`, { nullable: true });
    const canonicalWorktree = operationalPath(item.canonical_worktree, `${itemLabel}.canonical_worktree`, { nullable: true });
    requireCondition(hostPath !== null || canonicalWorktree !== null,
      `${itemLabel} must name a host path or canonical worktree`);
    requireCondition((hostPath === null && linkTarget === null) || (hostPath !== null && linkTarget !== null),
      `${itemLabel}.host_path and link_target must both be null or both be set`);
    boundedText(item.canonical_revision, `${itemLabel}.canonical_revision`, 256);
    return { ...item, host_path: hostPath, link_target: linkTarget, canonical_worktree: canonicalWorktree };
  });
  const participatingNames = new Set(packages.map(item => `${item.source_id}\0${item.name}`));
  const mappedNames = linkWorktreeMap.map(item => `${item.source_id}\0${item.name}`);
  requireCondition(new Set(mappedNames).size === mappedNames.length, `${label}.link_worktree_map entries must be distinct`);
  requireCondition(mappedNames.length === participatingNames.size
    && mappedNames.every(identity => participatingNames.has(identity)),
    `${label}.link_worktree_map must match exactly the participating package names`);
  return { system_excluded: true, packages: rollbackPackages, link_worktree_map: linkWorktreeMap };
}

function validateEvolutionEvent(value, { allowLegacy = false } = {}) {
  const legacy = value?.schema_version === 1;
  requireExactKeys(value, legacy
    ? ["schema_version", "event_key", "run_id", "occurred_at", "action", "status", "reason", "before", "after",
      "snapshot_ref", "rollback_instruction", "packages", "files", "evidence", "validations"]
    : ["schema_version", "event_key", "run_id", "occurred_at", "action", "status", "reason", "before", "after",
      "snapshot_ref", "rollback_instruction", "packages", "files", "evidence", "validations", "rollback_proof"], "evolution event");
  requireCondition(value.schema_version === 2 || (legacy && allowLegacy),
    `evolution event schema_version must be 2${allowLegacy ? " or legacy 1" : ""}`);
  requireCondition(typeof value.event_key === "string" && EVENT_KEY.test(value.event_key),
    "event_key must be 1-128 lowercase ASCII slug, dot, colon, or hyphen characters");
  requireCondition(Number.isInteger(value.run_id) && value.run_id >= 1, "run_id must be a positive integer");
  observedTimestamp(value.occurred_at);
  requireCondition(EVOLUTION_ACTIONS.includes(value.action), `action must be one of ${EVOLUTION_ACTIONS.join(", ")}`);
  requireCondition(EVOLUTION_STATUSES.includes(value.status), `status must be one of ${EVOLUTION_STATUSES.join(", ")}`);
  boundedText(value.reason, "reason", 4_096);
  const beforeJson = canonicalJsonField(value.before, "before");
  const afterJson = canonicalJsonField(value.after, "after");
  boundedText(value.snapshot_ref, "snapshot_ref", 1_024);
  boundedText(value.rollback_instruction, "rollback_instruction", 4_096);

  requireCondition(Array.isArray(value.packages) && value.packages.length >= 1 && value.packages.length <= 128,
    "packages must contain between 1 and 128 entries");
  const packages = value.packages.map((item, index) => {
    requireExactKeys(item, ["role", "source_id", "name", "path", "revision", "content_sha256"], `packages[${index}]`);
    requireCondition(["source", "target"].includes(item.role), `packages[${index}].role must be source or target`);
    requireSlug(item.source_id, `packages[${index}].source_id`);
    requireSlug(item.name, `packages[${index}].name`);
    logicalPath(item.path, `packages[${index}].path`);
    boundedText(item.revision, `packages[${index}].revision`, 256);
    digestOrNull(item.content_sha256, `packages[${index}].content_sha256`);
    return { ...item, path: item.path.replaceAll("\\", "/"), content_sha256: item.content_sha256 ?? null };
  });
  const identities = packages.map(item => `${item.role}\0${item.source_id}\0${item.name}`);
  requireCondition(new Set(identities).size === identities.length,
    "evolution event package roles and identities must be distinct");
  const sourceCount = packages.filter(item => item.role === "source").length;
  const targetCount = packages.filter(item => item.role === "target").length;
  const cardinality = {
    rename: sourceCount === 1 && targetCount === 1,
    merge: sourceCount >= 2 && targetCount === 1,
    split: sourceCount === 1 && targetCount >= 2,
    create: sourceCount === 0 && targetCount >= 1,
    retire: sourceCount >= 1 && targetCount === 0,
    update: sourceCount >= 1 && sourceCount === targetCount,
    relink: sourceCount === 1 && targetCount === 1,
  };
  requireCondition(cardinality[value.action], `${value.action} has invalid source and target package cardinality`);
  if (value.action === "create") requireCondition(beforeJson === null && afterJson !== null, "create needs null before and object after");
  else if (value.action === "retire") requireCondition(beforeJson !== null && afterJson === null, "retire needs object before and null after");
  else requireCondition(beforeJson !== null && afterJson !== null, `${value.action} needs object before and object after`);

  requireCondition(Array.isArray(value.files) && value.files.length >= 1 && value.files.length <= 512,
    "files must contain between 1 and 512 entries");
  const files = value.files.map((item, index) => {
    requireExactKeys(item, ["path", "before_sha256", "after_sha256"], `files[${index}]`);
    const filePath = logicalPath(item.path, `files[${index}].path`);
    const before = digestOrNull(item.before_sha256, `files[${index}].before_sha256`);
    const after = digestOrNull(item.after_sha256, `files[${index}].after_sha256`);
    requireCondition(before !== after, `files[${index}] must change its digest or existence`);
    return { path: filePath, before_sha256: before, after_sha256: after };
  });
  requireCondition(new Set(files.map(item => item.path)).size === files.length,
    "evolution event file paths must be distinct after normalization");

  requireCondition(Array.isArray(value.evidence) && value.evidence.length >= 1 && value.evidence.length <= 256,
    "evidence must contain between 1 and 256 entries");
  const evidence = value.evidence.map((item, index) => {
    requireExactKeys(item, ["kind", "reference", "sha256", "note"], `evidence[${index}]`);
    requireSlug(item.kind, `evidence[${index}].kind`);
    boundedText(item.reference, `evidence[${index}].reference`, 1_024);
    digestOrNull(item.sha256, `evidence[${index}].sha256`);
    boundedText(item.note, `evidence[${index}].note`, 2_048);
    return { ...item, sha256: item.sha256 ?? null };
  });

  requireCondition(Array.isArray(value.validations) && value.validations.length >= 1 && value.validations.length <= 256,
    "validations must contain between 1 and 256 entries");
  const validations = value.validations.map((item, index) => {
    requireExactKeys(item, ["name", "status", "observed_at", "details"], `validations[${index}]`);
    boundedText(item.name, `validations[${index}].name`, 256);
    requireCondition(VALIDATION_STATUSES.includes(item.status),
      `validations[${index}].status must be one of ${VALIDATION_STATUSES.join(", ")}`);
    observedTimestamp(item.observed_at);
    boundedText(item.details, `validations[${index}].details`, 2_048);
    return { ...item };
  });
  if (value.status === "validated") {
    requireCondition(validations.some(item => item.status === "passed")
      && validations.every(item => ["passed", "skipped"].includes(item.status)),
    "a validated event needs a passed validation and no failed or blocked validation");
  }
  if (value.status === "blocked") {
    requireCondition(validations.some(item => ["failed", "blocked"].includes(item.status)),
      "a blocked event needs a failed or blocked validation");
  }
  const rollbackProof = legacy ? null : validateRollbackProof(value.rollback_proof, packages);
  return { ...value, before_json: beforeJson, after_json: afterJson, packages, files, evidence, validations,
    rollback_proof: rollbackProof };
}

function writeMutableSqlite(filename, DatabaseSync, appliedAt, callback) {
  const absolute = path.resolve(filename);
  const existingBytes = regularBytes(absolute, "existing SQLite index", MAX_INDEX_BYTES);
  requireCondition(existingBytes.subarray(0, 16).equals(Buffer.from("SQLite format 3\0", "binary")),
    "evolution events require skills-catalog.db");
  const temporary = `${absolute}.tmp-${process.pid}-${Date.now()}`;
  let database;
  try {
    writeSeedFile(temporary, existingBytes);
    database = new DatabaseSync(temporary);
    fs.chmodSync(temporary, 0o600);
    applySqliteMigrations(database, appliedAt);
    currentIndexFromDatabase(database);
    database.exec("BEGIN IMMEDIATE");
    let result;
    try {
      result = callback(database);
      database.exec("COMMIT");
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
    database.close(); database = undefined;
    replaceAtomically(absolute, regularBytes(temporary, "temporary SQLite index", MAX_INDEX_BYTES), { expectedBytes: existingBytes });
    return result;
  } finally {
    if (database) database.close();
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

function insertRollbackProof(database, eventId, proof) {
  const putRollbackPackage = database.prepare(`INSERT INTO evolution_event_rollback_packages (
    event_id, ordinal, source_id, name, path, method, artifact_ref, artifact_sha256,
    verification_command, verification_status, verified_at, verification_details
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  proof.packages.forEach((item, ordinal) => putRollbackPackage.run(eventId, ordinal, item.source_id, item.name,
    item.path, item.method, item.artifact_ref, item.artifact_sha256, item.verification_command,
    item.verification_status, item.verified_at, item.verification_details));
  const putLinkWorktree = database.prepare(`INSERT INTO evolution_event_link_worktrees (
    event_id, ordinal, source_id, name, host_path, link_target, canonical_worktree, canonical_revision
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  proof.link_worktree_map.forEach((item, ordinal) => putLinkWorktree.run(eventId, ordinal, item.source_id, item.name,
    item.host_path, item.link_target, item.canonical_worktree, item.canonical_revision));
  database.prepare("UPDATE evolution_events SET system_excluded = 1 WHERE id = ?").run(eventId);
}

export async function recordEvolutionEvent(filename, value, { sqliteLoader } = {}) {
  const event = validateEvolutionEvent(value);
  const module = await sqliteModule(sqliteLoader);
  if (module === null) throw new AggregateIndexError("evolution events require Node.js with node:sqlite");
  try {
    return writeMutableSqlite(filename, module.DatabaseSync, event.occurred_at, database => {
      const existingEvents = Number(database.prepare("SELECT COUNT(*) AS count FROM evolution_events").get().count);
      requireCondition(existingEvents < MAX_EVOLUTION_EVENTS,
        `SQLite evolution history exceeds ${MAX_EVOLUTION_EVENTS} events; archive the index before continuing`);
      requireCondition(!database.prepare("SELECT 1 FROM evolution_events WHERE event_key = ?").get(event.event_key),
        `evolution event already exists: ${event.event_key}`);
      requireCondition(database.prepare("SELECT 1 FROM sync_runs WHERE id = ?").get(event.run_id),
        `sync run does not exist: ${event.run_id}`);
      const inserted = database.prepare(`INSERT INTO evolution_events (
        event_key, run_id, occurred_at, action, status, reason, before_json, after_json, snapshot_ref,
        rollback_instruction, system_excluded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        event.event_key, event.run_id, event.occurred_at, event.action, event.status, event.reason,
        event.before_json, event.after_json, event.snapshot_ref, event.rollback_instruction, 0,
      );
      const eventId = Number(inserted.lastInsertRowid);
      const putPackage = database.prepare(`INSERT INTO evolution_event_packages (
        event_id, ordinal, role, source_id, name, path, revision, content_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      event.packages.forEach((item, ordinal) => putPackage.run(eventId, ordinal, item.role, item.source_id,
        item.name, item.path, item.revision, item.content_sha256));
      const putFile = database.prepare(`INSERT INTO evolution_event_files (
        event_id, ordinal, path, before_sha256, after_sha256
      ) VALUES (?, ?, ?, ?, ?)`);
      event.files.forEach((item, ordinal) => putFile.run(eventId, ordinal, item.path, item.before_sha256, item.after_sha256));
      const putEvidence = database.prepare(`INSERT INTO evolution_event_evidence (
        event_id, ordinal, kind, reference, sha256, note
      ) VALUES (?, ?, ?, ?, ?, ?)`);
      event.evidence.forEach((item, ordinal) => putEvidence.run(eventId, ordinal, item.kind, item.reference, item.sha256, item.note));
      const putValidation = database.prepare(`INSERT INTO evolution_event_validations (
        event_id, ordinal, name, status, observed_at, details
      ) VALUES (?, ?, ?, ?, ?, ?)`);
      event.validations.forEach((item, ordinal) => putValidation.run(eventId, ordinal, item.name, item.status, item.observed_at, item.details));
      insertRollbackProof(database, eventId, event.rollback_proof);
      return { id: eventId, event_key: event.event_key, run_id: event.run_id, action: event.action, status: event.status };
    });
  } catch (error) {
    if (error instanceof AggregateIndexError) throw error;
    throw new AggregateIndexError(`SQLite evolution event write failed: ${error.message}`);
  }
}

export async function attachEvolutionRollbackProof(filename, value, { sqliteLoader } = {}) {
  requireExactKeys(value, ["schema_version", "event_key", "rollback_proof"], "evolution rollback proof record");
  requireCondition(value.schema_version === 1, "evolution rollback proof record schema_version must be 1");
  requireCondition(typeof value.event_key === "string" && EVENT_KEY.test(value.event_key), "event key is invalid");
  const module = await sqliteModule(sqliteLoader);
  if (module === null) throw new AggregateIndexError("evolution rollback proof requires Node.js with node:sqlite");
  try {
    return writeMutableSqlite(filename, module.DatabaseSync, new Date().toISOString(), database => {
      const event = database.prepare("SELECT id, system_excluded FROM evolution_events WHERE event_key = ?").get(value.event_key);
      requireCondition(event, `evolution event does not exist: ${value.event_key}`);
      requireCondition(event.system_excluded === 0, `evolution event already has rollback proof: ${value.event_key}`);
      const packages = database.prepare(`SELECT role, source_id, name, path, revision, content_sha256
        FROM evolution_event_packages WHERE event_id = ? ORDER BY ordinal`).all(event.id).map(item => ({ ...item }));
      const proof = validateRollbackProof(value.rollback_proof, packages);
      insertRollbackProof(database, event.id, proof);
      return { id: event.id, event_key: value.event_key, rollback_proof: "attached" };
    });
  } catch (error) {
    if (error instanceof AggregateIndexError) throw error;
    throw new AggregateIndexError(`SQLite evolution rollback proof write failed: ${error.message}`);
  }
}

function parseStoredObject(value, label) {
  if (value === null) return null;
  const parsed = parseJson(Buffer.from(value), label);
  requireCondition(parsed && typeof parsed === "object" && !Array.isArray(parsed), `${label} must be an object`);
  return parsed;
}

export async function readEvolutionEvents(filename, { eventKey, action, packageName, limit, sqliteLoader } = {}) {
  if (eventKey !== undefined) requireCondition(typeof eventKey === "string" && EVENT_KEY.test(eventKey), "event key is invalid");
  if (action !== undefined) requireCondition(EVOLUTION_ACTIONS.includes(action), "evolution action is invalid");
  if (packageName !== undefined) requireSlug(packageName, "package name");
  const boundedLimit = queryLimit(limit, 50);
  return withHistoryDatabase(filename, sqliteLoader, database => {
    const conditions = [];
    const parameters = [];
    if (eventKey !== undefined) { conditions.push("e.event_key = ?"); parameters.push(eventKey); }
    if (action !== undefined) { conditions.push("e.action = ?"); parameters.push(action); }
    if (packageName !== undefined) {
      conditions.push("EXISTS (SELECT 1 FROM evolution_event_packages p WHERE p.event_id = e.id AND p.name = ?)");
      parameters.push(packageName);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const events = database.prepare(`SELECT e.id, e.event_key, e.run_id, e.occurred_at, e.action, e.status,
      e.reason, e.before_json, e.after_json, e.snapshot_ref, e.rollback_instruction, e.system_excluded
      FROM evolution_events e ${where} ORDER BY e.id DESC LIMIT ?`).all(...parameters, boundedLimit);
    const getPackages = database.prepare(`SELECT role, source_id, name, path, revision, content_sha256
      FROM evolution_event_packages WHERE event_id = ? ORDER BY ordinal`);
    const getFiles = database.prepare(`SELECT path, before_sha256, after_sha256
      FROM evolution_event_files WHERE event_id = ? ORDER BY ordinal`);
    const getEvidence = database.prepare(`SELECT kind, reference, sha256, note
      FROM evolution_event_evidence WHERE event_id = ? ORDER BY ordinal`);
    const getValidations = database.prepare(`SELECT name, status, observed_at, details
      FROM evolution_event_validations WHERE event_id = ? ORDER BY ordinal`);
    const getRollbackPackages = database.prepare(`SELECT source_id, name, path, method, artifact_ref, artifact_sha256,
      verification_command, verification_status, verified_at, verification_details
      FROM evolution_event_rollback_packages WHERE event_id = ? ORDER BY ordinal`);
    const getLinkWorktreeMap = database.prepare(`SELECT source_id, name, host_path, link_target, canonical_worktree, canonical_revision
      FROM evolution_event_link_worktrees WHERE event_id = ? ORDER BY ordinal`);
    return events.map(row => {
      const value = {
        schema_version: row.system_excluded === 1 ? 2 : 1,
        event_key: row.event_key,
        run_id: row.run_id,
        occurred_at: row.occurred_at,
        action: row.action,
        status: row.status,
        reason: row.reason,
        before: parseStoredObject(row.before_json, "stored event before state"),
        after: parseStoredObject(row.after_json, "stored event after state"),
        snapshot_ref: row.snapshot_ref,
        rollback_instruction: row.rollback_instruction,
        packages: getPackages.all(row.id).map(item => ({ ...item })),
        files: getFiles.all(row.id).map(item => ({ ...item })),
        evidence: getEvidence.all(row.id).map(item => ({ ...item })),
        validations: getValidations.all(row.id).map(item => ({ ...item })),
        ...(row.system_excluded === 1 ? { rollback_proof: {
          system_excluded: true,
          packages: getRollbackPackages.all(row.id).map(item => ({ ...item })),
          link_worktree_map: getLinkWorktreeMap.all(row.id).map(item => ({ ...item })),
        } } : {}),
      };
      validateEvolutionEvent(value, { allowLegacy: true });
      return { id: row.id, ...value };
    });
  });
}

function parseArguments(argv) {
  const command = argv.shift();
  requireCondition(["rebuild", "sync", "list", "query", "history", "changes", "evolution-record", "evolution-prove", "evolution-events"].includes(command),
    "usage: aggregate_index.mjs rebuild|sync|list|query|history|changes|evolution-record|evolution-prove|evolution-events [options]");
  const options = { sources: [] };
  while (argv.length) {
    const flag = argv.shift();
    if (flag === "--reset-history") { options.resetHistory = true; continue; }
    const value = argv.shift();
    requireCondition(typeof value === "string" && flag?.startsWith("--"), "each option needs a value");
    if (flag === "--source") options.sources.push(value);
    else if (flag === "--output") options.output = value;
    else if (flag === "--index") options.index = value;
    else if (flag === "--format") options.format = value;
    else if (flag === "--name") options.name = value;
    else if (flag === "--tag") options.tag = value;
    else if (flag === "--source-id") options.sourceId = value;
    else if (flag === "--limit") options.limit = value;
    else if (flag === "--event-file") options.eventFile = value;
    else if (flag === "--proof-file") options.proofFile = value;
    else if (flag === "--event-key") options.eventKey = value;
    else if (flag === "--action") options.action = value;
    else if (flag === "--package") options.packageName = value;
    else throw new AggregateIndexError(`unknown option: ${flag}`);
  }
  return { command, options };
}

async function main(argv) {
  const { command, options } = parseArguments([...argv]);
  if (command === "rebuild" || command === "sync") {
    requireCondition(options.sources.length > 0 && options.output && !options.index && !options.name && !options.tag && !options.sourceId && !options.limit
      && !options.eventFile && !options.proofFile && !options.eventKey && !options.action && !options.packageName,
      `${command} needs --source source-id=/skills-catalog.json and --output directory`);
    requireCondition(command === "rebuild" || !options.resetHistory, "--reset-history is valid only with rebuild");
    const input = { sources: options.sources, output: options.output, format: options.format ?? "auto" };
    if (command === "rebuild") return rebuildAggregateIndex({ ...input, resetHistory: options.resetHistory ?? false });
    return syncAggregateIndex(input);
  }
  requireCondition(options.index && options.sources.length === 0 && !options.output && !options.format && !options.resetHistory,
    `${command} needs --index file`);
  if (command === "evolution-record") {
    requireCondition(options.eventFile && !options.proofFile && !options.eventKey && !options.action && !options.packageName && !options.name
      && !options.tag && !options.sourceId && !options.limit, "evolution-record needs --index database and --event-file JSON");
    const event = parseJson(regularBytes(options.eventFile, "evolution event file", MAX_EVENT_BYTES), "evolution event file");
    return recordEvolutionEvent(options.index, event);
  }
  if (command === "evolution-prove") {
    requireCondition(options.proofFile && !options.eventFile && !options.eventKey && !options.action && !options.packageName && !options.name
      && !options.tag && !options.sourceId && !options.limit, "evolution-prove needs --index database and --proof-file JSON");
    const proof = parseJson(regularBytes(options.proofFile, "evolution rollback proof file", MAX_EVENT_BYTES),
      "evolution rollback proof file");
    return attachEvolutionRollbackProof(options.index, proof);
  }
  if (command === "evolution-events") {
    requireCondition(!options.eventFile && !options.proofFile && !options.name && !options.tag && !options.sourceId,
      "evolution-events accepts --event-key, --action, --package, and --limit filters");
    return readEvolutionEvents(options.index, options);
  }
  requireCondition(!options.eventFile && !options.proofFile && !options.eventKey && !options.action && !options.packageName,
    `${command} does not accept evolution event options`);
  if (command === "list") return readAggregateIndex(options.index);
  if (command === "query") {
    return queryAggregateIndex(options.index, options);
  }
  requireCondition(!options.tag, `${command} does not accept --tag`);
  if (command === "history") {
    requireCondition(!options.name, "history does not accept --name; use changes for skill detail");
    return readHistorySummary(options.index, options);
  }
  return readSkillChanges(options.index, options);
}

const isMainModule = process.argv[1] && fs.realpathSync.native(fileURLToPath(import.meta.url))
  === fs.realpathSync.native(process.argv[1]);
if (isMainModule) {
  try { process.stdout.write(`${JSON.stringify(await main(process.argv.slice(2)))}\n`); }
  catch (error) { process.stderr.write(`${error.name}: ${error.message}\n`); process.exitCode = 1; }
}
