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
  AggregateIndexError, deriveAggregateIndex, queryAggregateIndex, readAggregateIndex, rebuildAggregateIndex,
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
  const filename = path.join(root, "catalog.json");
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
  assert.equal(index.sources[0].catalog_ref, "alpha/catalog.json");
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

test("aggregate index rejects unsafe, malformed, ambiguous, and in-tree output inputs", async t => {
  const root = fixture(t);
  const catalogFile = writeCatalog(path.join(root, "source"), catalog([skill("alpha-skill")]));
  const output = path.join(root, "output");
  await assert.rejects(() => rebuildAggregateIndex({ sources: [source("Alpha", catalogFile)], output, sqliteLoader: unavailableSqlite }), AggregateIndexError);
  await assert.rejects(() => rebuildAggregateIndex({ sources: [source("alpha", catalogFile), source("alpha", catalogFile)], output, sqliteLoader: unavailableSqlite }), /distinct/);
  await assert.rejects(() => rebuildAggregateIndex({ sources: [source("alpha", catalogFile)], output: path.join(root, "source", "index"), sqliteLoader: unavailableSqlite }), /outside source/);
  const linked = path.join(root, "linked.json"); fs.symlinkSync(catalogFile, linked);
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
