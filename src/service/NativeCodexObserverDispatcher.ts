// SPDX-License-Identifier: Apache-2.0
import { NativeCodexConfiguration } from '../config/NativeCodexConfiguration.ts';
import { NativeCodexObservationError } from '../validator/NativeCodexObservationError.ts';
import { createHash } from 'node:crypto';
import { NativeCodexSchemaConfiguration } from '../config/NativeCodexSchemaConfiguration.ts';
import { NativeCodexSchemaRepository } from '../repository/NativeCodexSchemaRepository.ts';
import { NativeCodexProtocolValidator } from '../validator/NativeCodexProtocolValidator.ts';
import { ConfinedNativeCodexRepository } from '../repository/ConfinedNativeCodexRepository.ts';
import { NativeCodexObservationService } from './NativeCodexObservationService.ts';
import type { ArtifactInventory, ObserverInput } from './NativeCodexObservationService.ts';
import { NativeCodexObservationRepository } from '../repository/NativeCodexObservationRepository.ts';
import { NativeCodexModelCatalogValidator } from '../validator/NativeCodexModelCatalogValidator.ts';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export type ObserverSelection = {
    runId: string;
    host: 'codex' | 'claude';
    repetition: 1 | 2;
    phase: string;
    pin: 'a' | 'b' | 'restored-a' | null;
};

