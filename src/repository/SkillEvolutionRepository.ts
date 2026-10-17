// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { strictJson } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';
import { validateSkill } from '../../.agents/skills/skill-authoring/scripts/skill_tools.mjs';
import { SkillPanelConfiguration } from '../config/SkillPanelConfiguration.ts';
import { PortableFrontmatterValidator } from '../validator/PortableFrontmatterValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';
import {
    PANEL_TEXT_BYTES,
    SkillPanelValidator,
    type PanelApproval,
    type PanelRequest,
    type PanelCompletion,
} from '../validator/SkillPanelValidator.ts';
import { SkillPanelPackageRepository } from './SkillPanelPackageRepository.ts';
import { SkillPanelCatalogRepository } from './SkillPanelCatalogRepository.ts';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
type Validation = {
    local: { status: 'passed' | 'failed'; detail: string };
    official: 'not_run';
    behavioral: 'not_run';
};
export type PanelProposal = {
    schema_version: 1 | 2;
    source?: 'global';
    name?: string;
    global_collection_sha256?: string;
    global_relative?: string;
    proposal_id: string;
    collection_sha256: string;
    skill: string;
    base_sha256: string;
    candidate_sha256: string;
    before_sha256: string;
    after_sha256: string;
    rationale: string;
    created_at: string;
    validation: Validation;
};
type ReviewRequest = PanelRequest & {
    schema_version: 1 | 2;
    source?: 'global';
    global_collection_sha256?: string;
    global_relative?: string;
    request_id: string;
    collection_sha256: string;
    name: string;
    read_only: boolean;
    base_sha256: string;
    created_at: string;
};

/** Retains exact package preimages and guarded single-file changes in a stable owned workspace. */
export class SkillEvolutionRepository {
    private readonly validator = new SkillPanelValidator();
    private readonly packages = new SkillPanelPackageRepository();
    private readonly configuration: SkillPanelConfiguration;

    constructor(configuration: SkillPanelConfiguration) {
        this.configuration = configuration;
    }

    inspect(skill: string) {
        const target = this.target(skill);
        const collection = new SafeRoot(target.root);
        try {
            const selected = collection.inspect(target.relative);
            if (!selected.info?.isDirectory()) throw new SkillOperationError('invalid_input');
            const observed = this.observePackage(selected.absolute);
            collection.verifySnapshot(selected);
            return { skill, ...observed };
        } finally {
            collection.close();
        }
    }

    prepare(input: { skill: string; base_sha256: string; after: string; rationale: string }) {
        const target = this.target(input.skill, true);
        return this.withState(true, (state, collection) => {
            const before = this.inspect(input.skill);
            if (before.package_sha256 !== input.base_sha256 || before.text === input.after)
                this.conflict();
            const metadata = this.parseMetadata(input.after);
            if (metadata.name !== target.name) throw new SkillOperationError('invalid_input');
            const count = fs
                .readdirSync(state.path)
                .filter((name) => /^[a-f0-9-]{36}$/.test(name)).length;
            if (count >= 16) throw new SkillOperationError('panel_storage_unavailable');

            const id = randomUUID();
            fs.mkdirSync(join(state.path, id), { mode: 0o700 });
            for (const stage of ['before', 'candidate']) {
                fs.mkdirSync(join(state.path, id, stage), { mode: 0o700 });
                this.copyPackage(
                    target.path,
                    join(state.path, id, stage, target.name),
                    stage === 'candidate' ? input.after : undefined,
                );
            }
            const original = this.observePackage(join(state.path, id, 'before', target.name));
            const candidate = this.observePackage(join(state.path, id, 'candidate', target.name));
            if (
                original.package_sha256 !== before.package_sha256 ||
                this.inspect(input.skill).package_sha256 !== before.package_sha256
            )
                this.conflict();

            const validation = this.validateCandidate(
                join(state.path, id, 'candidate', target.name),
            );
            const receipt: PanelProposal = {
                schema_version: target.global_collection_sha256 ? 2 : 1,
                ...(target.global_collection_sha256
                    ? {
                          source: 'global' as const,
                          name: target.name,
                          global_collection_sha256: target.global_collection_sha256,
                          global_relative: target.relative,
                      }
                    : {}),
                proposal_id: id,
                collection_sha256: hash(collection.path),
                skill: input.skill,
                base_sha256: before.package_sha256,
                candidate_sha256: candidate.package_sha256,
                before_sha256: before.sha256,
                after_sha256: candidate.sha256,
                rationale: input.rationale,
                created_at: new Date().toISOString(),
                validation,
            };
            this.targetForProposal(receipt, true);
            this.writeRecord(state, `${id}/proposal.json`, receipt);
            return this.readProposal(state, collection, id);
        });
    }

