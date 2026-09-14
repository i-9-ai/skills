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
const MAX_INDEX_BYTES = 16 * 1024 * 1024;
const FORMAT_VERSION = 1;
const JSON_FILE = "skills-aggregate-index.json";
const SQLITE_FILE = "skills-aggregate-index.sqlite";

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
  requireCondition(separator > 0 && separator === specification.lastIndexOf("="), "source must use source-id=/path/to/catalog.json");
  const id = requireSlug(specification.slice(0, separator), "source id");
  const filename = specification.slice(separator + 1);
  requireCondition(filename.length > 0, "source catalog path is required");
  return { id, filename };
}

export function readSourceCatalog({ id, filename }) {
  requireSlug(id, "source id");
  const bytes = regularBytes(filename, `source catalog for ${id}`, MAX_SOURCE_BYTES);
  const value = parseJson(bytes, `source catalog for ${id}`);
  try { validateCatalogData(value); }
  catch (error) { throw new AggregateIndexError(`source catalog for ${id} is invalid: ${error.message}`); }
  return {
    id,
    catalog_ref: `${id}/catalog.json`,
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

function replaceAtomically(filename, bytes) {
  try {
    const previous = fs.lstatSync(filename, { bigint: true });
    requireCondition(previous.isFile() && !previous.isSymbolicLink() && previous.nlink === 1n, "existing index must be one regular, non-linked file");
  } catch (error) { if (!(error instanceof AggregateIndexError) && error.code !== "ENOENT") throw error; else if (error instanceof AggregateIndexError) throw error; }
  const temporary = `${filename}.tmp-${process.pid}-${Date.now()}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
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

function writeSqlite(filename, index, DatabaseSync) {
  const temporary = `${filename}.tmp-${process.pid}-${Date.now()}`;
  let database;
  try {
    database = new DatabaseSync(temporary);
    database.exec(`PRAGMA journal_mode = DELETE;
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE sources (id TEXT PRIMARY KEY, catalog_ref TEXT NOT NULL, catalog_sha256 TEXT NOT NULL, skill_count INTEGER NOT NULL);
      CREATE TABLE skills (source_id TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, tags_json TEXT NOT NULL, PRIMARY KEY (source_id, name));
      CREATE INDEX skills_name ON skills(name);
      CREATE INDEX skills_tags ON skills(tags_json);`);
    const putMetadata = database.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
    putMetadata.run("schema_version", String(index.schema_version)); putMetadata.run("format", index.format);
    const putSource = database.prepare("INSERT INTO sources (id, catalog_ref, catalog_sha256, skill_count) VALUES (?, ?, ?, ?)");
    for (const source of index.sources) putSource.run(source.id, source.catalog_ref, source.catalog_sha256, source.skill_count);
    const putSkill = database.prepare("INSERT INTO skills (source_id, name, path, status, description, tags_json) VALUES (?, ?, ?, ?, ?, ?)");
    for (const skill of index.skills) putSkill.run(skill.source_id, skill.name, skill.path, skill.status, skill.description, JSON.stringify(skill.tags));
    database.close(); database = undefined;
    replaceAtomically(filename, regularBytes(temporary, "temporary SQLite index", MAX_INDEX_BYTES));
  } finally {
    if (database) database.close();
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

export async function rebuildAggregateIndex({ sources, output, format = "auto", sqliteLoader } = {}) {
  requireCondition(["auto", "sqlite", "json"].includes(format), "format must be auto, sqlite, or json");
  const parsed = (sources ?? []).map(sourceRecord);
  const index = deriveAggregateIndex(parsed);
  const directory = prepareOutput(output);
  ensureOutsideSources(directory, parsed);
  const module = format === "json" ? null : await sqliteModule(sqliteLoader);
  if (format === "sqlite" && module === null) throw new AggregateIndexError("SQLite is unavailable; use format=json or provide Node.js with node:sqlite");
  const filename = path.join(directory, module ? SQLITE_FILE : JSON_FILE);
  if (module) writeSqlite(filename, index, module.DatabaseSync);
  else replaceAtomically(filename, canonicalBytes(index));
  return { format: module ? "sqlite" : "json", index: filename, sources: index.sources.length, skills: index.skills.length };
}

function validateIndex(value) {
  requireCondition(value && typeof value === "object" && !Array.isArray(value), "aggregate index must be an object");
  requireCondition(value.schema_version === FORMAT_VERSION && value.format === "skills-aggregate-index", "unsupported aggregate index format");
  requireCondition(Array.isArray(value.sources) && Array.isArray(value.skills), "aggregate index must contain sources and skills");
  const sourceIds = new Set();
  for (const source of value.sources) {
    requireCondition(source && typeof source === "object" && Object.keys(source).length === 4, "aggregate source has unexpected fields");
    requireSlug(source.id, "aggregate source id"); requireCondition(!sourceIds.has(source.id), "aggregate source ids must be distinct"); sourceIds.add(source.id);
    requireCondition(source.catalog_ref === `${source.id}/catalog.json`, "aggregate source has invalid catalog reference");
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
    const metadata = Object.fromEntries(database.prepare("SELECT key, value FROM metadata ORDER BY key").all().map(row => [row.key, row.value]));
    const sources = database.prepare("SELECT id, catalog_ref, catalog_sha256, skill_count FROM sources ORDER BY id").all();
    const skills = database.prepare("SELECT source_id, name, path, status, description, tags_json FROM skills ORDER BY source_id, name").all()
      .map(row => ({ source_id: row.source_id, name: row.name, path: row.path, status: row.status, description: row.description, tags: JSON.parse(row.tags_json) }));
    return validateIndex({ schema_version: Number(metadata.schema_version), format: metadata.format, sources, skills });
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

function parseArguments(argv) {
  const command = argv.shift();
  requireCondition(["rebuild", "sync", "list", "query"].includes(command), "usage: aggregate_index.mjs rebuild|sync|list|query [options]");
  const options = { sources: [] };
  while (argv.length) {
    const flag = argv.shift(); const value = argv.shift();
    requireCondition(typeof value === "string" && flag?.startsWith("--"), "each option needs a value");
    if (flag === "--source") options.sources.push(value);
    else if (flag === "--output") options.output = value;
    else if (flag === "--index") options.index = value;
    else if (flag === "--format") options.format = value;
    else if (flag === "--name") options.name = value;
    else if (flag === "--tag") options.tag = value;
    else if (flag === "--source-id") options.sourceId = value;
    else throw new AggregateIndexError(`unknown option: ${flag}`);
  }
  return { command, options };
}

async function main(argv) {
  const { command, options } = parseArguments([...argv]);
  if (command === "rebuild" || command === "sync") {
    requireCondition(options.sources.length > 0 && options.output && !options.index && !options.name && !options.tag && !options.sourceId,
      "rebuild needs --source source-id=/catalog.json and --output directory");
    return rebuildAggregateIndex({ sources: options.sources, output: options.output, format: options.format ?? "auto" });
  }
  requireCondition(options.index && options.sources.length === 0 && !options.output && !options.format, `${command} needs --index file only`);
  if (command === "list") return readAggregateIndex(options.index);
  return queryAggregateIndex(options.index, options);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { process.stdout.write(`${JSON.stringify(await main(process.argv.slice(2)))}\n`); }
  catch (error) { process.stderr.write(`${error.name}: ${error.message}\n`); process.exitCode = 1; }
}
