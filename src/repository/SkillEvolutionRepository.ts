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
} from '../validator/SkillPanelValidator.ts';
import { SkillPackageRevisionRepository } from './SkillPackageRevisionRepository.ts';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
type Validation = {
    local: { status: 'passed' | 'failed'; detail: string };
    official: 'not_run';
    behavioral: 'not_run';
};
export type PanelProposal = {
    schema_version: 1;
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

/** Retains exact package preimages and guarded single-file changes in a stable owned workspace. */
export class SkillEvolutionRepository {
    private readonly validator = new SkillPanelValidator();
    private readonly revisions = new SkillPackageRevisionRepository();
    private readonly configuration: SkillPanelConfiguration;

    constructor(configuration: SkillPanelConfiguration) {
        this.configuration = configuration;
    }

    inspect(skill: string) {
        this.validator.name(skill);
        const collection = new SafeRoot(this.configuration.collection);
        try {
            const selected = collection.inspect(skill);
            if (!selected.info?.isDirectory()) throw new SkillOperationError('invalid_input');
            const observed = this.observePackage(selected.absolute);
            collection.verifySnapshot(selected);
            return { skill, ...observed };
        } finally {
            collection.close();
        }
    }

    prepare(input: { skill: string; base_sha256: string; after: string; rationale: string }) {
        return this.withState(true, (state, collection) => {
            const before = this.inspect(input.skill);
            if (before.package_sha256 !== input.base_sha256 || before.text === input.after)
                this.conflict();
            const metadata = new PortableFrontmatterValidator().parse(input.after) as Record<
                string,
                unknown
            >;
            if (metadata.name !== input.skill) throw new SkillOperationError('invalid_input');
            const count = fs
                .readdirSync(state.path)
                .filter((name) => /^[a-f0-9-]{36}$/.test(name)).length;
            if (count >= 16) throw new SkillOperationError('panel_storage_unavailable');

            const id = randomUUID();
            fs.mkdirSync(join(state.path, id), { mode: 0o700 });
            for (const stage of ['before', 'candidate']) {
                fs.mkdirSync(join(state.path, id, stage), { mode: 0o700 });
                this.copyPackage(
                    join(collection.path, input.skill),
                    join(state.path, id, stage, input.skill),
                    stage === 'candidate' ? input.after : undefined,
                );
            }
            const original = this.observePackage(join(state.path, id, 'before', input.skill));
            const candidate = this.observePackage(join(state.path, id, 'candidate', input.skill));
            if (
                original.package_sha256 !== before.package_sha256 ||
                this.inspect(input.skill).package_sha256 !== before.package_sha256
            )
                this.conflict();

            const validation = this.validateCandidate(
                join(state.path, id, 'candidate', input.skill),
            );
            const receipt: PanelProposal = {
                schema_version: 1,
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

    apply(approval: PanelApproval) {
        return this.withState(true, (state, collection) => {
            const proposal = this.readProposal(state, collection, approval.proposal_id);
            this.assertApproval(proposal, approval, 'apply');
            if (proposal.status === 'recovered') this.conflict();
            const current = this.inspect(proposal.skill);
            if (proposal.status === 'applied') {
                if (current.package_sha256 !== proposal.candidate_sha256) this.conflict();
                return { ...proposal, changed: false };
            }
            if (proposal.validation.local.status !== 'passed')
                throw new SkillOperationError('panel_validation_failed');
            const validation = this.validateCandidate(
                join(state.path, proposal.proposal_id, 'candidate', proposal.skill),
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
            this.replace(proposal.skill, proposal.before_sha256, proposal.after);
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
            this.replace(proposal.skill, proposal.after_sha256, proposal.before);
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
        const root = new SafeRoot(directory);
        try {
            const inventory = root.inventory() as [string, fs.Stats][];
            if (
                inventory.length > 512 ||
                inventory.reduce((total, [, info]) => total + (info.isFile() ? info.size : 0), 0) >
                    8_388_608
            )
                throw new SkillOperationError('invalid_input');
            const revision = this.revisions.inspect(directory);
            const text = new TextDecoder('utf-8', { fatal: true }).decode(
                root.readBytes('SKILL.md', PANEL_TEXT_BYTES),
            );
            const metadata = new PortableFrontmatterValidator().parse(text) as Record<
                string,
                unknown
            >;
            if (metadata.name !== basename(directory))
                throw new SkillOperationError('invalid_input');
            const modes = inventory
                .map(([name, info]) => [name, info.mode & 0o777])
                .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'en'));
            const package_sha256 = hash(
                JSON.stringify({
                    content: revision.package_sha256,
                    root_mode: fs.statSync(root.path).mode & 0o777,
                    modes,
                }),
            );
            if (this.revisions.inspect(directory).package_sha256 !== revision.package_sha256)
                this.conflict();
            return {
                text,
                sha256: hash(text),
                package_sha256,
                description: String(metadata.description),
                files: revision.files,
                bytes: revision.bytes,
            };
        } finally {
            root.close();
        }
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

    private readProposal(state: SafeRoot, collection: SafeRoot, id: string) {
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
        ]);
        this.validator.name(receipt.skill);
        this.validator.text(receipt.rationale, 2000);
        for (const key of [
            'base_sha256',
            'candidate_sha256',
            'before_sha256',
            'after_sha256',
        ] as const)
            this.validator.hash(receipt[key]);
        if (
            receipt.schema_version !== 1 ||
            receipt.proposal_id !== id ||
            receipt.collection_sha256 !== hash(collection.path)
        )
            this.conflict();
        const original = this.observePackage(join(state.path, id, 'before', receipt.skill));
        const candidate = this.observePackage(join(state.path, id, 'candidate', receipt.skill));
        if (
            original.package_sha256 !== receipt.base_sha256 ||
            original.sha256 !== receipt.before_sha256 ||
            candidate.package_sha256 !== receipt.candidate_sha256 ||
            candidate.sha256 !== receipt.after_sha256
        )
            this.conflict();
        const validation = this.validateCandidate(join(state.path, id, 'candidate', receipt.skill));
        if (JSON.stringify(validation) !== JSON.stringify(receipt.validation)) this.conflict();
        const recovered = this.hasRecord(state, `${id}/recovered.json`, receipt, 'recovered');
        const applied = this.hasRecord(state, `${id}/applied.json`, receipt, 'applied');
        return {
            ...receipt,
            before: original.text,
            after: candidate.text,
            status: recovered ? 'recovered' : applied ? 'applied' : 'proposed',
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
            if (target.info === null) {
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

    private replace(skill: string, expected: string, text: string): void {
        const collection = new SafeRoot(this.configuration.collection);
        let root: SafeRoot | undefined;
        let temporary: string | undefined;
        let descriptor: number | undefined;
        let identity: fs.Stats | undefined;
        try {
            const selected = collection.inspect(skill);
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
