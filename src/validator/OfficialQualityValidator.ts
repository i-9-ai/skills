// SPDX-License-Identifier: Apache-2.0
import { SkillEvidenceContractValidator } from './SkillEvidenceContractValidator.ts';
import type { PackageEvidenceSource } from './SkillEvidenceContractValidator.ts';

export const OFFICIAL_QUALITY_BYTES = 16_384;
export type OfficialQualityRequest = {
    collection: string;
    skill: string;
    source: PackageEvidenceSource;
};
type Fingerprint = { package_sha256: string; files: number; bytes: number };
type Outcome = 'completed' | 'timeout' | 'unavailable' | 'interrupted' | 'execution_error';
type Signal =
    | 'SIGTERM'
    | 'SIGKILL'
    | 'SIGINT'
    | 'SIGHUP'
    | 'SIGQUIT'
    | 'SIGABRT'
    | 'SIGSEGV'
    | 'SIGPIPE'
    | 'SIGILL'
    | 'SIGBUS'
    | 'SIGFPE'
    | 'SIGBREAK'
    | 'other';
type VersionStatus = 'matched' | 'mismatch' | 'unavailable' | 'not-run';
type Reason =
    | 'conformance_pass'
    | 'conformance_fail'
    | 'package_changed'
    | 'package_after_unavailable'
    | 'setup_not_run'
    | 'setup_unavailable'
    | 'version_mismatch'
    | 'version_unavailable'
    | 'version_not_run'
    | 'process_timeout'
    | 'process_unavailable'
    | 'process_interrupted'
    | 'process_execution_error';
export type OfficialQualityArtifact = OfficialQualityRequest & {
    schema_version: 1;
    event_id: string;
    correlation_id: string;
    occurred_at: string;
    method: { name: 'skills-ref'; version: string; revision: string; source_sha256: string };
    setup: 'completed' | 'not-run' | 'unavailable';
    version_check: { status: VersionStatus; observed_version: string | null };
    process: { status: Outcome; exit_code: number | null; signal: Signal | null };
    before: Fingerprint;
    after: Fingerprint | null;
    result: 'pass' | 'fail' | 'blocked';
    reason: Reason;
};

/** Closed metadata normalization only; process/source authenticity belongs to the observer. */
export class OfficialQualityValidator {
    private readonly contract = new SkillEvidenceContractValidator();

    request(value: unknown): OfficialQualityRequest {
        this.bounded(value);
        const input = this.contract.object(value, ['collection', 'skill', 'source']);
        const collection = this.contract.slug(input.collection);
        const skill = this.contract.slug(input.skill);
        const source = this.contract.packageSource(input.source);
        if (skill === 'generated-scaffold' || source.package_path !== '.agents/skills/' + skill)
            this.contract.invalid();
        return { collection, skill, source };
    }

    /** Internal observation data must agree with the independently validated request. */
    artifact(value: unknown, request: OfficialQualityRequest): OfficialQualityArtifact {
        return this.normalize(value, request, false);
    }

    /** Internal observations derive their verdict; caller-supplied verdict fields are rejected. */
    observation(value: unknown, request: OfficialQualityRequest): OfficialQualityArtifact {
        return this.normalize(value, request, true);
    }

