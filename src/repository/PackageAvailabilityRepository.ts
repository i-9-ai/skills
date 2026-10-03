// SPDX-License-Identifier: Apache-2.0
import { createHash, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

type PackageIdentity = { name: string; version: string };
type AvailabilityLimits = {
    deadlineMs: number;
    requestTimeoutMs: number;
    retryDelayMs: number;
    attempts: number;
    metadataBytes: number;
    tarballBytes: number;
};
type AvailabilityDependencies = {
    fetch?: typeof globalThis.fetch;
    now?: () => number;
    wait?: (milliseconds: number) => Promise<unknown>;
    limits?: Partial<AvailabilityLimits>;
};
type PackageMetadata = {
    tarball: string;
    integrity: string;
    digest: Buffer;
};

export const PACKAGE_AVAILABILITY_LIMITS: Readonly<AvailabilityLimits> = Object.freeze({
    deadlineMs: 15 * 60 * 1000,
    requestTimeoutMs: 15 * 1000,
    retryDelayMs: 10 * 1000,
    attempts: 91,
    metadataBytes: 512 * 1024,
    tarballBytes: 64 * 1024 * 1024,
});

const registry = 'https://registry.npmjs.org/';
const identityBytes = 8 * 1024;

export class PackageAvailabilityError extends Error {
    readonly code: string;
    attempts = 0;
    elapsedMs = 0;
    lastObservation: string | undefined;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'PackageAvailabilityError';
        this.code = code;
    }
}

class RetryableAvailabilityError extends Error {
    readonly observation: string;

    constructor(observation: string) {
        super('The public registry artifact is not yet available.');
        this.observation = observation;
    }
}

/** Observe a published exact version without npm configuration, credentials or writes. */
export class PackageAvailabilityRepository {
    private readonly fetch: typeof globalThis.fetch;
    private readonly now: () => number;
    private readonly wait: (milliseconds: number) => Promise<unknown>;
    private readonly limits: AvailabilityLimits;

