import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
    NativePilotInventoryRepository,
    pilotDigest,
} from '../../src/repository/NativePilotInventoryRepository.ts';
import { NativePilotPreparationService } from '../../src/service/NativePilotPreparationService.ts';

export function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9 native driver fixture-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const inventory = new NativePilotInventoryRepository();
    const put = (path, content) => {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, { flag: 'wx', mode: 0o600 });
    };
    const inputs = {};
    for (const pin of ['a', 'b']) {
        const source = join(root, `source_${pin}`);
        inputs[`source_${pin}`] = source;
        for (const path of [
            'LICENSE',
            'NOTICE',
            'package.json',
            'skills-catalog.json',
            'hooks/codex.json',
            'hooks/claude.json',
            'src/transport/PluginHookRunner.ts',
            'src/transport/PluginMcpServer.ts',
            '.agents/plugins/marketplace.json',
            '.claude-plugin/marketplace.json',
        ]) {
            put(join(source, path), `synthetic inert ${path}\n`);
        }
        for (const host of ['codex', 'claude']) {
            put(
                join(source, `.${host}-plugin/plugin.json`),
                JSON.stringify({
                    name: 'i9-skills',
                    skills: './.agents/skills/',
                    hooks: `./hooks/${host}.json`,
                    mcpServers: `./mcp/${host}.json`,
                    version: '0.3.4',
                }),
            );
            put(
                join(source, `mcp/${host}.json`),
                JSON.stringify({ mcpServers: { 'i9-skills': { command: 'synthetic-never-run' } } }),
            );
        }
        put(join(source, '.agents/skills/example/SKILL.md'), `synthetic ${pin}: no execution\n`);
        for (const path of [
            'LICENSE',
            'agents/openai.yaml',
            'assets/icon.svg',
            'assets/icon.png',
            'references/guide.md',
        ]) {
            put(join(source, '.agents/skills/example', path), `synthetic resource ${path}\n`);
        }
        mkdirSync(join(source, '.codex'));
        symlinkSync('../.agents/skills', join(source, '.codex/skills'));
    }
    inputs.driver = join(root, 'driver');
    inputs.observer = join(root, 'observer');
    put(
        join(inputs.driver, 'src/transport/DriverRunner.ts'),
        'throw new Error("fixture must never execute");\n',
    );
    put(
        join(inputs.observer, 'src/transport/NativePilotObserverRunner.ts'),
        'throw new Error("fixture must never execute");\n',
    );
    const binaries = {};
    for (const name of ['node', 'codex', 'claude']) {
        inputs[name] = join(root, `${name}-inert-binary`);
        writeFileSync(inputs[name], `not an executable program: synthetic ${name}\n`, {
            flag: 'wx',
            mode: 0o700,
        });
        binaries[name] = {
            version: name === 'node' ? '24.21.0' : '0.0.1',
            sha256: inventory.file(inputs[name]).sha256,
            platform: 'linux/arm64',
        };
    }
    const contract = {
        schema_version: 2,
        runtime_layout: 'source-ts',
        purpose: 'local-source-a-b-a',
        hosts: ['codex', 'claude'],
        repetitions: 2,
        authority: {
            lane: 'local-container',
            destination: 'synthetic-fixture',
            authorization_sha256: pilotDigest('synthetic authority'),
            retention_destination: 'synthetic-retention',
            retention_authorization_sha256: pilotDigest('synthetic retention'),
            environment_sha256: pilotDigest('synthetic image'),
            platform: 'linux/arm64',
        },
        source_a: {
            revision: 'a'.repeat(40),
            tree_sha256: inventory.tree(inputs.source_a).tree_sha256,
        },
        source_b: {
            revision: 'b'.repeat(40),
            tree_sha256: inventory.tree(inputs.source_b).tree_sha256,
        },
        driver: {
            revision: 'c'.repeat(40),
            tree_sha256: inventory.tree(inputs.driver).tree_sha256,
        },
        observer: {
            revision: 'd'.repeat(40),
            tree_sha256: inventory.tree(inputs.observer).tree_sha256,
            entrypoint: 'src/transport/NativePilotObserverRunner.ts',
        },
        binaries,
        witnesses: [
            {
                path: '.agents/skills/example/SKILL.md',
                a_sha256: inventory.file(join(inputs.source_a, '.agents/skills/example/SKILL.md'))
                    .sha256,
                b_sha256: inventory.file(join(inputs.source_b, '.agents/skills/example/SKILL.md'))
                    .sha256,
            },
        ],
        mcp: {
            codex: { a: 'i9-skills', b: 'i9-skills' },
            claude: { a: 'plugin:i9-skills:i9-skills', b: 'plugin:i9-skills:i9-skills' },
        },
    };
    const prepare = () =>
        new NativePilotPreparationService().prepare(contract, inputs, join(root, 'prepared'));
    return { root, inventory, inputs, contract, prepare, put };
}

