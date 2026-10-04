// SPDX-License-Identifier: Apache-2.0
import { InstalledCollectionConfiguration } from '../config/InstalledCollectionConfiguration.ts';
import { SkillEvidenceDatabaseRepository } from '../repository/SkillEvidenceDatabaseRepository.ts';
import { SkillQualityRepository } from '../repository/SkillQualityRepository.ts';
import { SkillPackageRevisionRepository } from '../repository/SkillPackageRevisionRepository.ts';
import { PluginDataRepository } from '../repository/PluginDataRepository.ts';
import { TelemetryInputRepository } from '../repository/TelemetryInputRepository.ts';
import { SkillQualityValidator } from '../validator/SkillQualityValidator.ts';
import type { SkillQualityReceipt } from '../validator/SkillQualityValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';
import { SkillQualityBenchmarkService } from './SkillQualityBenchmarkService.ts';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { OfficialValidationService } from './OfficialValidationService.ts';
import { OfficialQualityValidator } from '../validator/OfficialQualityValidator.ts';
import type { OfficialQualityArtifact } from '../validator/OfficialQualityValidator.ts';
import { SkillQualityArtifactRepository } from '../repository/SkillQualityArtifactRepository.ts';

type DatabaseSelection = string | (() => string);
type InputSelection = { repository: SkillQualityArtifactRepository; token: object };
/** Explicit evidence ingress; verification finishes before resolving or creating storage. */
export class SkillQualityService {
    private readonly observations = new WeakMap<object, SkillQualityReceipt>();
    private readonly protectedRoots: string[];
    private readonly official: Pick<OfficialValidationService, 'validateOfficial'> | undefined;
    constructor(
        protectedRoots = [new InstalledCollectionConfiguration().root(), process.cwd()],
        official?: Pick<OfficialValidationService, 'validateOfficial'>,
    ) {
        this.protectedRoots = [...protectedRoots];
        this.official = official;
    }

    record(database: DatabaseSelection, value: unknown) {
        return this.recordInput(database, value);
    }

    private recordInput(database: DatabaseSelection, value: unknown, input?: InputSelection) {
        const request = new SkillQualityValidator().request(value);
        const receipt = request.receipt;
        const protectedRoots = [...this.protectedRoots];
        if (request.package_root) {
            let inspected;
            try {
                inspected = new SkillPackageRevisionRepository().inspect(request.package_root);
            } catch {
                throw new SkillOperationError('invalid_input');
            }
            if (inspected.package_sha256 !== receipt.payload.source.package_sha256)
                throw new SkillOperationError('invalid_input');
            protectedRoots.push(request.package_root);
        }
        if (request.benchmark) {
            protectedRoots.push(request.benchmark);
            let observed;
            try {
                observed = new SkillQualityBenchmarkService().observe(receipt, request.benchmark);
            } catch {
                throw new SkillOperationError('invalid_input');
            }
            return this.persistVerifiedReceipt(database, observed, protectedRoots, input);
        }
        return this.store(
            database,
            false,
            protectedRoots,
            (connection) =>
                new SkillQualityRepository(connection).record(this.assertionInput(receipt)),
            input,
        );
    }

    async recordFile(
        database: DatabaseSelection,
        file: string,
        selections: { package_root?: string; benchmark?: string } = {},
    ) {
        let receipt: unknown;
        let input: InputSelection | undefined;
        try {
            if (file !== '-') {
                const repository = new SkillQualityArtifactRepository();
                input = { repository, token: repository.selectInput(resolve(file)) };
            }
            receipt = await new TelemetryInputRepository().read(file, process.stdin, 16_384);
        } catch {
            throw new SkillOperationError('invalid_input');
        }
        return this.recordInput(database, { receipt, ...selections }, input);
    }

    inspect(database: DatabaseSelection, value: unknown) {
        new SkillQualityValidator().query(value);
        return this.store(database, true, this.protectedRoots, (connection) =>
            new SkillQualityRepository(connection).inspect(value),
        );
    }