    constructor(dependencies: AvailabilityDependencies = {}) {
        this.fetch = dependencies.fetch ?? globalThis.fetch;
        this.now = dependencies.now ?? (() => performance.now());
        this.wait = dependencies.wait ?? ((milliseconds) => delay(milliseconds));
        this.limits = { ...PACKAGE_AVAILABILITY_LIMITS, ...dependencies.limits };

        for (const [key, maximum] of Object.entries(PACKAGE_AVAILABILITY_LIMITS)) {
            const value = this.limits[key as keyof AvailabilityLimits];
            if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
                throw new PackageAvailabilityError(
                    'invalid_limits',
                    'Availability limits must be positive integers within the fixed upper bounds.',
                );
            }
        }
    }

    async verifyPublished(publishedPackages: string | undefined, expected: PackageIdentity) {
        const identity = this.publishedIdentity(publishedPackages, expected);
        const started = this.now();
        const deadline = started + this.limits.deadlineMs;
        let attempts = 0;
        let firstIntegrity: string | undefined;
        let lastObservation: string | undefined;

        while (attempts < this.limits.attempts && this.now() < deadline) {
            attempts += 1;
            try {
                const metadata = this.metadata(
                    await this.read(
                        `${registry}${encodeURIComponent(identity.name)}/${encodeURIComponent(identity.version)}`,
                        'metadata',
                        this.limits.metadataBytes,
                        deadline,
                    ),
                    identity,
                );
                if (firstIntegrity && firstIntegrity !== metadata.integrity) {
                    throw new PackageAvailabilityError(
                        'integrity_changed',
                        'Public registry integrity changed between availability attempts.',
                    );
                }
                firstIntegrity = metadata.integrity;

                const tarball = await this.read(
                    metadata.tarball,
                    'tarball',
                    this.limits.tarballBytes,
                    deadline,
                );
                const digest = createHash('sha512').update(tarball).digest();
                if (!timingSafeEqual(digest, metadata.digest)) {
                    throw new PackageAvailabilityError(
                        'integrity_mismatch',
                        'The public tarball disagrees with its advertised SHA-512 integrity.',
                    );
                }
                if (this.now() >= deadline) {
                    throw new RetryableAvailabilityError('deadline_reached');
                }

                return {
                    status: 'available',
                    package: identity,
                    registry_metadata: 'verified',
                    tarball: {
                        url: metadata.tarball,
                        integrity: metadata.integrity,
                        bytes: tarball.length,
                    },
                    installed_runtime: 'not_checked',
                    attempts,
                    elapsed_ms: Math.ceil(this.now() - started),
                };
            } catch (error) {
                if (error instanceof PackageAvailabilityError) {
                    error.attempts = attempts;
                    error.elapsedMs = Math.ceil(this.now() - started);
                    throw error;
                }
                if (!(error instanceof RetryableAvailabilityError)) throw error;
                lastObservation = error.observation;
            }

            const remaining = deadline - this.now();
            if (attempts < this.limits.attempts && remaining > 0) {
                await this.wait(Math.min(this.limits.retryDelayMs, remaining));
            }
        }

        const error = new PackageAvailabilityError(
            'availability_timeout',
            'Publication completed, but anonymous metadata and tarball availability was not verified within the bounded probe.',
        );
        error.attempts = attempts;
        error.elapsedMs = Math.ceil(this.now() - started);
        error.lastObservation = lastObservation;
        throw error;
    }

    private publishedIdentity(publishedPackages: string | undefined, expected: PackageIdentity) {
        const validName = (value: unknown) =>
            typeof value === 'string' &&
            value.length <= 214 &&
            /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(value);
        const validVersion = (value: unknown) =>
            typeof value === 'string' &&
            value.length <= 128 &&
            /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(
                value,
            );
        if (
            !validName(expected?.name) ||
            !validVersion(expected?.version) ||
            typeof publishedPackages !== 'string' ||
            Buffer.byteLength(publishedPackages) > identityBytes
        ) {
            throw new PackageAvailabilityError(
                'invalid_publication_output',
                'Select the bounded exact package identity from the official publication output.',
            );
        }

        let published;
        try {
            published = JSON.parse(publishedPackages);
        } catch {
            throw new PackageAvailabilityError(
                'invalid_publication_output',
                'The official published-packages output is not a JSON array.',
            );
        }
        if (
            !Array.isArray(published) ||
            published.length !== 1 ||
            !published[0] ||
            Object.keys(published[0]).sort().join(',') !== 'name,version' ||
            published[0].name !== expected.name ||
            published[0].version !== expected.version
        ) {
            throw new PackageAvailabilityError(
                'publication_identity_mismatch',
                'The published package identity does not match the reviewed checkout manifest.',
            );
        }
        return { name: expected.name, version: expected.version };
    }

    private metadata(bytes: Buffer, identity: PackageIdentity): PackageMetadata {
        let metadata;
        try {
            metadata = JSON.parse(bytes.toString('utf8'));
        } catch {
            throw new PackageAvailabilityError(
                'invalid_metadata',
                'The public exact-version metadata is not valid JSON.',
            );
        }
        if (metadata?.name !== identity.name || metadata?.version !== identity.version) {
            throw new PackageAvailabilityError(
                'metadata_identity_mismatch',
                'Public registry metadata disagrees with the exact published package identity.',
            );
        }

        const integrity = metadata.dist?.integrity;
        if (typeof integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(integrity)) {
            throw new PackageAvailabilityError(
                'invalid_integrity',
                'Public registry metadata must advertise one canonical SHA-512 integrity value.',
            );
        }
        const digest = Buffer.from(integrity.slice(7), 'base64');
        if (digest.length !== 64 || `sha512-${digest.toString('base64')}` !== integrity) {
            throw new PackageAvailabilityError(
                'invalid_integrity',
                'Public registry metadata must advertise one canonical SHA-512 integrity value.',
            );
        }

        let url;
        try {
            if (typeof metadata.dist.tarball !== 'string') throw new Error();
            url = new URL(metadata.dist.tarball);
        } catch {
            throw new PackageAvailabilityError(
                'invalid_tarball_url',
                'The advertised tarball must use the canonical anonymous npm HTTPS URL.',
            );
        }
        const basename = identity.name.split('/').at(-1);
        const expectedPath = `/${identity.name}/-/${basename}-${identity.version}.tgz`;
        let path;
        try {
            path = decodeURIComponent(url.pathname);
        } catch {
            path = undefined;
        }
        if (
            url.origin !== new URL(registry).origin ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            path !== expectedPath
        ) {
            throw new PackageAvailabilityError(
                'invalid_tarball_url',
                'The advertised tarball must use the canonical anonymous npm HTTPS URL.',
            );
        }
        return { tarball: url.href, integrity, digest };
    }

    private async read(url: string, phase: string, maximum: number, deadline: number) {
        const remaining = deadline - this.now();
        if (remaining <= 0) throw new RetryableAvailabilityError('deadline_reached');

        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timedOut = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => {
                    controller.abort();
                    reject(new RetryableAvailabilityError(`${phase}_request_timeout`));
                },
                Math.min(this.limits.requestTimeoutMs, remaining),
            );
        });
        let response: Response | undefined;
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        try {
            response = await Promise.race([
                this.fetch(url, {
                    method: 'GET',
                    headers: {
                        Accept:
                            phase === 'metadata' ? 'application/json' : 'application/octet-stream',
                    },
                    credentials: 'omit',
                    redirect: 'manual',
                    signal: controller.signal,
                }),
                timedOut,
            ]);
            if (response.status !== 200) {
                if ([404, 408, 425, 429].includes(response.status) || response.status >= 500) {
                    throw new RetryableAvailabilityError(`${phase}_http_${response.status}`);
                }
                throw new PackageAvailabilityError(
                    'registry_response_rejected',
                    'The anonymous public registry request returned a non-retryable response.',
                );
            }
            const length = response.headers.get('content-length');
            if (length !== null && (!/^\d+$/u.test(length) || Number(length) > maximum)) {
                throw new PackageAvailabilityError(
                    'response_body_limit',
                    'The public registry response exceeds its fixed body boundary.',
                );
            }
            if (!response.body) {
                throw new PackageAvailabilityError(
                    'empty_response_body',
                    'The public registry response has no artifact body.',
                );
            }
            reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let bytes = 0;
            while (true) {
                const chunk = await Promise.race([reader.read(), timedOut]);
                if (chunk.done) break;
                bytes += chunk.value.byteLength;
                if (bytes > maximum) {
                    throw new PackageAvailabilityError(
                        'response_body_limit',
                        'The public registry response exceeds its fixed body boundary.',
                    );
                }
                chunks.push(chunk.value);
            }
            return Buffer.concat(chunks, bytes);
        } catch (error) {
            if (
                error instanceof PackageAvailabilityError ||
                error instanceof RetryableAvailabilityError
            ) {
                throw error;
            }
            throw new RetryableAvailabilityError(`${phase}_request_failed`);
        } finally {
            if (timer) clearTimeout(timer);
            controller.abort();
            if (reader) {
                void reader.cancel().catch(() => {});
                reader.releaseLock();
            } else if (response?.body && !response.body.locked) {
                void response.body.cancel().catch(() => {});
            }
        }
    }
}