    proposal(id: string) {
        this.validator.id(id);
        return this.withState(false, (state, collection) =>
            this.readProposal(state, collection, id),
        );
    }

    /** Read a saved request for an explicit continuation; never replay or mutate it. */
    reviewRequest(id: string) {
        this.validator.id(id);
        return this.withState(false, (state, collection) =>
            this.readRequest(state, collection, id),
        );
    }

    /** Explicit user intent is retained before the host message; this never runs a model. */
    request(input: PanelRequest) {
        if (input.skill.startsWith('global:') && input.kind === 'proposal')
            this.target(input.skill, true);
        return this.withState(true, (state, collection) => {
            const global = input.skill.startsWith('global:');
            const observed = global
                ? new SkillPanelCatalogRepository(this.configuration).inspect(input.skill)
                : this.inspect(input.skill);
            const readOnly = global && Boolean((observed as { read_only: boolean }).read_only);
            if (readOnly && input.kind === 'proposal')
                throw new SkillOperationError('invalid_input');
            const target = global && !readOnly ? this.target(input.skill, true) : null;
            const directory = state.inspect('request', { allowMissingLeaf: true });
            if (directory.info === null) {
                state.verifySnapshot(directory, { includeLeaf: false });
                fs.mkdirSync(directory.absolute, { mode: 0o700 });
            }
            const requests = this.requestIds(state);
            if (requests.length >= 32) throw new SkillOperationError('panel_storage_unavailable');
            const request: ReviewRequest = {
                ...input,
                schema_version: target ? 2 : 1,
                ...(target
                    ? {
                          source: 'global' as const,
                          global_collection_sha256: target.global_collection_sha256,
                          global_relative: target.relative,
                      }
                    : {}),
                request_id: randomUUID(),
                collection_sha256: hash(collection.path),
                name: global ? String((observed as { name: string }).name) : input.skill,
                read_only: readOnly,
                base_sha256: observed.package_sha256 || observed.sha256,
                created_at: new Date().toISOString(),
            };
            fs.mkdirSync(join(state.path, 'request', request.request_id), { mode: 0o700 });
            this.writeRecord(state, `request/${request.request_id}/request.json`, request);
            return request;
        });
    }

    /** Completion is a bounded agent assertion, not proof of quality or permission to apply. */
    complete(input: PanelCompletion) {
        return this.withState(true, (state, collection) => {
            const request = this.readRequest(state, collection, input.request_id);
            if (input.proposal_id) {
                if (request.read_only) this.conflict();
                const proposal = this.readProposal(state, collection, input.proposal_id);
                if (
                    proposal.skill !== request.skill ||
                    proposal.base_sha256 !== request.base_sha256
                )
                    this.conflict();
            }
            const filename = `request/${input.request_id}/result.json`;
            if (state.inspect(filename, { allowMissingLeaf: true }).info !== null) {
                const existing = this.readCompletion(state, request);
                const { completed_at: _time, ...identity } = existing!;
                if (JSON.stringify(identity) !== JSON.stringify(input)) this.conflict();
                return { request, result: existing };
            }
            const result = { ...input, completed_at: new Date().toISOString() };
            this.writeRecord(state, filename, result);
            return { request, result };
        });
    }