    /** Explicit prepared-CI process path; public receipt JSON cannot supply observations. */
    observeOfficial(
        root: string,
        value: unknown,
        database: string,
        output: string,
        inputFiles: string[] = [],
    ) {
        if (!this.official) throw new SkillOperationError('invalid_input');
        const validator = new OfficialQualityValidator();
        const request = validator.request(value);
        const selectedPath = join(root, '.agents', 'skills', request.skill);
        const packages = new SkillPackageRevisionRepository();
        const initial = packages.inspect(selectedPath);
        if (initial.package_sha256 !== request.source.package_sha256)
            throw new SkillOperationError('invalid_input');
        const protectedRoots = [...this.protectedRoots, root, selectedPath];
        const artifacts = new SkillQualityArtifactRepository();
        const selection = artifacts.select(database, output, {
            installed: new InstalledCollectionConfiguration().root(),
            caller: root,
            selected_package: selectedPath,
            additional: this.protectedRoots,
            input_files: inputFiles,
        });
        const identity = {
            event_id: randomUUID(),
            correlation_id: randomUUID(),
            occurred_at: new Date().toISOString(),
        };
        let method: OfficialQualityArtifact['method'] | undefined;
        let setup: OfficialQualityArtifact['setup'] = 'not-run';
        let version: OfficialQualityArtifact['version_check'] = {
            status: 'not-run',
            observed_version: null,
        };
        let process: OfficialQualityArtifact['process'] = {
            status: 'unavailable',
            exit_code: null,
            signal: null,
        };
        let before = initial;
        let after: typeof initial | null = null;
        let started = false;
        let observed = false;
        let failed = false;
        let results: ReturnType<OfficialValidationService['validateOfficial']> = [];
        try {
            results = this.official.validateOfficial(root, {
                beforeSetup: (requirements, canonical) => {
                    const selected = canonical.find((item) => item.name === request.skill);
                    if (!selected || selected.path !== selectedPath)
                        throw new SkillOperationError('invalid_input');
                    method = { ...requirements.method };
                    const fresh = packages.inspect(selectedPath);
                    if (fresh.package_sha256 !== initial.package_sha256)
                        throw new SkillOperationError('invalid_input');
                },
                onSetup: (state) => {
                    if (state === 'completed') {
                        setup = 'completed';
                        return;
                    }
                    if (state === 'setup_failed') setup = 'unavailable';
                },
                onVersion: (observation) => {
                    const states = {
                        verified: 'matched',
                        version_unavailable: 'unavailable',
                        version_mismatch: 'mismatch',
                    } as const;
                    version = {
                        status: states[observation.state],
                        observed_version:
                            observation.state === 'version_unavailable'
                                ? null
                                : observation.observed_version,
                    };
                },
                beforeValidate: (selected) => {
                    if (selected.name !== request.skill) return;
                    if (selected.path !== selectedPath || started)
                        throw new SkillOperationError('invalid_input');
                    before = packages.inspect(selectedPath);
                    if (before.package_sha256 !== initial.package_sha256)
                        throw new SkillOperationError('invalid_input');
                    started = true;
                },
                afterValidate: (selected, outcome) => {
                    if (selected.name !== request.skill) return;
                    if (selected.path !== selectedPath || !started || observed)
                        throw new SkillOperationError('invalid_input');
                    process = { ...outcome };
                    observed = true;
                    try {
                        after = packages.inspect(selectedPath);
                    } catch {
                        after = null;
                    }
                },
            });
        } catch {
            failed = true;
        }
        if (!method) throw new SkillOperationError('invalid_input');
        if (!observed) {
            // No selected validate call completed: retain diagnostics, never a trusted receipt.
            before = initial;
            try {
                after = packages.inspect(selectedPath);
            } catch {
                after = null;
            }
        }
        const artifact = validator.observation(
            {
                schema_version: 1,
                ...identity,
                ...request,
                method,
                setup,
                version_check: version,
                process,
                before,
                after,
            },
            request,
        );
        const retained = artifacts.retain(selection, artifact, request);
        const unchanged =
            artifact.after !== null &&
            JSON.stringify(artifact.before) === JSON.stringify(artifact.after);
        let quality: ReturnType<SkillQualityService['persistVerifiedReceipt']> | null = null;
        if (
            observed &&
            artifact.setup === 'completed' &&
            artifact.version_check.status === 'matched' &&
            unchanged
        ) {
            const completed = artifact.process.status === 'completed';
            const passed = artifact.result === 'pass';
            quality = this.persistVerifiedReceipt(
                database,
                {
                    schema_version: 2,
                    event_type: 'skill.quality.recorded',
                    ...identity,
                    source_host: 'ci',
                    source_adapter: 'official-validator',
                    session: null,
                    payload: {
                        ...request,
                        kind: 'official_validation',
                        assurance: 'locally_observed_official_process',
                        method,
                        result: artifact.result,
                        coverage: {
                            selected_packages: 1,
                            executed: completed ? 1 : 0,
                            blocked: completed ? 0 : 1,
                            not_run: 0,
                            passed: passed ? 1 : 0,
                            failed: artifact.result === 'fail' ? 1 : 0,
                        },
                        artifacts: [{ ...retained, scope: 'official_result' }],
                        limitations: [],
                    },
                },
                protectedRoots,
            );
        }
        return {
            results,
            official_failed: failed,
            observation: { artifact, retained, quality },
        };
    }

