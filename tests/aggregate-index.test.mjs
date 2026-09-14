// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  AggregateIndexError, deriveAggregateIndex, queryAggregateIndex, readAggregateIndex, readHistorySummary,
  readSkillChanges, rebuildAggregateIndex, syncAggregateIndex,
} from "../.agents/skills/skills-catalog/scripts/aggregate_index.mjs";

const HELPER = fileURLToPath(new URL("../.agents/skills/skills-catalog/scripts/aggregate_index.mjs", import.meta.url));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aggregate-index-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function catalog(skills) { return { schema_version: 2, skills }; }
function skill(name, tags = ["example"]) {
  return { name, path: `.agents/skills/${name}`, status: "pilot", description: `Use ${name} for a synthetic fixture.`, tags };
}
function writeCatalog(root, value) {
  fs.mkdirSync(root, { recursive: true });
  const filename = path.join(root, "skills-catalog.json");
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
  return filename;
}

function source(id, filename) { return `${id}=${filename}`; }

const unavailableSqlite = async () => { throw new Error("not available in fixture"); };

test("aggregate index derives a stable, source-qualified JSON fallback", async t => {
  const root = fixture(t);
  const alpha = writeCatalog(path.join(root, "alpha"), catalog([skill("alpha-skill", ["alpha", "example"])]));
  const beta = writeCatalog(path.join(root, "beta"), catalog([skill("beta-skill", ["beta"])]));
  const output = path.join(root, "out");
  const result = await rebuildAggregateIndex({ sources: [source("beta", beta), source("alpha", alpha)], output, sqliteLoader: unavailableSqlite });
  assert.equal(result.format, "json"); assert.equal(result.sources, 2); assert.equal(result.skills, 2);
  const index = await readAggregateIndex(result.index, { sqliteLoader: unavailableSqlite });
  assert.deepEqual(index.sources.map(item => item.id), ["alpha", "beta"]);
  assert.deepEqual(index.skills.map(item => `${item.source_id}:${item.name}`), ["alpha:alpha-skill", "beta:beta-skill"]);
  assert.equal(index.sources[0].catalog_ref, "alpha/skills-catalog.json");
  assert.equal(index.sources[0].catalog_sha256, createHash("sha256").update(fs.readFileSync(alpha)).digest("hex"));
  assert.equal(JSON.stringify(index).includes(root), false, "the derived index must not retain source paths");
  assert.deepEqual(await queryAggregateIndex(result.index, { tag: "example", sqliteLoader: unavailableSqlite }), [index.skills[0]]);
});

test("aggregate index uses SQLite when Node provides node:sqlite", async t => {
  const root = fixture(t);
  const alpha = writeCatalog(path.join(root, "alpha"), catalog([skill("alpha-skill", ["alpha"])]));
  const result = await rebuildAggregateIndex({ sources: [source("alpha", alpha)], output: path.join(root, "out"), format: "sqlite" });
  assert.equal(result.format, "sqlite"); assert.equal(path.basename(result.index), "skills-catalog.db");
  assert.deepEqual((await queryAggregateIndex(result.index, { name: "alpha-skill" })).map(item => item.source_id), ["alpha"]);
});

