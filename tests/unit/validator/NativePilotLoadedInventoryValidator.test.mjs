// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { NativePilotLoadedInventoryValidator } from '../../../src/validator/NativePilotLoadedInventoryValidator.ts';
import {
    NativePilotInventoryRepository,
    pilotDigest,
} from '../../../src/repository/NativePilotInventoryRepository.ts';

function fixture(t, host = 'codex', pin = 'a') {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'i9-loaded-inventory-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const manifests = {
        plugin_manifest: ['.claude-plugin/plugin.json', Buffer.from('{"name":"synthetic"}\n')],
        mcp_manifest: ['mcp/claude.json', Buffer.from('{"mcpServers":{}}\n')],
        hook_manifest: ['hooks/claude.json', Buffer.from('{"hooks":{}}\n')],
    };
    for (const [path, bytes] of [
        ...Object.values(manifests),
        ['.agents/skills/fixture/SKILL.md', Buffer.from(`Synthetic ${pin} instructions.\n`)],
        [
            '.agents/skills/fixture/references/complete.md',
            Buffer.from(`Complete ${pin} resource.\n`),
        ],
        ['AGENTS.md', Buffer.from('Synthetic contract.\n')],
    ]) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), bytes, { flag: 'wx', mode: 0o600 });
    }
    const aliases = [
        ['.claude/skills', '../.agents/skills'],
        ['.github/skills', '../.agents/skills'],
        ['CLAUDE.md', 'AGENTS.md'],
        ['GEMINI.md', 'AGENTS.md'],
    ];
    for (const [path, target] of aliases) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        symlinkSync(target, join(root, path));
    }
    const source = new NativePilotInventoryRepository().tree(root);
    const transformations =
        host === 'codex'
            ? aliases.map(([path, target]) => ({ kind: 'omitted-repository-alias', path, target }))
            : [];
    const entries = source.entries.filter(
        (entry) => !transformations.some((alias) => alias.path === entry.path),
    );
    const installed = {
        tree_sha256: pilotDigest(JSON.stringify(entries)),
        bytes: source.bytes,
        entries,
    };
    const loaded = {
        process_instance: pilotDigest('synthetic process'),
        source_tree_sha256: source.tree_sha256,
        installed_tree_sha256: installed.tree_sha256,
        inventory_evidence: 'inventory.json',
        transformations,
    };
    const snapshot = {
        schema_version: 1,
        pin,
        source_root: '/pilot/source',
        selected_inventory: source,
        actual_inventory: source,
        ...Object.fromEntries(
            Object.entries(manifests).map(([key, [, bytes]]) => [
                key,
                {
                    bytes: bytes.length,
                    sha256: pilotDigest(bytes),
                    base64: bytes.toString('base64'),
                },
            ]),
        ),
    };
    const envelope =
        host === 'codex'
            ? {
                  schema_version: 1,
                  source_tree_sha256: source.tree_sha256,
                  installed,
                  transformations,
                  independent_worker_fields: ['path', 'kind', 'bytes', 'sha256', 'target'],
                  executable_bits: 'native-adapter-inventory-only',
              }
            : {
                  schema_version: 1,
                  source_root: '/pilot/source',
                  source_tree_sha256: source.tree_sha256,
                  source_before: structuredClone(snapshot),
                  source_after: structuredClone(snapshot),
                  independent_worker_source: [structuredClone(source), structuredClone(source)],
                  native_cache_scope: 'selected-manifest-and-registration-only',
              };
    return {
        root,
        host,
        pin,
        source,
        installed,
        loaded,
        envelope,
        validate: (raw = envelope, selected = source, metadata = loaded) =>
            new NativePilotLoadedInventoryValidator().validate(raw, host, pin, selected, metadata),
    };
}

for (const host of ['codex', 'claude'])
    for (const pin of ['a', 'b'])
        test(`${host} closed envelope and conventional bare inventory bind complete selected ${pin} bytes`, (t) => {
            const f = fixture(t, host, pin);
            assert.deepEqual(f.validate(), f.installed);
            assert.deepEqual(f.validate(f.installed), f.installed);
            assert.equal(f.installed.bytes, f.source.bytes);
            if (host === 'codex')
                assert.equal(f.source.entries.length - f.installed.entries.length, 4);
        });

const codexCases = [
    [
        'unknown field',
        (f) => {
            f.envelope.extra = true;
        },
    ],
    [
        'schema',
        (f) => {
            f.envelope.schema_version = 2;
        },
    ],
    [
        'source digest',
        (f) => {
            f.envelope.source_tree_sha256 = pilotDigest('other');
        },
    ],
    [
        'unsubstantiated executable proof',
        (f) => {
            f.envelope.executable_bits = 'independently-verified';
        },
    ],
    [
        'worker extra field',
        (f) => {
            f.envelope.independent_worker_fields.push('executable');
        },
    ],
    [
        'worker missing field',
        (f) => {
            f.envelope.independent_worker_fields.pop();
        },
    ],
    [
        'worker reordered provenance',
        (f) => {
            f.envelope.independent_worker_fields.reverse();
        },
    ],
    [
        'unknown alias',
        (f) => {
            f.loaded.transformations[0].path = 'unrelated';
        },
    ],
    [
        'duplicate alias',
        (f) => {
            f.loaded.transformations[1] = structuredClone(f.loaded.transformations[0]);
        },
    ],
    [
        'changed alias target',
        (f) => {
            f.loaded.transformations[0].target = 'elsewhere';
        },
    ],
    [
        'transformation unknown field',
        (f) => {
            f.loaded.transformations[0].extra = true;
        },
    ],
    [
        'declared source mismatch',
        (f) => {
            f.loaded.source_tree_sha256 = pilotDigest('other');
        },
    ],
    [
        'declared installed mismatch',
        (f) => {
            f.loaded.installed_tree_sha256 = pilotDigest('other');
        },
    ],
    [
        'envelope transformation mismatch',
        (f) => {
            f.envelope.transformations = [];
        },
    ],
];
for (const [name, change] of codexCases)
    test(`Codex rejects ${name}`, (t) => {
        const f = fixture(t);
        change(f);
        assert.throws(() => f.validate());
    });