export function fakeAdapter(prepared, root, selection, mutate = () => {}) {
    const inventory = new NativePilotInventoryRepository();
    const evidenceRoot = join(prepared.root, 'output', 'evidence');
    const journalParent = join(prepared.root, 'output', 'journal');
    const calls = [];
    let aborts = 0;
    const adapter = {
        mode: 'synthetic',
        driver_tree_sha256: prepared.contract.driver.tree_sha256,
        observer_tree_sha256: prepared.contract.observer.tree_sha256,
        async perform(step) {
            calls.push(step.id);
            const evidence = [];
            for (const kind of [
                'native-log',
                'process',
                'inventory',
                'state',
                'confinement',
                'retention',
            ]) {
                const path = `${step.id}-${kind}.json`;
                const content =
                    kind === 'inventory' &&
                    ['observe-a', 'observe-b', 'observe-restored-a'].includes(step.id)
                        ? step.pin === 'b'
                            ? prepared.trees.source_b
                            : prepared.trees.source_a
                        : { synthetic: true, kind, phase: step.id };
                const file = inventory.writeJson(join(evidenceRoot, path), content);
                evidence.push({ path, ...file, kind });
            }
            const observation = {
                schema_version: 2,
                ...selection,
                phase: step.id,
                mode: 'synthetic',
                processes: step.commands.map(() => ({
                    status: 'completed',
                    exit_code: 0,
                    signal: null,
                })),
                checks: step.checks.map((id) => ({
                    id,
                    satisfied: true,
                    evidence: [evidence[0].path],
                })),
                evidence,
                environment:
                    step.id === 'preflight'
                        ? {
                              instance_sha256: pilotDigest(`instance ${selection.run_id}`),
                              profile_sha256: pilotDigest(`profile ${selection.run_id}`),
                          }
                        : null,
                loaded: ['observe-a', 'observe-b', 'observe-restored-a'].includes(step.id)
                    ? {
                          process_instance: pilotDigest(`${selection.run_id}/${step.id}`),
                          source_tree_sha256:
                              step.pin === 'b'
                                  ? prepared.trees.source_b.tree_sha256
                                  : prepared.trees.source_a.tree_sha256,
                          installed_tree_sha256:
                              step.pin === 'b'
                                  ? prepared.trees.source_b.tree_sha256
                                  : prepared.trees.source_a.tree_sha256,
                          transformations: [],
                          inventory_evidence: evidence[2].path,
                      }
                    : null,
                rollback_state:
                    step.id === 'observe-restored-a'
                        ? {
                              preservation: 'observed',
                              compatibility: 'not-exercised',
                              before_sha256: '',
                              after_sha256: evidence[3].sha256,
                              evidence: [],
                          }
                        : null,
            };
            if (observation.rollback_state) {
                const path = `${step.id}-before-state.json`;
                const before = {
                    path,
                    kind: 'state',
                    ...inventory.writeJson(join(evidenceRoot, path), {
                        synthetic: true,
                        before: true,
                    }),
                };
                evidence.push(before);
                observation.rollback_state.before_sha256 = before.sha256;
                observation.rollback_state.evidence = [before.path, evidence[3].path];
            }
            await mutate(observation, step, { evidenceRoot, inventory });
            return observation;
        },
        async abort() {
            aborts++;
        },
    };
    return { adapter, calls, evidenceRoot, journalParent, aborts: () => aborts };
}

export const selection = (host = 'codex', repetition = 1) => ({
    run_id: randomUUID(),
    host,
    repetition,
});
