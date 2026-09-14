#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalogData } from "./catalog_tools.mjs";

const SOURCE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_SOURCES = 64;
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_TOTAL_SKILLS = 16_384;
const MAX_INDEX_BYTES = 128 * 1024 * 1024;
const MAX_HISTORY_RUNS = 4_096;
const MAX_HISTORY_CHANGES = 262_144;
const MAX_QUERY_RESULTS = 1_000;
const FORMAT_VERSION = 2;
const CATALOG_FILE = "skills-catalog.json";
const JSON_FILE = "skills-catalog.index.json";
const SQLITE_FILE = "skills-catalog.db";

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
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new AggregateIndexError(`${label} must be valid UTF-8 JSON`); }
}

function sourceRecord(specification) {
  requireCondition(typeof specification === "string", "source must be text");
  const separator = specification.indexOf("=");
  requireCondition(separator > 0 && separator === specification.lastIndexOf("="), "source must use source-id=/path/to/skills-catalog.json");
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

function normalizedSkill(skill) {
  return {
    name: skill.name,
    path: skill.path,
    status: skill.status,
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

function prepareOutput(directory) {
  requireCondition(typeof directory === "string" && directory.length > 0, "output directory is required");
  const absolute = path.resolve(directory);
  try { fs.mkdirSync(absolute, { recursive: true, mode: 0o700 }); }
  catch { throw new AggregateIndexError("output directory cannot be created"); }
  const info = fs.lstatSync(absolute, { bigint: true });
  requireCondition(info.isDirectory() && !info.isSymbolicLink(), "output directory must be a real directory");
  return absolute;
}

function ensureOutsideSources(output, sources) {
  const normalized = `${path.resolve(output)}${path.sep}`;
  for (const source of sources) {
    const parent = `${path.resolve(path.dirname(source.filename))}${path.sep}`;
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

function createSqliteSchema(database) {
  database.exec(`PRAGMA journal_mode = DELETE;
    PRAGMA foreign_keys = ON;
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE sources (id TEXT PRIMARY KEY, catalog_ref TEXT NOT NULL, catalog_sha256 TEXT NOT NULL, skill_count INTEGER NOT NULL);
    CREATE TABLE skills (source_id TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, tags_json TEXT NOT NULL, PRIMARY KEY (source_id, name), FOREIGN KEY (source_id) REFERENCES sources(id));
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
  const sources = database.prepare("SELECT id, catalog_ref, catalog_sha256, skill_count FROM sources ORDER BY id").all();
  const skills = database.prepare("SELECT source_id, name, path, status, description, tags_json FROM skills ORDER BY source_id, name").all()
    .map(row => ({ source_id: row.source_id, name: row.name, path: row.path, status: row.status, description: row.description, tags: parseJson(Buffer.from(row.tags_json), "stored skill tags") }));
  return validateIndex({ schema_version: FORMAT_VERSION, format: metadata.format, sources, skills });
}

function writeCurrentIndex(database, index) {
  database.exec("DELETE FROM skills; DELETE FROM sources;");
  const putSource = database.prepare("INSERT INTO sources (id, catalog_ref, catalog_sha256, skill_count) VALUES (?, ?, ?, ?)");
  for (const source of index.sources) putSource.run(source.id, source.catalog_ref, source.catalog_sha256, source.skill_count);
  const putSkill = database.prepare("INSERT INTO skills (source_id, name, path, status, description, tags_json) VALUES (?, ?, ?, ?, ?, ?)");
  for (const skill of index.skills) putSkill.run(skill.source_id, skill.name, skill.path, skill.status, skill.description, JSON.stringify(skill.tags));
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
  const directory = prepareOutput(output);
  ensureOutsideSources(directory, parsed);
  const module = format === "json" ? null : await sqliteModule(sqliteLoader);
  if (format === "sqlite" && module === null) throw new AggregateIndexError("SQLite is unavailable; use format=json or provide Node.js with node:sqlite");
  const filename = path.join(directory, module ? SQLITE_FILE : JSON_FILE);
  let observation = null;
  if (module) observation = writeSqlite(filename, index, module.DatabaseSync, { mode, observedAt: observedTimestamp(observedAt), resetHistory });
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
    requireCondition(skill && typeof skill === "object" && Object.keys(skill).length === 6, "aggregate skill has unexpected fields");
    requireCondition(sourceIds.has(skill.source_id), "aggregate skill names an unknown source");
    try { validateCatalogData({ schema_version: 2, skills: [Object.fromEntries(Object.entries(skill).filter(([key]) => key !== "source_id"))] }); }
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

export async function queryAggregateIndex(filename, { name, tag, sourceId, sqliteLoader } = {}) {
  if (name !== undefined) requireSlug(name, "skill name");
  if (tag !== undefined) requireSlug(tag, "skill tag");
  if (sourceId !== undefined) requireSlug(sourceId, "source id");
  requireCondition(name !== undefined || tag !== undefined || sourceId !== undefined, "query needs a name, tag, or source id");
  const index = await readAggregateIndex(filename, { sqliteLoader });
  return index.skills.filter(skill => (name === undefined || skill.name === name)
    && (tag === undefined || skill.tags.includes(tag)) && (sourceId === undefined || skill.source_id === sourceId));
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
  try { validateCatalogData({ schema_version: 2, skills: [parsed] }); }
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

function parseArguments(argv) {
  const command = argv.shift();
  requireCondition(["rebuild", "sync", "list", "query", "history", "changes"].includes(command),
    "usage: aggregate_index.mjs rebuild|sync|list|query|history|changes [options]");
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
    else throw new AggregateIndexError(`unknown option: ${flag}`);
  }
  return { command, options };
}

async function main(argv) {
  const { command, options } = parseArguments([...argv]);
  if (command === "rebuild" || command === "sync") {
    requireCondition(options.sources.length > 0 && options.output && !options.index && !options.name && !options.tag && !options.sourceId && !options.limit,
      `${command} needs --source source-id=/skills-catalog.json and --output directory`);
    requireCondition(command === "rebuild" || !options.resetHistory, "--reset-history is valid only with rebuild");
    const input = { sources: options.sources, output: options.output, format: options.format ?? "auto" };
    if (command === "rebuild") return rebuildAggregateIndex({ ...input, resetHistory: options.resetHistory ?? false });
    return syncAggregateIndex(input);
  }
  requireCondition(options.index && options.sources.length === 0 && !options.output && !options.format && !options.resetHistory,
    `${command} needs --index file`);
  if (command === "list") return readAggregateIndex(options.index);
  if (command === "query") {
    requireCondition(!options.limit, "query does not accept --limit");
    return queryAggregateIndex(options.index, options);
  }
  requireCondition(!options.tag, `${command} does not accept --tag`);
  if (command === "history") {
    requireCondition(!options.name, "history does not accept --name; use changes for skill detail");
    return readHistorySummary(options.index, options);
  }
  return readSkillChanges(options.index, options);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { process.stdout.write(`${JSON.stringify(await main(process.argv.slice(2)))}\n`); }
  catch (error) { process.stderr.write(`${error.name}: ${error.message}\n`); process.exitCode = 1; }
}