    /** Recorded summaries are selectable; opening a proposal still verifies all retained bytes. */
    activity(skill: string) {
        const empty = () => ({ skill, requests: [] as unknown[], proposals: [] as unknown[] });
        return this.withState(
            false,
            (state, collection) => {
                const requests = this.requestIds(state)
                    .filter((id) => this.recordHasSkill(state, `request/${id}/request.json`, skill))
                    .map((id) => this.readRequest(state, collection, id))
                    .map((request) => ({ ...request, result: this.readCompletion(state, request) }))
                    .sort((a, b) => b.created_at.localeCompare(a.created_at));
                const ids = fs
                    .readdirSync(state.path)
                    .filter((name) => /^[a-f0-9-]{36}$/.test(name));
                if (ids.length > 16) throw new SkillOperationError('panel_storage_unavailable');
                const proposals = ids
                    .filter((id) => this.recordHasSkill(state, `${id}/proposal.json`, skill))
                    .map((id) => this.readProposalReceipt(state, collection, this.validator.id(id)))
                    .map(
                        ({
                            proposal_id,
                            base_sha256,
                            candidate_sha256,
                            rationale,
                            created_at,
                        }) => ({
                            proposal_id,
                            base_sha256,
                            candidate_sha256,
                            rationale,
                            created_at,
                            verification: 'inspect_before_deciding',
                        }),
                    )
                    .sort((a, b) => b.created_at.localeCompare(a.created_at));
                return { skill, requests, proposals };
            },
            empty,
        );
    }

    private requestIds(state: SafeRoot): string[] {
        const directory = state.inspect('request', { allowMissingLeaf: true });
        if (directory.info === null) return [];
        if (!directory.info.isDirectory()) this.conflict();
        const ids = fs.readdirSync(directory.absolute);
        if (ids.length > 32) throw new SkillOperationError('panel_storage_unavailable');
        for (const id of ids) {
            this.validator.id(id);
            if (!state.inspect(`request/${id}`).info?.isDirectory()) this.conflict();
        }
        state.verifySnapshot(directory);
        return ids;
    }

    private recordHasSkill(state: SafeRoot, filename: string, skill: string): boolean {
        const record = this.readRecord(state, filename) as Record<string, unknown> | null;
        return this.validator.inspection({ skill: record?.skill }) === skill;
    }

    private readRequest(state: SafeRoot, collection: SafeRoot, id: string): ReviewRequest {
        this.validator.id(id);
        const value = this.readRecord(state, `request/${id}/request.json`);
        const version = (value as { schema_version?: unknown } | null)?.schema_version;
        const data = this.validator.object(value, [
            'skill',
            'kind',
            'focus',
            'schema_version',
            'request_id',
            'collection_sha256',
            'name',
            'read_only',
            'base_sha256',
            'created_at',
            ...(version === 2 ? ['source', 'global_collection_sha256', 'global_relative'] : []),
        ]);
        this.validator.workflowRequest({ skill: data.skill, kind: data.kind, focus: data.focus });
        this.validator.name(data.name);
        this.validator.hash(data.base_sha256);
        this.date(data.created_at);
        if (
            (data.schema_version !== 1 && data.schema_version !== 2) ||
            data.request_id !== id ||
            data.collection_sha256 !== hash(collection.path) ||
            (version === 1 && data.read_only !== String(data.skill).startsWith('global:')) ||
            (version === 1 && !data.read_only && data.name !== data.skill) ||
            (version === 1 && data.read_only && data.kind !== 'review') ||
            (version === 2 &&
                (data.source !== 'global' ||
                    !String(data.skill).startsWith('global:') ||
                    data.read_only !== false))
        )
            this.conflict();
        if (version === 2) {
            this.validator.hash(data.global_collection_sha256);
            new SkillPanelCatalogRepository(this.configuration).assertRetainedTarget(
                String(data.skill),
                String(data.name),
                data.global_relative,
                String(data.global_collection_sha256),
            );
        }
        return data as ReviewRequest;
    }

    private readCompletion(state: SafeRoot, request: ReviewRequest) {
        const filename = `request/${request.request_id}/result.json`;
        if (state.inspect(filename, { allowMissingLeaf: true }).info === null) return null;
        const data = this.validator.object(this.readRecord(state, filename), [
            'request_id',
            'outcome',
            'summary',
            'proposal_id',
            'completed_at',
        ]);
        const { completed_at, ...input } = data;
        const result = this.validator.completion(input);
        this.date(completed_at);
        if (result.request_id !== request.request_id || (request.read_only && result.proposal_id))
            this.conflict();
        return { ...result, completed_at: completed_at as string };
    }

