// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import test from "node:test";
import { AggregateIndexError, attachEvolutionRollbackProof, deriveAggregateIndex, queryAggregateIndex, readAggregateIndex, readHistorySummary, readEvolutionEvents, readSkillChanges, rebuildAggregateIndex, recordEvolutionEvent, syncAggregateIndex } from '../../../.agents/skills/skills-catalog-index/scripts/aggregate_index.mjs';
import { AggregateCatalogRepository } from '../../../src/repository/AggregateCatalogRepository.ts';

const HELPER = fileURLToPath(new URL("../../../.agents/skills/skills-catalog-index/scripts/aggregate_index.mjs", import.meta.url));

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aggregate-index-test-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}

function catalog(skills) { return { schema_version: 1, skills }; }
function skill(name, tags = ["example"]) {
    return { name, path: `.agents/skills/${name}`, description: `Use ${name} for a synthetic fixture.`, tags };
}
function writeCatalog(root, value) {
    fs.mkdirSync(root, { recursive: true });
    const filename = path.join(root, "skills-catalog.json");
    fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
    return filename;
}

function source(id, filename) { return `${id}=${filename}`; }

function eventPackage(role, name, digest) {
    return {
        role,
        source_id: "alpha",
        name,
        path: `skills/${name}`,
        revision: `${role}-revision-${name}`,
        content_sha256: digest,
    };
}

function rollbackProof(packages, suffix = "fixture") {
    const distinct = [...new Map(packages.map(item => [`${item.source_id}\0${item.name}\0${item.path}`, item])).values()];
    const names = [...new Map(packages.map(item => [`${item.source_id}\0${item.name}`, item])).values()];
    return {
        system_excluded: true,
        packages: distinct.map(item => ({
            source_id: item.source_id,
            name: item.name,
            path: item.path,
            method: "package-bytes",
            artifact_ref: `rollback/${suffix}/${item.name}`,
            artifact_sha256: "d".repeat(64),
            verification_command: `node verify-${suffix}.mjs`,
            verification_status: "passed",
            verified_at: "2026-09-15T00:59:00.000Z",
            verification_details: "Synthetic package bytes matched the recorded digest.",
        })),
        link_worktree_map: names.map(item => ({
            source_id: item.source_id,
            name: item.name,
            host_path: null,
            link_target: null,
            canonical_worktree: "/synthetic/worktree",
            canonical_revision: `fixture-revision-${item.name}`,
        })),
    };
}

function evolutionEvent(action, packages, suffix = action) {
    const isCreate = action === "create";
    const isRetire = action === "retire";
    return {
        schema_version: 2,
        event_key: `2026-09-15:${suffix}`,
        run_id: 1,
        occurred_at: "2026-09-15T01:00:00.000Z",
        action,
        status: "validated",
        reason: `Synthetic ${action} evidence.`,
        before: isCreate ? null : { state: "before" },
        after: isRetire ? null : { state: "after" },
        snapshot_ref: "snapshot:synthetic-before",
        rollback_instruction: "Restore the recorded source package revision and verify the catalog.",
        packages,
        files: [{ path: `skills/${suffix}/SKILL.md`, before_sha256: isCreate ? null : "a".repeat(64), after_sha256: isRetire ? null : "b".repeat(64) }],
        evidence: [{ kind: "fixture", reference: `evidence:${suffix}`, sha256: "c".repeat(64), note: "Synthetic bounded evidence." }],
        validations: [{ name: "synthetic validation", status: "passed", observed_at: "2026-09-15T01:00:00.000Z", details: "Passed in a disposable fixture." }],
        rollback_proof: rollbackProof(packages, suffix),
    };
}

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

test("aggregate queries cap results and accept a smaller explicit limit", async t => {
    const root = fixture(t);
    const sources = [];
    for (let group = 0; group < 5; group += 1) {
        const id = `group-${group}`;
        const skills = Array.from({ length: 256 }, (_, number) =>
            skill(`skill-${group}-${String(number).padStart(3, "0")}`, ["common"]));
        sources.push(source(id, writeCatalog(path.join(root, id), catalog(skills))));
    }
    const result = await rebuildAggregateIndex({
        sources, output: path.join(root, "out"), sqliteLoader: unavailableSqlite,
    });
    assert.equal((await queryAggregateIndex(result.index, { tag: "common", sqliteLoader: unavailableSqlite })).length, 1000);
    assert.equal((await queryAggregateIndex(result.index, { tag: "common", limit: 7, sqliteLoader: unavailableSqlite })).length, 7);
    await assert.rejects(() => queryAggregateIndex(result.index, {
        tag: "common", limit: 1001, sqliteLoader: unavailableSqlite,
    }), /limit must be an integer/);
});

