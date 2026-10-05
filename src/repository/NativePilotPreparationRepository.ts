// SPDX-License-Identifier: Apache-2.0
import {
    constants,
    copyFileSync,
    chmodSync,
    mkdirSync,
    realpathSync,
    writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import type { NativePilotContract, NativePilotInputs } from '../config/NativePilotConfiguration.ts';
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';
import { closedObject } from '../validator/NativePilotContractValidator.ts';
import { NativePilotInventoryRepository, pilotDigest } from './NativePilotInventoryRepository.ts';
import type { NativePilotInventory } from './NativePilotInventoryRepository.ts';

export interface NativePilotPreparation {
    root: string;
    contract: NativePilotContract;
    contract_sha256: string;
    trees: Record<'source_a' | 'source_b' | 'driver' | 'observer', NativePilotInventory>;
    package_names: { a: string[]; b: string[] };
}

/** Creates a new inert artifact only; no native, Git, profile or cleanup operation. */
export class NativePilotPreparationRepository {
    readonly inventory = new NativePilotInventoryRepository();

    prepare(
        contract: NativePilotContract,
        input: unknown,
        destination: string,
    ): NativePilotPreparation {
        const raw = closedObject(
            input,
            ['source_a', 'source_b', 'driver', 'observer', 'node', 'codex', 'claude'],
            'inputs',
        );
        for (const value of Object.values(raw)) {
            if (
                typeof value !== 'string' ||
                !isAbsolute(value) ||
                resolve(value) !== value ||
                realpathSync(value) !== value
            ) {
                throw new Error('Every selected input must be a canonical explicit local path.');
            }
        }
        const inputs = raw as unknown as NativePilotInputs;
        if (
            !isAbsolute(destination) ||
            resolve(destination) !== destination ||
            !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(basename(destination))
        ) {
            throw new Error('Select a new absolute output directory with a bounded ordinary name.');
        }
        this.inventory.canonicalDirectory(dirname(destination));
        const home = realpathSync(homedir());
        if (
            destination === home ||
            this.inventory.contains(home, destination) ||
            Object.values(inputs).some(
                (path) =>
                    path === destination ||
                    this.inventory.contains(path, destination) ||
                    this.inventory.contains(destination, path),
            )
        )
            throw new Error('Output overlaps a protected home or selected input.');

        const trees = {} as NativePilotPreparation['trees'];
        for (const key of ['source_a', 'source_b', 'driver', 'observer'] as const) {
            const snapshot = this.inventory.tree(inputs[key]);
            if (snapshot.tree_sha256 !== contract[key].tree_sha256)
                throw new Error(`${key}: supplied tree pin does not match local bytes.`);
            trees[key] = snapshot;
        }
        this.inventory.verifyPrivateReview(contract.driver, 'driver');
        this.inventory.verifyPrivateReview(contract.observer, 'observer');
        const packageNames = (tree: NativePilotInventory) =>
            tree.entries
                .filter(
                    (entry) =>
                        entry.kind === 'file' &&
                        /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(entry.path),
                )
                .map((entry) => entry.path.split('/')[2])
                .sort();
        const package_names = { a: packageNames(trees.source_a), b: packageNames(trees.source_b) };
        const required = [
            'LICENSE',
            'NOTICE',
            'package.json',
            'skills-catalog.json',
            '.codex-plugin/plugin.json',
            '.claude-plugin/plugin.json',
            '.agents/plugins/marketplace.json',
            '.claude-plugin/marketplace.json',
            'hooks/codex.json',
            'hooks/claude.json',
            'mcp/codex.json',
            'mcp/claude.json',
            'src/transport/PluginHookRunner.ts',
            'src/transport/PluginMcpServer.ts',
        ];
        for (const key of ['source_a', 'source_b'] as const) {
            for (const path of required)
                if (
                    !trees[key].entries.some(
                        (entry) => entry.path === path && entry.kind === 'file',
                    )
                ) {
                    throw new Error(
                        `${key}: incomplete source runtime, manifest or notice inventory.`,
                    );
                }
            if (!package_names[key === 'source_a' ? 'a' : 'b'].length)
                throw new Error('Candidate has no canonical packages.');
            const pin = key === 'source_a' ? 'a' : 'b';
            for (const host of ['codex', 'claude'] as const) {
                const manifest = this.inventory.readJson(
                    join(inputs[key], `.${host}-plugin`, 'plugin.json'),
                ) as Record<string, unknown>;
                const mapping = this.inventory.readJson(
                    join(inputs[key], 'mcp', `${host}.json`),
                ) as { mcpServers?: Record<string, unknown> };
                const server =
                    host === 'claude'
                        ? contract.mcp[host][pin].replace(/^plugin:i9-skills:/, '')
                        : contract.mcp[host][pin];
                if (
                    manifest.name !== 'i9-skills' ||
                    manifest.skills !== './.agents/skills/' ||
                    manifest.hooks !== `./hooks/${host}.json` ||
                    manifest.mcpServers !== `./mcp/${host}.json` ||
                    (host === 'claude' &&
                        !contract.mcp[host][pin].startsWith('plugin:i9-skills:')) ||
                    !mapping.mcpServers ||
                    !Object.hasOwn(mapping.mcpServers, server)
                ) {
                    throw new Error(
                        'Selected native manifest or MCP identity differs from the declared bounded lane.',
                    );
                }
            }
        }
        for (const witness of contract.witnesses)
            for (const pin of ['a', 'b'] as const) {
                const entry = trees[pin === 'a' ? 'source_a' : 'source_b'].entries.find(
                    (item) => item.path === witness.path,
                );
                if (entry?.kind !== 'file' || entry.sha256 !== witness[`${pin}_sha256`])
                    throw new Error('Changed witness does not match actual candidate bytes.');
            }
        if (
            !trees.observer.entries.some(
                (entry) => entry.kind === 'file' && entry.path === contract.observer.entrypoint,
            )
        ) {
            throw new Error('The reviewed native observer entrypoint is absent.');
        }
        for (const binary of ['node', 'codex', 'claude'] as const) {
            const file = this.inventory.file(
                inputs[binary],
                NativePilotConfiguration.limits.binary_bytes,
            );
            if (file.sha256 !== contract.binaries[binary].sha256 || !file.executable)
                throw new Error(`${binary}: executable pin mismatch.`);
        }

        // All source/input validation precedes the first write. mkdir is exclusive.
        mkdirSync(destination, { mode: 0o700 });
        writeFileSync(
            join(destination, '.i9-native-pilot-owned'),
            'private-inert-preparation-v1\n',
            { flag: 'wx', mode: 0o600 },
        );
        mkdirSync(join(destination, 'input'), { mode: 0o700 });
        mkdirSync(join(destination, 'runtime-bin'), { mode: 0o700 });
        for (const key of ['source_a', 'source_b', 'driver', 'observer'] as const) {
            this.inventory.copyTree(inputs[key], join(destination, 'input', key), trees[key]);
        }
        for (const binary of ['node', 'codex', 'claude'] as const) {
            const target = join(destination, 'runtime-bin', binary);
            copyFileSync(inputs[binary], target, constants.COPYFILE_EXCL);
            chmodSync(target, 0o700);
            if (
                this.inventory.file(target, NativePilotConfiguration.limits.binary_bytes).sha256 !==
                    contract.binaries[binary].sha256 ||
                this.inventory.file(inputs[binary], NativePilotConfiguration.limits.binary_bytes)
                    .sha256 !== contract.binaries[binary].sha256
            ) {
                throw new Error(
                    'Binary changed during preparation; retain incomplete output for diagnosis.',
                );
            }
        }
        this.inventory.copyTree(
            inputs.source_a,
            join(destination, 'restore-drill-a'),
            trees.source_a,
        );
        this.inventory.copyTree(
            join(destination, 'restore-drill-a'),
            join(destination, 'restore-drill-a-copy'),
            trees.source_a,
        );
        const contract_sha256 = pilotDigest(JSON.stringify(contract));
        this.inventory.writeJson(join(destination, 'contract.json'), contract);
        const receipt = {
            schema_version: 1,
            kind: 'inert-preparation',
            contract_sha256,
            trees,
            package_names,
            restore_drill: 'byte-identical',
            source_identity: 'a-b-caller-supplied-git-assertions-with-verified-local-bytes',
            executable_identity: Object.fromEntries(
                ['driver', 'observer'].map((key) => {
                    const pin = contract[key as 'driver' | 'observer'];
                    return [key, 'origin' in pin ? pin.origin : 'git'];
                }),
            ),
            native_observations: 0,
            driver_or_candidate_executed: false,
        };
        this.inventory.writeJson(join(destination, 'preparation.json'), receipt);
        mkdirSync(join(destination, 'output'), { mode: 0o700 });
        mkdirSync(join(destination, 'output', 'journal'), { mode: 0o700 });
        mkdirSync(join(destination, 'output', 'evidence'), { mode: 0o700 });
        this.inventory.writeJson(join(destination, 'output', '.i9-native-pilot-output-owned'), {
            schema_version: 1,
            contract_sha256,
            journal: 'journal',
            evidence: 'evidence',
        });
        return { root: destination, contract, contract_sha256, trees, package_names };
    }
}