    private date(value: unknown) {
        if (
            typeof value !== 'string' ||
            !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
            !Number.isFinite(Date.parse(value))
        )
            this.conflict();
    }

    apply(approval: PanelApproval) {
        return this.withState(true, (state, collection) => {
            const proposal = this.readProposal(state, collection, approval.proposal_id);
            this.assertApproval(proposal, approval, 'apply');
            this.targetForProposal(proposal, true);
            if (proposal.status === 'recovered') this.conflict();
            const current = this.inspect(proposal.skill);
            if (proposal.status === 'applied') {
                if (current.package_sha256 !== proposal.candidate_sha256) this.conflict();
                return { ...proposal, changed: false };
            }
            if (proposal.validation.local.status !== 'passed')
                throw new SkillOperationError('panel_validation_failed');
            const validation = this.validateCandidate(
                join(state.path, proposal.proposal_id, 'candidate', this.packageName(proposal)),
            );
            if (validation.local.status !== 'passed')
                throw new SkillOperationError('panel_validation_failed');
            const intent = `${proposal.proposal_id}/applying.json`;
            const hadIntent = this.hasRecord(state, intent, proposal, 'applying');
            if (current.package_sha256 === proposal.candidate_sha256 && hadIntent) {
                this.recordOutcome(state, proposal, 'applied');
                return {
                    ...this.readProposal(state, collection, proposal.proposal_id),
                    changed: false,
                };
            }
            if (current.package_sha256 !== proposal.base_sha256) this.conflict();
            if (!hadIntent) this.writeRecord(state, intent, this.outcome(proposal, 'applying'));
            this.replace(proposal, proposal.before_sha256, proposal.after);
            if (this.inspect(proposal.skill).package_sha256 !== proposal.candidate_sha256)
                throw new SkillOperationError('panel_recovery_required');
            this.recordOutcome(state, proposal, 'applied');
            return { ...this.readProposal(state, collection, proposal.proposal_id), changed: true };
        });
    }

    recover(approval: PanelApproval) {
        return this.withState(true, (state, collection) => {
            const proposal = this.readProposal(state, collection, approval.proposal_id);
            this.assertApproval(proposal, approval, 'recover');
            this.targetForProposal(proposal, true);
            const current = this.inspect(proposal.skill);
            if (proposal.status === 'recovered') {
                if (current.package_sha256 !== proposal.base_sha256) this.conflict();
                return { ...proposal, changed: false };
            }
            if (
                !this.hasRecord(
                    state,
                    `${proposal.proposal_id}/applying.json`,
                    proposal,
                    'applying',
                )
            )
                this.conflict();
            const intent = `${proposal.proposal_id}/recovering.json`;
            const hadIntent = this.hasRecord(state, intent, proposal, 'recovering');
            if (current.package_sha256 === proposal.base_sha256 && hadIntent) {
                this.recordOutcome(state, proposal, 'recovered');
                return {
                    ...this.readProposal(state, collection, proposal.proposal_id),
                    changed: false,
                };
            }
            if (current.package_sha256 !== proposal.candidate_sha256) this.conflict();
            if (!hadIntent) this.writeRecord(state, intent, this.outcome(proposal, 'recovering'));
            this.replace(proposal, proposal.after_sha256, proposal.before);
            if (this.inspect(proposal.skill).package_sha256 !== proposal.base_sha256)
                throw new SkillOperationError('panel_recovery_required');
            this.recordOutcome(state, proposal, 'recovered');
            return { ...this.readProposal(state, collection, proposal.proposal_id), changed: true };
        });
    }

    private assertApproval(
        proposal: PanelProposal,
        approval: PanelApproval,
        action: 'apply' | 'recover',
    ) {
        if (
            approval.action !== action ||
            approval.approved !== true ||
            proposal.base_sha256 !== approval.base_sha256 ||
            proposal.candidate_sha256 !== approval.candidate_sha256
        )
            this.conflict();
    }

    private observePackage(directory: string) {
        return this.packages.inspect(directory);
    }

