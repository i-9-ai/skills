// SPDX-License-Identifier: Apache-2.0
import {
    chmodSync,
    copyFileSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { NativePilotPreparation } from './NativePilotPreparationRepository.ts';
import { NativePilotInventoryRepository, pilotDigest } from './NativePilotInventoryRepository.ts';
import { NativePilotEvidenceRepository } from './NativePilotEvidenceRepository.ts';
import { NativePilotProcessAuditRepository } from './NativePilotProcessAuditRepository.ts';
import { NativePilotContractValidator } from '../validator/NativePilotContractValidator.ts';
import type {
    NativePilotDockerOutput,
    NativePilotDockerRequest,
} from './NativePilotDockerRepository.ts';
import type { NativePilotSelection } from '../config/NativePilotConfiguration.ts';
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';
import type {
    NativePilotContainerIdentity,
    NativePilotContainerPin,
} from '../validator/NativePilotContainerValidator.ts';
import {
    containerLimits,
    containerRecord,
    requireContainer,
} from '../validator/NativePilotContainerValidator.ts';

export interface NativePilotWorkerRequest {
    schema_version: 1;
    selection: NativePilotSelection;
    nonce: string;
    contract: NativePilotPreparation['contract'];
    account: NativePilotContainerPin['account'];
    expected: Record<string, string>;
}

/** Controller-owned files are never writable or reachable through native output mounts. */
export class NativePilotContainerRepository {
    readonly inventory = new NativePilotInventoryRepository();
    readonly prepared: NativePilotPreparation;
    readonly selection: NativePilotSelection;
    readonly pin: NativePilotContainerPin;
    readonly root: string;
    readonly owned: NativePilotContainerIdentity;
    request!: NativePilotWorkerRequest;
    private evidenceSequence = 0;
    private sourceSequence = 0;
    private traceSequence = 0;
    private retention: { path: string; sha256: string; bytes: number } | null = null;
    private ownershipSha256: string | null = null;

    constructor(
        prepared: NativePilotPreparation,
        selection: NativePilotSelection,
        pin: NativePilotContainerPin,
    ) {
        this.prepared = structuredClone(prepared);
        this.selection = new NativePilotContractValidator().selection(selection);
        this.pin = structuredClone(pin);
        this.root = join(prepared.root, 'output', 'evidence', `container-${selection.run_id}`);
        const nonce = randomBytes(16).toString('hex');
        const prefix = `i9-pilot-${nonce}`;
        this.owned = {
            selection: this.selection,
            nonce,
            name: `${prefix}-${selection.host}-${selection.repetition}`,
            labels: {
                'i9.pilot.owner': 'bounded-native-pilot-v1',
                'i9.pilot.run': selection.run_id,
                'i9.pilot.nonce': nonce,
                'i9.pilot.host': selection.host,
                'i9.pilot.repetition': String(selection.repetition),
            },
            mount: join(this.root, 'mount'),
            volumes: {
                home: `${prefix}-home`,
                state: `${prefix}-state`,
                work: `${prefix}-work`,
                'native-output': `${prefix}-native-output`,
            },
        };
    }

    assertInputs() {
        const { prepared } = this;
        new NativePilotContractValidator().resolved(prepared.contract);
        new NativePilotEvidenceRepository().preflightOutput(
            prepared.root,
            prepared.contract_sha256,
            join(prepared.root, 'output', 'journal'),
            join(prepared.root, 'output', 'evidence'),
        );
        requireContainer(
            pilotDigest(JSON.stringify(prepared.contract)) === prepared.contract_sha256,
            'Prepared contract metadata differs.',
        );
        for (const name of ['source_a', 'source_b', 'driver', 'observer'] as const) {
            const measured = this.inventory.tree(join(prepared.root, 'input', name));
            requireContainer(
                measured.tree_sha256 === prepared.contract[name].tree_sha256 &&
                    JSON.stringify(measured) === JSON.stringify(prepared.trees[name]),
                'Prepared input bytes or inventory metadata differs.',
            );
        }
        for (const name of ['node', 'codex', 'claude'] as const)
            requireContainer(
                this.inventory.file(join(prepared.root, 'runtime-bin', name), 536_870_912)
                    .sha256 === prepared.contract.binaries[name].sha256,
                'Prepared binary differs.',
            );
        this.inventory.verifyPrivateReview(prepared.contract.driver, 'driver');
        this.inventory.verifyPrivateReview(prepared.contract.observer, 'observer');
    }

    stage() {
        this.assertInputs(); // No mkdir before full path and physical input preflight.
        if (this.pin.image.build) this.assertBuildReceipt();
        mkdirSync(this.root, { mode: 0o700 });
        this.ownershipSha256 = this.inventory.writeJson(join(this.root, 'ownership.json'), {
            schema_version: 1,
            contract_sha256: this.prepared.contract_sha256,
            ...this.owned,
        }).sha256;
        if (this.pin.image.build) {
            copyFileSync(
                this.pin.image.build.receipt_path,
                join(this.root, 'image-build-receipt.json'),
            );
            copyFileSync(this.pin.image.build.dockerfile_path, join(this.root, 'image-Dockerfile'));
            requireContainer(
                this.inventory.file(join(this.root, 'image-build-receipt.json')).sha256 ===
                    this.pin.image.build.receipt_sha256 &&
                    this.inventory.file(join(this.root, 'image-Dockerfile')).sha256 ===
                        this.pin.image.build.dockerfile_sha256,
                'Build evidence changed during retention.',
            );
        }
        mkdirSync(join(this.root, 'docker-config'), { mode: 0o700 });
        mkdirSync(this.owned.mount, { mode: 0o755 });
        for (const directory of [
            'input',
            'runtime-bin',
            'control',
            'consumer',
            'state',
            'work',
            'native-output',
        ])
            mkdirSync(join(this.owned.mount, directory), { mode: 0o777 });
        for (const name of ['source_a', 'source_b', 'driver', 'observer'] as const)
            this.inventory.copyTree(
                join(this.prepared.root, 'input', name),
                join(this.owned.mount, 'input', name),
                this.prepared.trees[name],
            );
        this.inventory.copyTree(
            join(this.prepared.root, 'input', 'source_a'),
            join(this.owned.mount, 'source'),
            this.prepared.trees.source_a,
        );
        for (const name of ['node', 'codex', 'claude'] as const) {
            copyFileSync(
                join(this.prepared.root, 'runtime-bin', name),
                join(this.owned.mount, 'runtime-bin', name),
            );
            chmodSync(join(this.owned.mount, 'runtime-bin', name), 0o755);
        }
        this.inventory.writeJson(join(this.owned.mount, 'contract.json'), this.prepared.contract);
        writeFileSync(
            join(this.owned.mount, 'consumer', 'unrelated.txt'),
            'Owned disposable native pilot fixture. Preserve these bytes.\n',
            { flag: 'wx', mode: 0o644 },
        );
        this.request = {
            schema_version: 1,
            selection: this.selection,
            nonce: this.owned.nonce,
            contract: this.prepared.contract,
            account: this.pin.account,
            expected: {
                source_a: this.prepared.trees.source_a.tree_sha256,
                source_b: this.prepared.trees.source_b.tree_sha256,
                driver: this.prepared.trees.driver.tree_sha256,
                observer: this.prepared.trees.observer.tree_sha256,
                node: this.prepared.contract.binaries.node.sha256,
                codex: this.prepared.contract.binaries.codex.sha256,
                claude: this.prepared.contract.binaries.claude.sha256,
                source: this.prepared.trees.source_a.tree_sha256,
                consumer: this.inventory.tree(join(this.owned.mount, 'consumer')).tree_sha256,
            },
        };
        this.inventory.writeJson(join(this.owned.mount, 'control', 'worker.json'), this.request);
        this.inventory.writeJson(
            join(this.owned.mount, 'control', 'source-a.inventory.json'),
            this.prepared.trees.source_a,
        );
        this.inventory.writeJson(
            join(this.owned.mount, 'control', 'source-b.inventory.json'),
            this.prepared.trees.source_b,
        );
        this.readable(this.owned.mount);
        // Writable directory permission makes the subsequent EROFS probe meaningful.
        // This copy is under a 0700 controller parent and becomes one read-only bind.
        for (const directory of ['input', 'runtime-bin', 'control', 'consumer', 'source'])
            chmodSync(join(this.owned.mount, directory), 0o777);
        this.assertStage();
    }

    private assertBuildReceipt() {
        const build = this.pin.image.build!;
        requireContainer(
            this.inventory.file(build.receipt_path, 1_048_576).sha256 === build.receipt_sha256 &&
                this.inventory.file(build.dockerfile_path, 1_048_576).sha256 ===
                    build.dockerfile_sha256,
            'Selected local image evidence bytes differ.',
        );
        const receipt = containerRecord(this.inventory.readJson(build.receipt_path));
        requireContainer(
            receipt.schema_version === 1 &&
                receipt.kind === 'local-derived' &&
                receipt.build_exit_code === 0 &&
                receipt.dockerfile_sha256 === build.dockerfile_sha256 &&
                receipt.base_reference === build.base_reference &&
                receipt.base_id === build.base_id &&
                receipt.image_id === this.pin.image.id &&
                receipt.platform === this.pin.image.platform &&
                receipt.config_sha256 === this.pin.image.config_sha256 &&
                JSON.stringify(receipt.rootfs_layers) ===
                    JSON.stringify(this.pin.image.rootfs_layers),
            'Build receipt does not reconcile the exact selected image.',
        );
    }

    private assertOwnedOutput() {
        requireContainer(this.ownershipSha256, 'Owned output has not been established.');
        new NativePilotEvidenceRepository().preflightOutput(
            this.prepared.root,
            this.prepared.contract_sha256,
            join(this.prepared.root, 'output', 'journal'),
            join(this.prepared.root, 'output', 'evidence'),
        );
        this.inventory.canonicalDirectory(this.root);
        requireContainer(
            this.inventory.file(join(this.root, 'ownership.json'), 1_048_576).sha256 ===
                this.ownershipSha256,
            'Controller output ownership changed.',
        );
    }

    private readable(path: string) {
        const stat = lstatSync(path);
        if (stat.isSymbolicLink()) return;
        if (stat.isDirectory()) {
            chmodSync(path, 0o755);
            for (const name of readdirSync(path)) this.readable(join(path, name));
        } else chmodSync(path, stat.mode & 0o111 ? 0o755 : 0o644);
    }

    assertStage() {
        this.assertOwnedOutput();
        this.assertInputs();
        for (const [name, expected] of Object.entries(this.request.expected)) {
            const path = ['node', 'codex', 'claude'].includes(name)
                ? join(this.owned.mount, 'runtime-bin', name)
                : ['source', 'consumer'].includes(name)
                  ? join(this.owned.mount, name)
                  : join(this.owned.mount, 'input', name);
            const measured = ['node', 'codex', 'claude'].includes(name)
                ? this.inventory.file(path, 536_870_912).sha256
                : this.inventory.tree(path).tree_sha256;
            requireContainer(measured === expected, 'Staged immutable bytes differ.');
        }
        requireContainer(
            JSON.stringify(
                this.inventory.readJson(join(this.owned.mount, 'control', 'worker.json')),
            ) === JSON.stringify(this.request),
            'Worker control changed.',
        );
        for (const pin of ['a', 'b'] as const)
            requireContainer(
                JSON.stringify(
                    this.inventory.readJson(
                        join(this.owned.mount, 'control', `source-${pin}.inventory.json`),
                    ),
                ) === JSON.stringify(this.prepared.trees[pin === 'a' ? 'source_a' : 'source_b']),
                'Observer source inventory changed.',
            );
    }

    select(pin: 'a' | 'b') {
        this.assertStage();
        const before = lstatSync(this.owned.mount);
        const key = pin === 'a' ? 'source_a' : 'source_b';
        const staged = join(this.owned.mount, `next-source-${++this.sourceSequence}`);
        this.inventory.copyTree(
            join(this.prepared.root, 'input', key),
            staged,
            this.prepared.trees[key],
        );
        this.readable(staged);
        chmodSync(staged, 0o777);
        renameSync(
            join(this.owned.mount, 'source'),
            join(this.root, `previous-source-${this.sourceSequence}`),
        );
        renameSync(staged, join(this.owned.mount, 'source'));
        this.request.expected.source = this.prepared.trees[key].tree_sha256;
        const next = join(this.owned.mount, 'control', `worker-${this.sourceSequence}.json`);
        this.inventory.writeJson(next, this.request);
        chmodSync(next, 0o644);
        renameSync(next, join(this.owned.mount, 'control', 'worker.json'));
        const after = lstatSync(this.owned.mount);
        requireContainer(
            before.dev === after.dev && before.ino === after.ino,
            'Stable bind parent changed.',
        );
        this.assertStage();
    }

    evidence(kind: string, value: unknown) {
        this.assertOwnedOutput();
        requireContainer(/^[a-z-]+$/.test(kind), 'Fixed evidence kind required.');
        const name = `${String(++this.evidenceSequence).padStart(3, '0')}-${kind}.json`;
        const receipt = this.inventory.writeJson(join(this.root, name), value);
        return { path: `container-${this.selection.run_id}/${name}`, ...receipt };
    }

    trace(request: NativePilotDockerRequest, output: NativePilotDockerOutput | null) {
        this.assertOwnedOutput();
        const stem = `docker-${String(++this.traceSequence).padStart(4, '0')}`;
        const requestFile = this.inventory.writeJson(join(this.root, `${stem}.request.json`), {
            executable: request.executable,
            args: request.args,
            cwd: request.cwd,
            shell: false,
            timeout_ms: request.timeoutMs,
            max_output_bytes: request.maxOutputBytes,
            environment_names: Object.keys(request.env),
        });
        const bounded =
            output &&
            typeof output.stdout === 'string' &&
            typeof output.stderr === 'string' &&
            Buffer.byteLength(output.stdout) + Buffer.byteLength(output.stderr) <=
                request.maxOutputBytes;
        const streams: Record<string, unknown> = {};
        if (bounded)
            for (const stream of ['stdout', 'stderr'] as const) {
                const path = `${stem}.${stream}`;
                writeFileSync(join(this.root, path), output[stream], {
                    flag: 'wx',
                    mode: 0o600,
                });
                streams[stream] = {
                    path,
                    ...this.inventory.file(join(this.root, path), request.maxOutputBytes),
                };
            }
        // Known bounded response bytes are retained before JSON/schema/status interpretation.
        // Unknown objects, arbitrary exceptions and unbounded output are never dumped.
        this.inventory.writeJson(join(this.root, `${stem}.receipt.json`), {
            schema_version: 1,
            request: { path: `${stem}.request.json`, ...requestFile },
            response: bounded
                ? 'retained-before-interpretation'
                : output === null
                  ? 'no-complete-response'
                  : 'invalid-or-over-bound',
            exit_code: Number.isSafeInteger(output?.exitCode) ? output!.exitCode : null,
            signal:
                typeof output?.signal === 'string' && /^SIG[A-Z0-9]{1,16}$/.test(output.signal)
                    ? output.signal
                    : null,
            timed_out: output?.timedOut === true,
            output_truncated: output?.outputTruncated === true,
            streams,
            native_acceptance: false,
        });
    }

    retain(raw: string, checkpoint: string | null = null) {
        this.assertOwnedOutput();
        requireContainer(
            checkpoint === null ||
                (NativePilotConfiguration.phases.includes(checkpoint) &&
                    !['retain', 'cleanup-owned'].includes(checkpoint)),
            'Unknown phase checkpoint.',
        );
        requireContainer(
            !this.retention && Buffer.byteLength(raw) <= containerLimits.retention_output,
            'Retention must be new and bounded.',
        );
        const bundle = containerRecord(JSON.parse(raw));
        requireContainer(
            bundle.schema_version === 1 &&
                bundle.operation === 'export' &&
                bundle.nonce === this.owned.nonce &&
                JSON.stringify(bundle.selection) === JSON.stringify(this.selection) &&
                bundle.audit?.schema_version === 1 &&
                bundle.audit.operation === 'audit' &&
                bundle.audit.nonce === this.owned.nonce &&
                JSON.stringify(bundle.audit.selection) === JSON.stringify(this.selection) &&
                NativePilotProcessAuditRepository.quiescent(bundle.audit) &&
                Array.isArray(bundle.roots) &&
                bundle.roots.length === 4,
            'Retention identity differs.',
        );
        let bytes = 0;
        let count = 0;
        for (const [index, role] of ['home', 'state', 'work', 'native-output'].entries()) {
            const root = containerRecord(bundle.roots[index]);
            requireContainer(
                root.name === role &&
                    root.path === (role === 'home' ? this.pin.account.home : `/pilot/${role}`) &&
                    Array.isArray(root.entries),
                'Retention roots differ.',
            );
            let previous = '';
            for (const entry of root.entries) {
                const e = containerRecord(entry);
                requireContainer(
                    typeof e.path === 'string' &&
                        e.path.length > 0 &&
                        e.path.length <= 4096 &&
                        !e.path.startsWith('/') &&
                        !/[\\\x00-\x1f\x7f]/.test(e.path) &&
                        !e.path.split('/').some((v: string) => ['', '.', '..'].includes(v)) &&
                        e.path > previous,
                    'Retention entry path differs or duplicates.',
                );
                previous = e.path;
                count++;
                requireContainer(
                    count <= containerLimits.retention_entries &&
                        Number.isSafeInteger(e.bytes) &&
                        e.bytes >= 0,
                    'Retention entry bound exceeded.',
                );
                if (e.kind === 'file') {
                    requireContainer(
                        typeof e.base64 === 'string' &&
                            e.target === null &&
                            e.bytes <= containerLimits.retention_file_bytes &&
                            e.base64.length === 4 * Math.ceil(e.bytes / 3) &&
                            /^[a-f0-9]{64}$/.test(e.sha256),
                        'Invalid retained file.',
                    );
                    const content = Buffer.from(e.base64, 'base64');
                    bytes += content.length;
                    requireContainer(
                        content.toString('base64') === e.base64 &&
                            content.length === e.bytes &&
                            pilotDigest(content) === e.sha256,
                        'Retained file content differs.',
                    );
                } else if (e.kind === 'symlink') {
                    requireContainer(
                        typeof e.target === 'string' &&
                            e.base64 === null &&
                            e.bytes === Buffer.byteLength(e.target) &&
                            pilotDigest(e.target) === e.sha256,
                        'Retained inert link differs.',
                    );
                } else
                    requireContainer(
                        e.kind === 'directory' &&
                            e.bytes === 0 &&
                            e.sha256 === null &&
                            e.base64 === null &&
                            e.target === null,
                        'Unsupported retention entry.',
                    );
                requireContainer(
                    bytes <= containerLimits.retention_bytes,
                    'Retention byte bound exceeded.',
                );
            }
        }
        const name =
            checkpoint === null ? 'retained-state.json' : `phase-${checkpoint}-export.json`;
        const path = join(this.root, name);
        writeFileSync(path, raw, { flag: 'wx', mode: 0o600 });
        const measured = this.inventory.file(path, containerLimits.retention_output);
        requireContainer(
            measured.sha256 === pilotDigest(raw),
            'Retained bytes differ after writing.',
        );
        if (checkpoint !== null)
            return {
                path: `container-${this.selection.run_id}/${name}`,
                sha256: measured.sha256,
                bytes: measured.bytes,
            };
        this.retention = { path, sha256: measured.sha256, bytes: measured.bytes };
        return this.evidence('retention-receipt', {
            schema_version: 1,
            ...this.retention,
            roots: 4,
            entries: count,
            decoded_bytes: bytes,
            format: 'inert-json-records-never-extracted',
            includes_final_controller_journal: false,
        });
    }

    verifyRetention() {
        this.assertOwnedOutput();
        requireContainer(
            this.retention,
            'No verified private retention receipt; preserve volumes.',
        );
        const measured = this.inventory.file(
            this.retention!.path,
            containerLimits.retention_output,
        );
        requireContainer(
            measured.sha256 === this.retention!.sha256 && measured.bytes === this.retention!.bytes,
            'Retained evidence changed; preserve volumes.',
        );
        return { ...this.retention! };
    }

    partialContainerId() {
        try {
            this.assertOwnedOutput();
            const file = join(this.root, 'container.id');
            this.inventory.file(file, 65);
            const id = readFileSync(file, 'utf8').trim();
            return /^[a-f0-9]{64}$/.test(id) ? id : null;
        } catch {
            return null;
        }
    }
}