    async observeOfficialFile(root: string, file: string, database: string, output: string) {
        let request: unknown;
        try {
            request = await new TelemetryInputRepository().read(file, process.stdin, 16_384);
        } catch {
            throw new SkillOperationError('invalid_input');
        }
        return this.observeOfficial(
            root,
            request,
            database,
            output,
            file === '-' ? [] : [resolve(file)],
        );
    }

    /** Only internally completed observation paths may register a persistence capability. */
    private persistVerifiedReceipt(
        database: DatabaseSelection,
        receipt: SkillQualityReceipt,
        protectedRoots: string[],
        input?: InputSelection,
    ) {
        const capability = Object.freeze({});
        this.observations.set(capability, new SkillQualityValidator().receipt(receipt));
        try {
            return this.store(
                database,
                false,
                protectedRoots,
                (connection) =>
                    new SkillQualityRepository(connection, undefined, (token) => {
                        const observed = this.observations.get(token);
                        if (!observed) throw new SkillOperationError('invalid_input');
                        return structuredClone(observed);
                    }).recordObservation(capability),
                input,
            );
        } finally {
            this.observations.delete(capability);
        }
    }

    private assertionInput(receipt: SkillQualityReceipt) {
        const { assurance: _assurance, ...payload } = receipt.payload;
        return { ...receipt, payload };
    }

    private store<T>(
        selection: DatabaseSelection,
        readOnly: boolean,
        protectedRoots: string[],
        operation: (connection: SkillEvidenceDatabaseRepository) => T,
        input?: InputSelection,
    ): T {
        let connection: SkillEvidenceDatabaseRepository | undefined;
        try {
            const database = typeof selection === 'string' ? selection : selection();
            if (input) input.repository.verifyDatabaseInput(input.token, database);
            const paths = new PluginDataRepository();
            const selected = readOnly
                ? paths.verifyDatabase(database, protectedRoots)
                : paths.prepareDatabase(database, protectedRoots);
            connection = new SkillEvidenceDatabaseRepository(selected, { readOnly });
            return operation(connection);
        } catch (error) {
            if (error instanceof SkillOperationError) throw error;
            throw new SkillOperationError('storage_unavailable');
        } finally {
            connection?.close();
        }
    }
}