    private parseMetadata(text: string): Record<string, unknown> {
        // Ignore a leading BOM only for parsing; retained text, hashes and writes
        // always preserve the original UTF-8 bytes.
        return new PortableFrontmatterValidator().parse(text.replace(/^\uFEFF/u, '')) as Record<
            string,
            unknown
        >;
    }

    private copyPackage(source: string, destination: string, replacement?: string): void {
        const root = new SafeRoot(source);
        try {
            fs.mkdirSync(destination, { mode: fs.statSync(root.path).mode & 0o777 });
            fs.chmodSync(destination, fs.statSync(root.path).mode & 0o777);
            for (const [name, info] of root.inventory() as [string, fs.Stats][]) {
                const target = join(destination, name);
                if (info.isDirectory()) {
                    fs.mkdirSync(target, { mode: info.mode & 0o777 });
                    fs.chmodSync(target, info.mode & 0o777);
                    continue;
                }
                const bytes =
                    name === 'SKILL.md' && replacement !== undefined
                        ? Buffer.from(replacement)
                        : root.readBytes(name, 4_194_304);
                fs.writeFileSync(target, bytes, { flag: 'wx', mode: info.mode & 0o777 });
                fs.chmodSync(target, info.mode & 0o777);
            }
            root.assertStable();
        } finally {
            root.close();
        }
    }

    private validateCandidate(directory: string): Validation {
        try {
            validateSkill(directory);
            return {
                local: {
                    status: 'passed',
                    detail: 'Package helper structural checks passed; candidate scripts were not executed.',
                },
                official: 'not_run',
                behavioral: 'not_run',
            };
        } catch (error) {
            const detail = (error instanceof Error ? error.message : 'Structural validation failed')
                .replaceAll(directory, '<candidate>')
                .replace(/[\x00-\x1f\x7f]/g, ' ')
                .slice(0, 500);
            return {
                local: { status: 'failed', detail },
                official: 'not_run',
                behavioral: 'not_run',
            };
        }
    }

    private readProposalReceipt(state: SafeRoot, collection: SafeRoot, id: string) {
        const receipt = this.readRecord(state, `${id}/proposal.json`) as PanelProposal;
        this.validator.object(receipt, [
            'schema_version',
            'proposal_id',
            'collection_sha256',
            'skill',
            'base_sha256',
            'candidate_sha256',
            'before_sha256',
            'after_sha256',
            'rationale',
            'created_at',
            'validation',
            ...(receipt.schema_version === 2
                ? ['source', 'name', 'global_collection_sha256', 'global_relative']
                : []),
        ]);
        this.validator.inspection({ skill: receipt.skill });
        this.validator.text(receipt.rationale, 2000);
        this.date(receipt.created_at);
        for (const key of [
            'base_sha256',
            'candidate_sha256',
            'before_sha256',
            'after_sha256',
        ] as const)
            this.validator.hash(receipt[key]);
        if (
            (receipt.schema_version !== 1 && receipt.schema_version !== 2) ||
            receipt.proposal_id !== id ||
            receipt.collection_sha256 !== hash(collection.path) ||
            (receipt.schema_version === 1 && receipt.skill.startsWith('global:'))
        )
            this.conflict();
        if (receipt.schema_version === 2) {
            if (receipt.source !== 'global' || !receipt.skill.startsWith('global:'))
                this.conflict();
            this.validator.name(receipt.name);
            this.validator.hash(receipt.global_collection_sha256);
            new SkillPanelCatalogRepository(this.configuration).assertRetainedTarget(
                receipt.skill,
                receipt.name!,
                receipt.global_relative,
                receipt.global_collection_sha256!,
            );
        }
        return receipt;
    }