test("aggregate sources accept equals signs in paths and reject duplicate JSON fields", async t => {
    const root = fixture(t);
    const filename = writeCatalog(path.join(root, "team=a"), catalog([skill("example-skill")]));
    const result = await rebuildAggregateIndex({
        sources: [source("team", filename)], output: path.join(root, "out"), sqliteLoader: unavailableSqlite,
    });
    assert.equal(result.skills, 1);
    assert.equal((await new AggregateCatalogRepository().check(result.index, [source("team", filename)])).matches, true);
    fs.writeFileSync(filename, '{"schema_version":1,"skills":[],"skills":[]}');
    assert.throws(() => deriveAggregateIndex([{ id: "team", filename }]), /duplicate JSON field/);
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

test("SQLite sync migrates legacy v1 history without resetting it", async t => {
    const root = fixture(t);
    const alpha = writeCatalog(path.join(root, "alpha"), catalog([skill("alpha-skill", ["alpha"])]));
    const output = path.join(root, "out");
    const baseline = await rebuildAggregateIndex({
        sources: [source("alpha", alpha)], output, format: "sqlite", observedAt: "2026-09-14T20:00:00.000Z",
    });
    const database = new DatabaseSync(baseline.index);
    database.exec(`DROP TABLE evolution_event_link_worktrees;
    DROP TABLE evolution_event_rollback_packages;
    DROP TABLE evolution_event_validations;
    DROP TABLE evolution_event_evidence;
    DROP TABLE evolution_event_files;
    DROP TABLE evolution_event_packages;
    DROP TABLE evolution_events;
    DROP TABLE schema_migrations;
    DELETE FROM metadata WHERE key = 'database_schema_version';`);
    database.close();

    await syncAggregateIndex({
        sources: [source("alpha", alpha)], output, format: "sqlite", observedAt: "2026-09-14T21:00:00.000Z",
    });
    const history = await readHistorySummary(baseline.index);
    assert.deepEqual(history.map(item => item.observed_at), ["2026-09-14T21:00:00.000Z", "2026-09-14T20:00:00.000Z"]);
    const migrated = new DatabaseSync(baseline.index, { readOnly: true });
    assert.equal(migrated.prepare("SELECT value FROM metadata WHERE key = 'database_schema_version'").get().value, "3");
    assert.deepEqual(migrated.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all().map(row => ({ ...row })), [
        { version: 1, name: "aggregate-history" },
        { version: 2, name: "skill-evolution-events" },
        { version: 3, name: "skill-evolution-rollback-proof" },
    ]);
    migrated.close();
});

test("SQLite sync migrates v2 evolution events without losing legacy rows", async t => {
    const root = fixture(t);
    const alpha = writeCatalog(path.join(root, "alpha"), catalog([skill("alpha-skill", ["alpha"])]));
    const result = await rebuildAggregateIndex({
        sources: [source("alpha", alpha)], output: path.join(root, "out"), format: "sqlite", observedAt: "2026-09-15T00:00:00.000Z",
    });
    const event = evolutionEvent("update", [
        eventPackage("source", "alpha-skill", "a".repeat(64)),
        eventPackage("target", "alpha-skill", "b".repeat(64)),
    ], "v2-preserved");
    await recordEvolutionEvent(result.index, event);
    const database = new DatabaseSync(result.index);
    database.exec(`DELETE FROM evolution_event_link_worktrees;
    DELETE FROM evolution_event_rollback_packages;
    UPDATE evolution_events SET system_excluded = 0;
    DROP TABLE evolution_event_link_worktrees;
    DROP TABLE evolution_event_rollback_packages;
    ALTER TABLE evolution_events DROP COLUMN system_excluded;
    DELETE FROM schema_migrations WHERE version = 3;
    UPDATE metadata SET value = '2' WHERE key = 'database_schema_version';`);
    database.close();

    await syncAggregateIndex({
        sources: [source("alpha", alpha)], output: path.join(root, "out"), format: "sqlite", observedAt: "2026-09-15T01:00:00.000Z",
    });
    const migrated = await readEvolutionEvents(result.index, { eventKey: "2026-09-15:v2-preserved" });
    assert.equal(migrated.length, 1);
    assert.equal(migrated[0].schema_version, 1);
    assert.equal("rollback_proof" in migrated[0], false);
    const version = new DatabaseSync(result.index, { readOnly: true });
    assert.equal(version.prepare("SELECT value FROM metadata WHERE key = 'database_schema_version'").get().value, "3");
    version.close();
});

test("evolution ledger records every operation shape and returns complete evidence", async t => {
    const root = fixture(t);
    const alpha = writeCatalog(path.join(root, "alpha"), catalog([skill("alpha-skill", ["alpha"])]));
    const result = await rebuildAggregateIndex({
        sources: [source("alpha", alpha)], output: path.join(root, "out"), format: "sqlite", observedAt: "2026-09-15T00:00:00.000Z",
    });
    const sourceA = eventPackage("source", "source-a", "a".repeat(64));
    const sourceB = eventPackage("source", "source-b", "b".repeat(64));
    const targetA = eventPackage("target", "target-a", "c".repeat(64));
    const targetB = eventPackage("target", "target-b", "d".repeat(64));
    const cases = [
        evolutionEvent("rename", [sourceA, targetA]),
        evolutionEvent("merge", [sourceA, sourceB, targetA]),
        evolutionEvent("split", [sourceA, targetA, targetB]),
        evolutionEvent("create", [targetA]),
        evolutionEvent("retire", [sourceA]),
        evolutionEvent("update", [sourceA, targetA]),
        evolutionEvent("relink", [sourceA, targetA]),
    ];
    for (const value of cases) await recordEvolutionEvent(result.index, value);
    const events = await readEvolutionEvents(result.index);
    assert.equal(events.length, cases.length);
    assert.deepEqual(new Set(events.map(item => item.action)), new Set(["rename", "merge", "split", "create", "retire", "update", "relink"]));
    const merge = (await readEvolutionEvents(result.index, { eventKey: "2026-09-15:merge" }))[0];
    assert.equal(merge.run_id, 1);
    assert.equal(merge.packages.filter(item => item.role === "source").length, 2);
    assert.equal(merge.packages.filter(item => item.role === "target").length, 1);
    assert.deepEqual(merge.before, { state: "before" });
    assert.deepEqual(merge.after, { state: "after" });
    assert.equal(merge.files[0].before_sha256, "a".repeat(64));
    assert.equal(merge.evidence[0].kind, "fixture");
    assert.equal(merge.validations[0].status, "passed");
    assert.equal(merge.schema_version, 2);
    assert.equal(merge.rollback_proof.system_excluded, true);
    assert.equal(merge.rollback_proof.packages.length, 3);
    assert.equal(merge.rollback_proof.link_worktree_map.length, 3);
    assert.equal((await readEvolutionEvents(result.index, { action: "split" })).length, 1);
    assert.equal((await readEvolutionEvents(result.index, { packageName: "source-b" })).length, 1);
});

test("evolution ledger backfills one verified rollback proof on a legacy event", async t => {
    const root = fixture(t);
    const alpha = writeCatalog(path.join(root, "alpha"), catalog([skill("alpha-skill", ["alpha"])]));
    const result = await rebuildAggregateIndex({
        sources: [source("alpha", alpha)], output: path.join(root, "out"), format: "sqlite", observedAt: "2026-09-15T00:00:00.000Z",
    });
    const packages = [
        eventPackage("source", "alpha-skill", "a".repeat(64)),
        eventPackage("target", "alpha-skill", "b".repeat(64)),
    ];
    const value = evolutionEvent("update", packages, "legacy-proof");
    await recordEvolutionEvent(result.index, value);
    const database = new DatabaseSync(result.index);
    const eventId = database.prepare("SELECT id FROM evolution_events WHERE event_key = ?").get(value.event_key).id;
    database.prepare("DELETE FROM evolution_event_link_worktrees WHERE event_id = ?").run(eventId);
    database.prepare("DELETE FROM evolution_event_rollback_packages WHERE event_id = ?").run(eventId);
    database.prepare("UPDATE evolution_events SET system_excluded = 0 WHERE id = ?").run(eventId);
    database.close();

    const legacy = await readEvolutionEvents(result.index, { eventKey: value.event_key });
    assert.equal(legacy[0].schema_version, 1);
    const proofRecord = { schema_version: 1, event_key: value.event_key, rollback_proof: rollbackProof(packages, "legacy-proof") };
    await attachEvolutionRollbackProof(result.index, proofRecord);
    const proved = await readEvolutionEvents(result.index, { eventKey: value.event_key });
    assert.equal(proved[0].schema_version, 2);
    assert.equal(proved[0].rollback_proof.packages[0].verification_status, "passed");
    const beforeDuplicate = fs.readFileSync(result.index);
    await assert.rejects(() => attachEvolutionRollbackProof(result.index, proofRecord), /already has rollback proof/);
    assert.deepEqual(fs.readFileSync(result.index), beforeDuplicate);
});

test("evolution ledger rejects duplicate and invalid events without changing database bytes", async t => {
    const root = fixture(t);
    const alpha = writeCatalog(path.join(root, "alpha"), catalog([skill("alpha-skill", ["alpha"])]));
    const result = await rebuildAggregateIndex({
        sources: [source("alpha", alpha)], output: path.join(root, "out"), format: "sqlite", observedAt: "2026-09-15T00:00:00.000Z",
    });
    const valid = evolutionEvent("update", [
        eventPackage("source", "alpha-skill", "a".repeat(64)),
        eventPackage("target", "alpha-skill", "b".repeat(64)),
    ]);
    await recordEvolutionEvent(result.index, valid);
    const beforeDuplicate = fs.readFileSync(result.index);
    await assert.rejects(() => recordEvolutionEvent(result.index, valid), /already exists/);
    assert.deepEqual(fs.readFileSync(result.index), beforeDuplicate);

    const invalid = evolutionEvent("merge", [eventPackage("source", "alpha-skill", "a".repeat(64))], "invalid-merge");
    const beforeInvalid = fs.readFileSync(result.index);
    await assert.rejects(() => recordEvolutionEvent(result.index, invalid), /invalid source and target package cardinality/);
    assert.deepEqual(fs.readFileSync(result.index), beforeInvalid);

    const repeated = evolutionEvent("merge", [
        eventPackage("source", "alpha-skill", "a".repeat(64)),
        eventPackage("source", "alpha-skill", "a".repeat(64)),
        eventPackage("target", "merged-skill", "b".repeat(64)),
    ], "repeated-merge");
    await assert.rejects(() => recordEvolutionEvent(result.index, repeated), /identities must be distinct/);
    assert.deepEqual(fs.readFileSync(result.index), beforeInvalid);

    const repeatedFiles = { ...valid, event_key: 'repeated-files', files: [
        { ...valid.files[0], path: 'alpha/SKILL.md' },
        { ...valid.files[0], path: 'alpha\\SKILL.md', after_sha256: 'c'.repeat(64) },
    ] };
    await assert.rejects(() => recordEvolutionEvent(result.index, repeatedFiles), /file paths must be distinct/);
    assert.deepEqual(fs.readFileSync(result.index), beforeInvalid);

    const unsafe = evolutionEvent("update", [
        eventPackage("source", "alpha-skill", "a".repeat(64)),
        eventPackage("target", "alpha-skill", "b".repeat(64)),
    ], "unsafe-system");
    unsafe.files[0].path = "skills/.system/skill-creator/SKILL.md";
    await assert.rejects(() => recordEvolutionEvent(result.index, unsafe), /exclude protected \.system paths/);
    assert.deepEqual(fs.readFileSync(result.index), beforeInvalid);
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

test("aggregate index CLI records and filters structured evolution events", t => {
    const root = fixture(t);
    const alpha = writeCatalog(path.join(root, "alpha"), catalog([skill("alpha-skill", ["alpha"])]));
    const output = path.join(root, "out");
    const rebuild = spawnSync(process.execPath, [HELPER, "rebuild", "--source", source("alpha", alpha), "--output", output, "--format", "sqlite"], { encoding: "utf8" });
    assert.equal(rebuild.status, 0, rebuild.stderr);
    const index = JSON.parse(rebuild.stdout).index;
    const value = evolutionEvent("rename", [
        eventPackage("source", "alpha-skill", "a".repeat(64)),
        eventPackage("target", "renamed-skill", "b".repeat(64)),
    ], "cli-rename");
    const eventFile = path.join(root, "event.json");
    fs.writeFileSync(eventFile, `${JSON.stringify(value, null, 2)}\n`);
    const record = spawnSync(process.execPath, [HELPER, "evolution-record", "--index", index, "--event-file", eventFile], { encoding: "utf8" });
    assert.equal(record.status, 0, record.stderr);
    assert.equal(JSON.parse(record.stdout).event_key, "2026-09-15:cli-rename");
    const database = new DatabaseSync(index);
    const eventId = database.prepare("SELECT id FROM evolution_events WHERE event_key = ?").get(value.event_key).id;
    database.prepare("DELETE FROM evolution_event_link_worktrees WHERE event_id = ?").run(eventId);
    database.prepare("DELETE FROM evolution_event_rollback_packages WHERE event_id = ?").run(eventId);
    database.prepare("UPDATE evolution_events SET system_excluded = 0 WHERE id = ?").run(eventId);
    database.close();
    const proofFile = path.join(root, "proof.json");
    fs.writeFileSync(proofFile, `${JSON.stringify({ schema_version: 1, event_key: value.event_key, rollback_proof: value.rollback_proof }, null, 2)}\n`);
    const prove = spawnSync(process.execPath, [HELPER, "evolution-prove", "--index", index, "--proof-file", proofFile], { encoding: "utf8" });
    assert.equal(prove.status, 0, prove.stderr);
    assert.equal(JSON.parse(prove.stdout).rollback_proof, "attached");
    const listed = spawnSync(process.execPath, [HELPER, "evolution-events", "--index", index, "--action", "rename", "--package", "renamed-skill"], { encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr);
    assert.equal(JSON.parse(listed.stdout)[0].packages[1].revision, "target-revision-renamed-skill");
    assert.equal(JSON.parse(listed.stdout)[0].rollback_proof.system_excluded, true);
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
    const invalid = writeCatalog(path.join(root, "invalid"), { schema_version: 1, skills: [{ name: "bad", path: "elsewhere", description: "Bad", tags: [] }] });
    assert.throws(() => deriveAggregateIndex([{ id: "invalid", filename: invalid }]), /invalid/);
    const valid = writeCatalog(path.join(root, "valid"), catalog([skill("valid-skill", ["valid"])]));
    const result = await rebuildAggregateIndex({ sources: [source("valid", valid)], output: path.join(root, "out"), sqliteLoader: unavailableSqlite });
    await assert.rejects(() => queryAggregateIndex(result.index, { sqliteLoader: unavailableSqlite }), /query needs/);
    await assert.rejects(() => queryAggregateIndex(result.index, { name: "not a slug", sqliteLoader: unavailableSqlite }), /slug/);
});

test("aggregate output rejects source aliases before creating any directories", async t => {
    const root = fixture(t);
    const sourceRoot = path.join(root, "source");
    const filename = writeCatalog(sourceRoot, catalog([skill("alpha-skill")]));
    const alias = path.join(root, "source-alias");
    fs.symlinkSync(sourceRoot, alias);
    for (const operation of [rebuildAggregateIndex, syncAggregateIndex]) {
        for (const output of [path.join(sourceRoot, "nested", "output"), path.join(alias, "nested", "output")]) {
            await assert.rejects(() => operation({ sources: [source("alpha", filename)], output, format: "json" }), /outside source/);
            assert.equal(fs.existsSync(path.join(sourceRoot, "nested")), false);
        }
        await assert.rejects(() => operation({ sources: [source("alpha", path.join(alias, "skills-catalog.json"))], output: path.join(sourceRoot, "nested"), format: "json" }), /outside source/);
        assert.equal(fs.existsSync(path.join(sourceRoot, "nested")), false);
    }
    assert.deepEqual(fs.readdirSync(sourceRoot), ["skills-catalog.json"]);
});

test("aggregate output resolves safe ancestors and refuses a linked destination", async t => {
    const root = fixture(t);
    const filename = writeCatalog(path.join(root, "source"), catalog([skill("alpha-skill")]));
    const safe = path.join(root, "safe");
    fs.mkdirSync(safe);
    const alias = path.join(root, "safe-alias");
    fs.symlinkSync(safe, alias);
    const result = await rebuildAggregateIndex({ sources: [source("alpha", filename)], output: path.join(alias, "nested"), format: "json" });
    assert.equal(result.index, path.join(fs.realpathSync(safe), "nested", "skills-catalog.index.json"));
    await assert.rejects(() => rebuildAggregateIndex({ sources: [source("alpha", filename)], output: alias, format: "json" }), /real directory/);
});