test("SQLite sync retains source observations and normalized skill changes", async t => {
  const root = fixture(t);
  const alpha = writeCatalog(path.join(root, "alpha"), catalog([
    skill("changed-skill", ["before"]), skill("removed-skill", ["removed"]),
  ]));
  const beta = writeCatalog(path.join(root, "beta"), catalog([skill("beta-skill", ["beta"])]));
  const output = path.join(root, "out");
  const baseline = await rebuildAggregateIndex({
    sources: [source("alpha", alpha), source("beta", beta)], output, format: "sqlite", observedAt: "2026-09-14T20:00:00.000Z",
  });
  writeCatalog(path.join(root, "alpha"), catalog([
    skill("added-skill", ["added"]),
    { ...skill("changed-skill", ["after"]), description: "Use changed-skill after a synthetic update." },
  ]));
  const synced = await syncAggregateIndex({
    sources: [source("alpha", alpha)], output, format: "sqlite", observedAt: "2026-09-14T21:00:00.000Z",
  });
  assert.equal(synced.index, baseline.index);
  assert.deepEqual(synced.observation.sources, { added: 0, changed: 1, unchanged: 0, removed: 1 });
  assert.deepEqual(synced.observation.skills, { added: 1, changed: 1, removed: 2 });
  assert.deepEqual((await readAggregateIndex(synced.index)).sources.map(item => item.id), ["alpha"]);

  const history = await readHistorySummary(synced.index);
  assert.deepEqual(history.map(item => item.observed_at), ["2026-09-14T21:00:00.000Z", "2026-09-14T20:00:00.000Z"]);
  assert.equal(history[0].sources_removed, 1);
  const alphaHistory = await readHistorySummary(synced.index, { sourceId: "alpha" });
  assert.equal(alphaHistory[0].source_change, "changed");
  assert.equal(alphaHistory[0].catalog_ref, "alpha/skills-catalog.json");

  const changed = await readSkillChanges(synced.index, { sourceId: "alpha", name: "changed-skill" });
  assert.equal(changed.length, 2);
  assert.equal(changed[0].change_type, "changed");
  assert.deepEqual(changed[0].before.tags, ["before"]);
  assert.deepEqual(changed[0].after.tags, ["after"]);
  assert.equal(JSON.stringify({ history, alphaHistory, changed }).includes(root), false, "history must not retain source paths");

  await syncAggregateIndex({
    sources: [source("alpha", alpha)], output, format: "sqlite", observedAt: "2026-09-14T22:00:00.000Z",
  });
  const repeated = await readHistorySummary(synced.index, { limit: 1 });
  assert.equal(repeated[0].sources_unchanged, 1);
  assert.equal(repeated[0].skills_added + repeated[0].skills_changed + repeated[0].skills_removed, 0);
});

test("rebuild protects existing SQLite history unless reset is explicit", async t => {
  const root = fixture(t);
  const alpha = writeCatalog(path.join(root, "alpha"), catalog([skill("alpha-skill", ["alpha"])]));
  const input = { sources: [source("alpha", alpha)], output: path.join(root, "out"), format: "sqlite" };
  const result = await rebuildAggregateIndex({ ...input, observedAt: "2026-09-14T20:00:00.000Z" });
  await assert.rejects(() => rebuildAggregateIndex({ ...input, observedAt: "2026-09-14T21:00:00.000Z" }), /discard SQLite history/);
  await rebuildAggregateIndex({ ...input, observedAt: "2026-09-14T22:00:00.000Z", resetHistory: true });
  const history = await readHistorySummary(result.index);
  assert.equal(history.length, 1);
  assert.equal(history[0].mode, "rebuild");
  assert.equal(history[0].observed_at, "2026-09-14T22:00:00.000Z");
});

test("JSON fallback remains deterministic current state and refuses history claims", async t => {
  const root = fixture(t);
  const alpha = writeCatalog(path.join(root, "alpha"), catalog([skill("alpha-skill", ["alpha"])]));
  const input = { sources: [source("alpha", alpha)], output: path.join(root, "out"), format: "json", sqliteLoader: unavailableSqlite };
  const first = await rebuildAggregateIndex(input);
  const before = fs.readFileSync(first.index);
  const second = await syncAggregateIndex(input);
  assert.deepEqual(fs.readFileSync(second.index), before);
  assert.equal(second.history, false);
  await assert.rejects(() => readHistorySummary(second.index, { sqliteLoader: unavailableSqlite }), /current state only/);
  await assert.rejects(() => readSkillChanges(second.index, { sqliteLoader: unavailableSqlite }), /current state only/);
});

test("aggregate index CLI synchronizes and supports list and cross-source queries", t => {
  const root = fixture(t);
  const alpha = writeCatalog(path.join(root, "alpha"), catalog([skill("shared-skill", ["shared"])]));
  const beta = writeCatalog(path.join(root, "beta"), catalog([skill("beta-skill", ["beta"]), skill("shared-skill", ["shared"])]));
  const output = path.join(root, "out");
  const sync = spawnSync(process.execPath, [HELPER, "sync", "--source", source("alpha", alpha), "--source", source("beta", beta), "--output", output, "--format", "json"], { encoding: "utf8" });
  assert.equal(sync.status, 0, sync.stderr);
  const rebuilt = JSON.parse(sync.stdout);
  const listed = spawnSync(process.execPath, [HELPER, "list", "--index", rebuilt.index], { encoding: "utf8" });
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(JSON.parse(listed.stdout).skills.length, 3);
  const queried = spawnSync(process.execPath, [HELPER, "query", "--index", rebuilt.index, "--name", "shared-skill"], { encoding: "utf8" });
  assert.equal(queried.status, 0, queried.stderr);
  assert.deepEqual(JSON.parse(queried.stdout).map(item => item.source_id), ["alpha", "beta"]);
});