/** Thin explicit projection from frozen controller inputs; lifecycle claims stay controller-owned. */
export class NativeCodexObserverDispatcher {
    private readonly files = new NativeCodexObservationRepository();
    selection(argv: string[]): ObserverSelection {
        const fields = new Map<string, string>();
        const allowed = [
            '--contract',
            '--root',
            '--run-id',
            '--host',
            '--repetition',
            '--phase',
            '--pin',
        ];
        if (argv.length < 12 || argv.length > 14 || argv.length % 2 !== 0)
            throw new Error('dispatcher_selection');
        for (let i = 0; i < argv.length; i += 2) {
            if (!allowed.includes(argv[i]) || fields.has(argv[i]))
                throw new Error('dispatcher_selection');
            fields.set(argv[i], argv[i + 1]);
        }
        if (
            fields.get('--contract') !== '/pilot/contract.json' ||
            fields.get('--root') !== '/pilot' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
                fields.get('--run-id') ?? '',
            ) ||
            !['codex', 'claude'].includes(fields.get('--host') ?? '') ||
            !['1', '2'].includes(fields.get('--repetition') ?? '') ||
            !/^[a-z]+(?:-[a-z]+)*$/.test(fields.get('--phase') ?? '')
        )
            throw new Error('dispatcher_selection');
        const pin = fields.get('--pin') ?? null;
        if (pin !== null && !['a', 'b', 'restored-a'].includes(pin))
            throw new Error('dispatcher_selection');
        return {
            runId: fields.get('--run-id')!,
            host: fields.get('--host')! as 'codex' | 'claude',
            repetition: Number(fields.get('--repetition')) as 1 | 2,
            phase: fields.get('--phase')!,
            pin: pin as ObserverSelection['pin'],
        };
    }

    project(
        selection: ObserverSelection,
        contract: any,
        inventory: ArtifactInventory,
        catalog: any,
        hooks: any,
    ): ObserverInput {
        const phaseMap: Record<string, ObserverInput['phase']> = {
            'observe-a': 'install',
            'observe-b': 'update',
            'observe-restored-a': 'rollback',
        };
        if (
            selection.host !== 'codex' ||
            !Object.hasOwn(phaseMap, selection.phase) ||
            selection.pin !==
                (
                    {
                        'observe-a': 'a',
                        'observe-b': 'b',
                        'observe-restored-a': 'restored-a',
                    } as any
                )[selection.phase]
        )
            throw new Error('dispatcher_unsupported_phase');
        const key = selection.pin === 'b' ? 'source_b' : 'source_a';
        if (
            contract.schema_version !== 1 ||
            contract.purpose !== 'local-source-a-b-a' ||
            contract.binaries?.codex?.version !== '0.160.0' ||
            contract.authority?.platform !== 'linux/arm64' ||
            inventory.tree_sha256 !== contract[key]?.tree_sha256 ||
            sha(JSON.stringify(inventory.entries)) !== inventory.tree_sha256
        )
            throw new Error('dispatcher_contract');
        if (
            catalog.schema_version !== 1 ||
            !Array.isArray(catalog.skills) ||
            catalog.skills.length < 1 ||
            catalog.skills.length > 256 ||
            !hooks?.hooks ||
            typeof hooks.hooks !== 'object'
        )
            throw new Error('dispatcher_source_contract');
        const skills = catalog.skills.map((skill: any) => {
            if (skill.path !== `.agents/skills/${skill.name}`)
                throw new Error('dispatcher_catalog');
            const prefix = skill.path + '/';
            const entries = inventory.entries.filter((entry) => entry.path.startsWith(prefix));
            if (entries.some((entry) => entry.kind === 'symlink'))
                throw new Error('dispatcher_linked_package');
            const files = entries
                .filter((entry) => entry.kind === 'file')
                .map((entry) => ({
                    path: entry.path.slice(prefix.length),
                    sha256: entry.sha256!,
                    bytes: entry.bytes,
                }));
            if (!files.some((file) => file.path === 'SKILL.md'))
                throw new Error('dispatcher_package');
            return {
                name: skill.name,
                description: skill.description,
                tags: skill.tags,
                files,
            };
        });
        const events: Record<string, string> = {
            SessionStart: 'sessionStart',
            PreToolUse: 'preToolUse',
            PostToolUse: 'postToolUse',
        };
        const identities = [];
        for (const [event, groups] of Object.entries(hooks.hooks)) {
            if (!Object.hasOwn(events, event) || !Array.isArray(groups))
                throw new Error('dispatcher_hook_event');
            for (const group of groups) {
                if (!Array.isArray(group.hooks)) throw new Error('dispatcher_hook_group');
                for (const handler of group.hooks) {
                    if (handler.type !== 'command') throw new Error('dispatcher_hook_handler');
                    identities.push({
                        eventName: events[event],
                        matcher: group.matcher ?? null,
                        command: handler.command,
                        timeoutSec: handler.timeout,
                        additionalContextLimit: handler.additionalContextLimit ?? null,
                        sourceRelativePath: 'hooks/codex.json',
                    });
                }
            }
        }
        const selected = skills.find((skill: any) => skill.name === 'skill-authoring');
        const file = selected?.files.find((file: any) => file.path === 'SKILL.md');
        if (!selected || !file) throw new Error('dispatcher_selected_resource');
        return {
            schema: 1,
            phase: phaseMap[selection.phase],
            imageHome: NativeCodexConfiguration.accountHome,
            pluginId: 'i9-skills@i9-skills',
            artifactInventory: inventory,
            skills,
            hooks: identities,
            resource: {
                skill: selected.name,
                resource: 'SKILL.md',
                sha256: file.sha256,
                bytes: file.bytes,
            },
        };
    }

    async run(argv: string[]): Promise<unknown> {
        const selection = this.selection(argv);
        const name = `${selection.runId}-${selection.host}-r${selection.repetition}-${selection.phase}`;
        const root = this.files.createOutput('/pilot/native-output', name);
        const backend = new ConfinedNativeCodexRepository();
        let report: unknown;
        try {
            if (
                !['observe-a', 'observe-b', 'observe-restored-a'].includes(selection.phase) ||
                selection.host !== 'codex'
            )
                throw new Error('dispatcher_unsupported_phase');
            const contract = this.files.json('/pilot/contract.json');
            new NativeCodexModelCatalogValidator().validate(
                this.files.json(NativeCodexConfiguration.modelCatalog),
            );
            const ledger =
                selection.pin === 'b' ? 'source-b.inventory.json' : 'source-a.inventory.json';
            const inventory = this.files.json(`/pilot/control/${ledger}`) as ArtifactInventory;
            const active = await backend.artifact('/pilot/source');
            if (JSON.stringify(active) !== JSON.stringify(inventory))
                throw new Error('dispatcher_active_source');
            const catalog = this.files.json('/pilot/source/skills-catalog.json');
            const hooks = this.files.json('/pilot/source/hooks/codex.json');
            for (const [relative, bytes] of [
                ['skills-catalog.json', Buffer.from(JSON.stringify(catalog))],
                ['hooks/codex.json', Buffer.from(JSON.stringify(hooks))],
            ] as const) {
                // The complete physical inventory above binds original bytes, not JSON normalization.
                if (
                    !inventory.entries.some(
                        (entry) => entry.kind === 'file' && entry.path === relative,
                    ) ||
                    bytes.length === 0
                )
                    throw new Error('dispatcher_source_file');
            }
            const input = this.project(selection, contract, inventory, catalog, hooks);
            this.files.retain(root, 'input.json', Buffer.from(JSON.stringify(input) + '\n'));
            const validator = new NativeCodexProtocolValidator(
                new NativeCodexSchemaRepository(NativeCodexConfiguration.schemaRoot),
            );
            const observation = await new NativeCodexObservationService(validator).observe(
                input,
                backend,
            );
            report = {
                schema_version: 1,
                ...selection,
                status: 'observed',
                native_acceptance: false,
                observation,
                unmeasured: [
                    'native-registration',
                    'profile-preservation',
                    'state-row-preservation',
                    'lifecycle-update-semantics',
                    'official-conformance',
                    'independent-acceptance',
                ],
            };
        } catch (error) {
            const mismatch =
                error instanceof Error && error.message.startsWith('schema_mismatch:')
                    ? error.message.slice('schema_mismatch:'.length)
                    : null;
            const schema =
                mismatch && Object.hasOwn(NativeCodexSchemaConfiguration.identity.files, mismatch)
                    ? mismatch
                    : null;
            const reason =
                error instanceof Error && /^[a-z][a-z0-9_:-]{0,160}$/.test(error.message)
                    ? error.message
                    : schema
                      ? 'schema_mismatch'
                      : 'observer_blocked';
            report = {
                schema_version: 1,
                ...selection,
                status: 'blocked',
                native_acceptance: false,
                reason,
                schema,
                cleanup_failure:
                    error instanceof NativeCodexObservationError ? error.cleanup_failure : null,
            };
        }
        const evidence = [];
        evidence.push(
            this.files.retain(
                root,
                'process-events.json',
                Buffer.from(
                    JSON.stringify({
                        schema_version: 1,
                        executable: '/pilot/runtime-bin/codex',
                        events: backend.processEvents,
                    }) + '\n',
                ),
            ),
        );
        for (const direction of [
            'request',
            'stdout',
            'stderr',
            'fixture-request',
            'fixture-response',
        ] as const) {
            const bytes = Buffer.concat(
                backend.raw
                    .filter((row) => row.direction === direction)
                    .map((row) => Buffer.from(row.bytes)),
            );
            const extension =
                direction === 'fixture-request'
                    ? 'json'
                    : direction === 'fixture-response'
                      ? 'sse'
                      : direction === 'stderr'
                        ? 'log'
                        : 'jsonl';
            evidence.push(this.files.retain(root, `${direction}.${extension}`, bytes));
        }
        evidence.push(
            this.files.retain(root, 'observation.json', Buffer.from(JSON.stringify(report) + '\n')),
        );
        return {
            schema_version: 1,
            ...selection,
            status: (report as any).status,
            native_acceptance: false,
            evidence_root: root,
            evidence,
        };
    }
}