    private readProposal(state: SafeRoot, collection: SafeRoot, id: string) {
        const receipt = this.readProposalReceipt(state, collection, id);
        const name = this.packageName(receipt);
        const original = this.observePackage(join(state.path, id, 'before', name));
        const candidate = this.observePackage(join(state.path, id, 'candidate', name));
        if (
            original.package_sha256 !== receipt.base_sha256 ||
            original.sha256 !== receipt.before_sha256 ||
            candidate.package_sha256 !== receipt.candidate_sha256 ||
            candidate.sha256 !== receipt.after_sha256
        )
            this.conflict();
        const validation = this.validateCandidate(join(state.path, id, 'candidate', name));
        if (JSON.stringify(validation) !== JSON.stringify(receipt.validation)) this.conflict();
        const recovered = this.hasRecord(state, `${id}/recovered.json`, receipt, 'recovered');
        const applied = this.hasRecord(state, `${id}/applied.json`, receipt, 'applied');
        const recovering = this.hasRecord(state, `${id}/recovering.json`, receipt, 'recovering');
        const applying = this.hasRecord(state, `${id}/applying.json`, receipt, 'applying');
        const source = this.inspect(receipt.skill);
        return {
            ...receipt,
            before: original.text,
            after: candidate.text,
            status: recovered ? 'recovered' : applied ? 'applied' : 'proposed',
            source_sha256: source.package_sha256,
            source_state:
                source.package_sha256 === receipt.base_sha256
                    ? 'original'
                    : source.package_sha256 === receipt.candidate_sha256
                      ? 'candidate'
                      : 'changed',
            write_intent:
                recovering && !recovered ? 'recover' : applying && !applied ? 'apply' : null,
        };
    }

    private outcome(proposal: PanelProposal, action: string) {
        return {
            proposal_id: proposal.proposal_id,
            base_sha256: proposal.base_sha256,
            candidate_sha256: proposal.candidate_sha256,
            action,
        };
    }

    private hasRecord(
        state: SafeRoot,
        filename: string,
        proposal: PanelProposal,
        action: string,
    ): boolean {
        const entry = state.inspect(filename, { allowMissingLeaf: true });
        if (entry.info === null) return false;
        if (
            JSON.stringify(this.readRecord(state, filename)) !==
            JSON.stringify(this.outcome(proposal, action))
        )
            this.conflict();
        return true;
    }

    private recordOutcome(state: SafeRoot, proposal: PanelProposal, action: string) {
        const name = `${proposal.proposal_id}/${action}.json`;
        if (!this.hasRecord(state, name, proposal, action))
            this.writeRecord(state, name, this.outcome(proposal, action));
    }

    private readRecord(state: SafeRoot, filename: string): unknown {
        const record = this.validator.object(strictJson(state.readBytes(filename, 8192)), [
            'payload',
            'sha256',
        ]);
        if (hash(JSON.stringify(record.payload)) !== this.validator.hash(record.sha256))
            this.conflict();
        return record.payload;
    }

    private writeRecord(state: SafeRoot, filename: string, payload: unknown) {
        const target = state.inspect(filename, { allowMissingLeaf: true });
        if (target.info !== null) this.conflict();
        state.verifySnapshot(target, { includeLeaf: false });
        fs.writeFileSync(
            target.absolute,
            JSON.stringify({ payload, sha256: hash(JSON.stringify(payload)) }) + '\n',
            { flag: 'wx', mode: 0o600 },
        );
    }

    private withState<T>(
        write: boolean,
        operation: (state: SafeRoot, collection: SafeRoot) => T,
        missing?: () => T,
    ): T {
        const collection = new SafeRoot(this.configuration.collection);
        const parent = new SafeRoot(dirname(this.configuration.state));
        let state: SafeRoot | undefined;
        let lock: number | undefined;
        let lockPath: string | undefined;
        try {
            const target = parent.inspect(basename(this.configuration.state), {
                allowMissingLeaf: true,
            });
            this.configuration.assertSeparate(collection.path, target.absolute);
            new SkillPanelCatalogRepository(this.configuration).assertWritableTargets(
                collection.path,
                target.absolute,
            );
            if (target.info === null) {
                if (!write && missing) return missing();
                if (!write) throw new SkillOperationError('panel_storage_unavailable');
                parent.verifySnapshot(target, { includeLeaf: false });
                fs.mkdirSync(target.absolute, { mode: 0o700 });
            }
            state = new SafeRoot(target.absolute);
            const info = fs.statSync(state.path);
            if ((info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid()))
                throw new SkillOperationError('panel_storage_unavailable');
            if (write) {
                lockPath = join(state.path, 'mutation.lock');
                lock = fs.openSync(
                    lockPath,
                    fs.constants.O_WRONLY |
                        fs.constants.O_CREAT |
                        fs.constants.O_EXCL |
                        fs.constants.O_NOFOLLOW,
                    0o600,
                );
            }
            return operation(state, collection);
        } catch (error) {
            if (error instanceof SkillOperationError) throw error;
            throw new SkillOperationError('panel_storage_unavailable');
        } finally {
            if (lock !== undefined && lockPath) {
                const opened = fs.fstatSync(lock);
                fs.closeSync(lock);
                try {
                    const current = fs.lstatSync(lockPath);
                    if (
                        current.ino === opened.ino &&
                        current.dev === opened.dev &&
                        !current.isSymbolicLink()
                    )
                        fs.unlinkSync(lockPath);
                } catch {
                    /* Preserve unknown replacement and recovery state. */
                }
            }
            state?.close();
            parent.close();
            collection.close();
        }
    }