test("aggregate index CLI exposes SQLite history summaries and change detail", t => {
  const root = fixture(t);
  const alpha = writeCatalog(path.join(root, "alpha"), catalog([skill("alpha-skill", ["alpha"])]));
  const output = path.join(root, "out");
  const rebuild = spawnSync(process.execPath, [HELPER, "rebuild", "--source", source("alpha", alpha), "--output", output, "--format", "sqlite"], { encoding: "utf8" });
  assert.equal(rebuild.status, 0, rebuild.stderr);
  const index = JSON.parse(rebuild.stdout).index;
  writeCatalog(path.join(root, "alpha"), catalog([
    { ...skill("alpha-skill", ["updated"]), description: "Use alpha-skill after a synthetic update." },
  ]));
  const sync = spawnSync(process.execPath, [HELPER, "sync", "--source", source("alpha", alpha), "--output", output, "--format", "sqlite"], { encoding: "utf8" });
  assert.equal(sync.status, 0, sync.stderr);
  const history = spawnSync(process.execPath, [HELPER, "history", "--index", index, "--source-id", "alpha", "--limit", "2"], { encoding: "utf8" });
  assert.equal(history.status, 0, history.stderr);
  assert.equal(JSON.parse(history.stdout)[0].source_change, "changed");
  const changes = spawnSync(process.execPath, [HELPER, "changes", "--index", index, "--name", "alpha-skill"], { encoding: "utf8" });
  assert.equal(changes.status, 0, changes.stderr);
  assert.equal(JSON.parse(changes.stdout)[0].change_type, "changed");
});

test("aggregate index rejects unsafe, malformed, ambiguous, and in-tree output inputs", async t => {
  const root = fixture(t);
  const catalogFile = writeCatalog(path.join(root, "source"), catalog([skill("alpha-skill")]));
  const output = path.join(root, "output");
  await assert.rejects(() => rebuildAggregateIndex({ sources: [source("Alpha", catalogFile)], output, sqliteLoader: unavailableSqlite }), AggregateIndexError);
  await assert.rejects(() => rebuildAggregateIndex({ sources: [source("alpha", catalogFile), source("alpha", catalogFile)], output, sqliteLoader: unavailableSqlite }), /distinct/);
  await assert.rejects(() => rebuildAggregateIndex({ sources: [source("alpha", catalogFile)], output: path.join(root, "source", "index"), sqliteLoader: unavailableSqlite }), /outside source/);
  const generic = path.join(root, "catalog.json"); fs.copyFileSync(catalogFile, generic);
  await assert.rejects(() => rebuildAggregateIndex({ sources: [source("alpha", generic)], output, sqliteLoader: unavailableSqlite }), /must be named skills-catalog\.json/);
  const linkedRoot = path.join(root, "linked"); fs.mkdirSync(linkedRoot);
  const linked = path.join(linkedRoot, "skills-catalog.json"); fs.symlinkSync(catalogFile, linked);
  await assert.rejects(() => rebuildAggregateIndex({ sources: [source("alpha", linked)], output, sqliteLoader: unavailableSqlite }), /regular, non-linked/);
  fs.writeFileSync(catalogFile, "{not json");
  await assert.rejects(() => rebuildAggregateIndex({ sources: [source("alpha", catalogFile)], output, sqliteLoader: unavailableSqlite }), /valid UTF-8 JSON/);
});

test("aggregate indexes only accept validated catalog entries and bounded queries", async t => {
  const root = fixture(t);
  const invalid = writeCatalog(path.join(root, "invalid"), { schema_version: 2, skills: [{ name: "bad", path: "elsewhere", status: "pilot", description: "Bad", tags: [] }] });
  assert.throws(() => deriveAggregateIndex([{ id: "invalid", filename: invalid }]), /invalid/);
  const valid = writeCatalog(path.join(root, "valid"), catalog([skill("valid-skill", ["valid"])]));
  const result = await rebuildAggregateIndex({ sources: [source("valid", valid)], output: path.join(root, "out"), sqliteLoader: unavailableSqlite });
  await assert.rejects(() => queryAggregateIndex(result.index, { sqliteLoader: unavailableSqlite }), /query needs/);
  await assert.rejects(() => queryAggregateIndex(result.index, { name: "not a slug", sqliteLoader: unavailableSqlite }), /slug/);
});