const claudeCases = [
    [
        'unknown envelope field',
        (f) => {
            f.envelope.extra = true;
        },
    ],
    [
        'schema',
        (f) => {
            f.envelope.schema_version = 2;
        },
    ],
    [
        'source root',
        (f) => {
            f.envelope.source_root = '/other';
        },
    ],
    [
        'source digest',
        (f) => {
            f.envelope.source_tree_sha256 = pilotDigest('other');
        },
    ],
    [
        'unsupported complete cache claim',
        (f) => {
            f.envelope.native_cache_scope = 'complete-native-cache';
        },
    ],
    [
        'missing worker observation',
        (f) => {
            f.envelope.independent_worker_source.pop();
        },
    ],
    [
        'extra worker observation',
        (f) => {
            f.envelope.independent_worker_source.push(f.source);
        },
    ],
    [
        'snapshot unknown field',
        (f) => {
            f.envelope.source_before.extra = true;
        },
    ],
    [
        'snapshot pin',
        (f) => {
            f.envelope.source_before.pin = 'b';
        },
    ],
    [
        'snapshot root',
        (f) => {
            f.envelope.source_after.source_root = '/other';
        },
    ],
    [
        'manifest unknown field',
        (f) => {
            f.envelope.source_before.plugin_manifest.extra = true;
        },
    ],
    [
        'manifest size',
        (f) => {
            f.envelope.source_before.plugin_manifest.bytes = 1_048_577;
        },
    ],
    [
        'manifest digest',
        (f) => {
            f.envelope.source_after.mcp_manifest.sha256 = pilotDigest('other');
        },
    ],
    [
        'manifest canonical encoding',
        (f) => {
            f.envelope.source_before.hook_manifest.base64 = '!'.repeat(
                f.envelope.source_before.hook_manifest.base64.length,
            );
        },
    ],
];
for (const [name, change] of claudeCases)
    test(`Claude rejects ${name}`, (t) => {
        const f = fixture(t, 'claude');
        change(f);
        assert.throws(() => f.validate());
    });

function rehash(inventory) {
    inventory.tree_sha256 = pilotDigest(JSON.stringify(inventory.entries));
    inventory.bytes = inventory.entries
        .filter((entry) => entry.kind === 'file')
        .reduce((n, entry) => n + entry.bytes, 0);
}
for (const location of ['bare', 'installed', 'source-before', 'source-after', 'worker'])
    for (const mutation of [
        'omitted resource',
        'extra resource',
        'changed resource',
        'extra entry field',
        'duplicate path',
        'entry order',
    ])
        test(`rehashed ${location} ${mutation} remains invalid`, (t) => {
            const f = fixture(
                t,
                ['source-before', 'source-after', 'worker'].includes(location) ? 'claude' : 'codex',
            );
            let raw = f.envelope,
                inventory;
            if (location === 'bare') {
                raw = structuredClone(f.installed);
                inventory = raw;
            } else if (location === 'installed') inventory = f.envelope.installed;
            else if (location === 'worker') inventory = f.envelope.independent_worker_source[1];
            else inventory = f.envelope[location.replace('-', '_')].actual_inventory;
            const index = inventory.entries.findIndex((entry) =>
                entry.path.endsWith('references/complete.md'),
            );
            if (mutation === 'omitted resource') inventory.entries.splice(index, 1);
            if (mutation === 'extra resource') {
                inventory.entries.push({ ...inventory.entries[index], path: 'unrelated.txt' });
                inventory.entries.sort((a, b) => (a.path < b.path ? -1 : 1));
            }
            if (mutation === 'changed resource')
                inventory.entries[index].sha256 = pilotDigest('changed bytes');
            if (mutation === 'extra entry field') inventory.entries[index].extra = true;
            if (mutation === 'duplicate path')
                inventory.entries.splice(index, 0, structuredClone(inventory.entries[index]));
            if (mutation === 'entry order') inventory.entries.reverse();
            rehash(inventory);
            assert.throws(() => f.validate(raw));
        });

test('bare inventory is an explicit closed contract, not an unknown-envelope fallback', (t) => {
    const f = fixture(t);
    assert.throws(() => f.validate({ ...f.installed, source_tree_sha256: f.source.tree_sha256 }));
    assert.throws(() => f.validate({ inventory: f.installed }));
    assert.throws(() => f.validate({ ...f.installed, bytes: f.installed.bytes + 1 }));
});
test('host envelopes cannot be swapped and source pin changes cannot reuse a prior envelope', (t) => {
    const a = fixture(t, 'claude', 'a'),
        b = fixture(t, 'claude', 'b'),
        codex = fixture(t);
    assert.throws(() => a.validate(codex.envelope));
    assert.throws(() => codex.validate(a.envelope));
    assert.throws(() => b.validate(a.envelope));
});