    private target(
        skill: string,
        write = false,
    ): {
        root: string;
        relative: string;
        path: string;
        name: string;
        global_collection_sha256?: string;
    } {
        this.validator.inspection({ skill });
        if (skill.startsWith('global:'))
            return new SkillPanelCatalogRepository(this.configuration).target(skill, write);
        const collection = new SafeRoot(this.configuration.collection);
        try {
            const selected = collection.inspect(skill);
            if (!selected.info?.isDirectory()) this.conflict();
            collection.verifySnapshot(selected);
            return {
                root: collection.path,
                relative: skill,
                path: selected.absolute,
                name: skill,
            };
        } finally {
            collection.close();
        }
    }

    private packageName(proposal: PanelProposal): string {
        return proposal.schema_version === 2 ? this.validator.name(proposal.name) : proposal.skill;
    }

    private targetForProposal(proposal: PanelProposal, write = false) {
        const target = this.target(proposal.skill, write);
        if (
            proposal.schema_version === 2 &&
            (target.name !== proposal.name ||
                target.relative !== proposal.global_relative ||
                target.global_collection_sha256 !== proposal.global_collection_sha256)
        )
            this.conflict();
        return target;
    }

    private replace(proposal: PanelProposal, expected: string, text: string): void {
        const target = this.targetForProposal(proposal, true);
        const collection = new SafeRoot(target.root);
        let root: SafeRoot | undefined;
        let temporary: string | undefined;
        let descriptor: number | undefined;
        let identity: fs.Stats | undefined;
        try {
            const selected = collection.inspect(target.relative);
            root = new SafeRoot(selected.absolute);
            const before = root.inspect('SKILL.md');
            if (!before.info?.isFile()) this.conflict();
            if (hash(root.readBytes('SKILL.md', PANEL_TEXT_BYTES)) !== expected) this.conflict();
            temporary = join(root.path, `.panel-${randomUUID()}.tmp`);
            descriptor = fs.openSync(
                temporary,
                fs.constants.O_WRONLY |
                    fs.constants.O_CREAT |
                    fs.constants.O_EXCL |
                    fs.constants.O_NOFOLLOW,
                before.info.mode & 0o777,
            );
            identity = fs.fstatSync(descriptor);
            fs.writeFileSync(descriptor, text);
            fs.fchmodSync(descriptor, before.info.mode & 0o777);
            fs.fsyncSync(descriptor);
            collection.verifySnapshot(selected);
            root.verifySnapshot(before);
            if (hash(root.readBytes('SKILL.md', PANEL_TEXT_BYTES)) !== expected) this.conflict();
            fs.renameSync(temporary, before.absolute);
            temporary = undefined;
        } finally {
            if (descriptor !== undefined) fs.closeSync(descriptor);
            if (temporary && identity) {
                try {
                    const current = fs.lstatSync(temporary);
                    if (
                        current.dev === identity.dev &&
                        current.ino === identity.ino &&
                        !current.isSymbolicLink()
                    )
                        fs.unlinkSync(temporary);
                } catch {
                    /* Never clean an unknown file. */
                }
            }
            root?.close();
            collection.close();
        }
    }

    private conflict(): never {
        throw new SkillOperationError('panel_conflict');
    }
}