    private normalize(
        value: unknown,
        request: OfficialQualityRequest,
        derive: boolean,
    ): OfficialQualityArtifact {
        const subject = this.request(request);
        this.bounded(value);
        const fields = [
            'schema_version',
            'event_id',
            'correlation_id',
            'occurred_at',
            'collection',
            'skill',
            'source',
            'method',
            'setup',
            'version_check',
            'process',
            'before',
            'after',
            'result',
            'reason',
        ];
        const input = this.contract.object(
            value,
            derive ? fields.filter((field) => !['result', 'reason'].includes(field)) : fields,
        );
        if (input.schema_version !== 1) this.contract.invalid();
        const selected = this.request({
            collection: input.collection,
            skill: input.skill,
            source: input.source,
        });
        if (JSON.stringify(selected) !== JSON.stringify(subject)) this.contract.invalid();
        const methodInput = this.contract.object(input.method, [
            'name',
            'version',
            'revision',
            'source_sha256',
        ]);
        if (
            methodInput.name !== 'skills-ref' ||
            typeof methodInput.revision !== 'string' ||
            !/^[a-f0-9]{40}$/.test(methodInput.revision)
        )
            this.contract.invalid();
        const method: OfficialQualityArtifact['method'] = {
            name: 'skills-ref',
            version: this.version(methodInput.version),
            revision: methodInput.revision as string,
            source_sha256: this.contract.hash(methodInput.source_sha256),
        };
        const setup = this.choice(input.setup, ['completed', 'not-run', 'unavailable'] as const);
        const versionInput = this.contract.object(input.version_check, [
            'status',
            'observed_version',
        ]);
        const version_check = {
            status: this.choice(versionInput.status, [
                'matched',
                'mismatch',
                'unavailable',
                'not-run',
            ] as const),
            observed_version:
                versionInput.observed_version === null
                    ? null
                    : this.version(versionInput.observed_version),
        };
        if (
            (version_check.status === 'matched' &&
                version_check.observed_version !== method.version) ||
            (version_check.status === 'mismatch' &&
                version_check.observed_version === method.version) ||
            (['unavailable', 'not-run'].includes(version_check.status) &&
                version_check.observed_version !== null)
        )
            this.contract.invalid();
        const processInput = this.contract.object(input.process, ['status', 'exit_code', 'signal']);
        const process: OfficialQualityArtifact['process'] = {
            status: this.choice(processInput.status, [
                'completed',
                'timeout',
                'unavailable',
                'interrupted',
                'execution_error',
            ] as const),
            exit_code:
                processInput.exit_code === null
                    ? null
                    : this.contract.integer(processInput.exit_code, 0, 4_294_967_295),
            signal:
                processInput.signal === null
                    ? null
                    : this.choice(processInput.signal, [
                          'SIGTERM',
                          'SIGKILL',
                          'SIGINT',
                          'SIGHUP',
                          'SIGQUIT',
                          'SIGABRT',
                          'SIGSEGV',
                          'SIGPIPE',
                          'SIGILL',
                          'SIGBUS',
                          'SIGFPE',
                          'SIGBREAK',
                          'other',
                      ] as const),
        };
        if (
            (process.status === 'completed' &&
                (process.exit_code === null || process.signal !== null)) ||
            (process.status === 'unavailable' &&
                (process.exit_code !== null || process.signal !== null)) ||
            (setup !== 'completed' && version_check.status !== 'not-run') ||
            ((setup !== 'completed' || version_check.status !== 'matched') &&
                process.status !== 'unavailable')
        )
            this.contract.invalid();
        const before = this.fingerprint(input.before);
        const after = input.after === null ? null : this.fingerprint(input.after);
        if (before.package_sha256 !== subject.source.package_sha256) this.contract.invalid();
        const expected = this.result(before, after, setup, version_check.status, process);
        if (!derive && (input.result !== expected.result || input.reason !== expected.reason))
            this.contract.invalid();
        const artifact: OfficialQualityArtifact = {
            schema_version: 1,
            event_id: this.contract.uuid(input.event_id),
            correlation_id: this.contract.uuid(input.correlation_id),
            occurred_at: this.contract.timestamp(input.occurred_at),
            ...subject,
            method,
            setup,
            version_check,
            process,
            before,
            after,
            ...expected,
        };
        this.bounded(artifact);
        return artifact;
    }

    private result(
        before: Fingerprint,
        after: Fingerprint | null,
        setup: OfficialQualityArtifact['setup'],
        version: VersionStatus,
        process: OfficialQualityArtifact['process'],
    ): Pick<OfficialQualityArtifact, 'result' | 'reason'> {
        if (after === null) return { result: 'blocked', reason: 'package_after_unavailable' };
        if (JSON.stringify(before) !== JSON.stringify(after))
            return { result: 'blocked', reason: 'package_changed' };
        if (setup !== 'completed')
            return {
                result: 'blocked',
                reason: setup === 'not-run' ? 'setup_not_run' : 'setup_unavailable',
            };
        if (version !== 'matched') {
            const reasons = {
                mismatch: 'version_mismatch',
                unavailable: 'version_unavailable',
                'not-run': 'version_not_run',
            } as const;
            return { result: 'blocked', reason: reasons[version] };
        }
        if (process.status === 'completed')
            return process.exit_code === 0
                ? { result: 'pass', reason: 'conformance_pass' }
                : { result: 'fail', reason: 'conformance_fail' };
        const reasons = {
            timeout: 'process_timeout',
            unavailable: 'process_unavailable',
            interrupted: 'process_interrupted',
            execution_error: 'process_execution_error',
        } as const;
        return { result: 'blocked', reason: reasons[process.status] };
    }

    private fingerprint(value: unknown): Fingerprint {
        const input = this.contract.object(value, ['package_sha256', 'files', 'bytes']);
        return {
            package_sha256: this.contract.hash(input.package_sha256),
            files: this.contract.integer(input.files, 2, 2048),
            bytes: this.contract.integer(input.bytes, 0, 33_554_432),
        };
    }
    private version(value: unknown): string {
        if (
            typeof value !== 'string' ||
            value.length > 128 ||
            !/^[0-9]+(?:\.[0-9]+)*(?:\.post[0-9]+)?$/.test(value)
        )
            this.contract.invalid();
        return value as string;
    }
    private choice<T extends string>(value: unknown, choices: readonly T[]): T {
        if (!choices.includes(value as T)) this.contract.invalid();
        return value as T;
    }
    private bounded(value: unknown): void {
        try {
            if (Buffer.byteLength(JSON.stringify(value)) > OFFICIAL_QUALITY_BYTES)
                this.contract.invalid();
        } catch {
            this.contract.invalid();
        }
    }
}
