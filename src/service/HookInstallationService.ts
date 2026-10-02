// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { HookObserverRuntimeRepository } from '../repository/HookObserverRuntimeRepository.ts';
import { HookSettingsRepository } from '../repository/HookSettingsRepository.ts';
import { TelemetryHookConfiguration } from './TelemetryHookConfiguration.ts';

export type HookInstallationInput = {
    file: string;
    host: string;
    database?: string;
    collections?: string[];
    executable?: string;
    launcher?: string;
    reviewedRegistrationDigest?: string;
};

/** Owns explicit registration lifecycle; observations and evidence storage stay separate. */
export class HookInstallationService {
    private readonly repository: HookSettingsRepository;
    private readonly runtimeRepository: HookObserverRuntimeRepository;

    constructor(
        repository = new HookSettingsRepository(),
        runtimeRepository = new HookObserverRuntimeRepository(),
    ) {
        this.repository = repository;
        this.runtimeRepository = runtimeRepository;
    }

    status(input: HookInstallationInput) {
        const settings = this.repository.read(input.file);
        const receipt = this.receipt(input);
        const registration = receipt.value;
        if (!registration.active) {
            return { enabled: false, file: settings.file, host: input.host, effects: 'Read only.' };
        }
        const entries = this.entries(registration);
        const matched = entries.every(([event, entry]) => {
            const configured = settings.value.hooks?.[event];
            return (
                Array.isArray(configured) &&
                configured.filter((value: any) => this.same(value, entry)).length === 1
            );
        });
        const runtime_available = registration.runtime_identity
            ? this.runtimeRepository.matches(registration.runtime_identity)
            : false;
        return {
            enabled: matched,
            file: settings.file,
            host: input.host,
            registration_changed: !matched,
            runtime_available,
            runtime_identity: registration.runtime_identity ?? null,
            legacy_runtime_unbound: !registration.runtime_identity,
            database: registration.database,
            effects: 'Read only; database was not opened.',
        };
    }

    enable(input: HookInstallationInput, write = false) {
        const settings = this.repository.read(input.file);
        const receipt = this.receipt(input);
        if (!input.database || !input.collections?.length) {
            throw new Error('Enable requires a database and explicit collection roots.');
        }
        const runtimeIdentity = this.runtimeRepository.inspect(input.executable, input.launcher);
        const runtime = [runtimeIdentity.executable.file, runtimeIdentity.launcher.file];
        const prefix = runtime.map((path) => this.quote(path)).join(' ');
        const generated = new TelemetryHookConfiguration().configuration(
            input.database,
            input.collections,
            input.host,
            prefix,
        );
        const registrationDigest = this.digest({
            host: input.host,
            file: settings.file,
            database: input.database,
            collections: input.collections,
            runtime_identity: runtimeIdentity,
            hooks: generated.hooks,
        });
        if (write && input.reviewedRegistrationDigest !== registrationDigest) {
            throw new Error('Explicit enablement requires the exact reviewed registration digest.');
        }
        if (receipt.value.active) {
            const status = this.status(input);
            if (!status.enabled) {
                throw new Error('Owned hook entries changed; reconcile before enabling.');
            }
            if (
                !this.same(receipt.value.hooks, generated.hooks) ||
                !this.same(receipt.value.runtime, runtime) ||
                !this.same(receipt.value.runtime_identity, runtimeIdentity) ||
                receipt.value.database !== input.database
            ) {
                throw new Error(
                    'Registration options changed; explicitly disable before enabling the new selection.',
                );
            }
            return {
                ...status,
                written: false,
                registration_digest: registrationDigest,
                effects: 'Already enabled; no files changed.',
            };
        }
        const value = structuredClone(settings.value);
        if (
            value.hooks !== undefined &&
            (!value.hooks || Array.isArray(value.hooks) || typeof value.hooks !== 'object')
        ) {
            throw new Error('Existing hooks must be an object.');
        }
        value.hooks ??= {};
        if (input.host === 'copilot') {
            if (value.version !== undefined && value.version !== 1)
                throw new Error('Copilot hooks require version 1.');
            value.version = 1;
        }
        for (const [event, entries] of Object.entries(generated.hooks)) {
            if (value.hooks[event] !== undefined && !Array.isArray(value.hooks[event])) {
                throw new Error('Existing event hooks must be arrays.');
            }
            value.hooks[event] ??= [];
            for (const entry of entries as any[]) {
                if (value.hooks[event].some((existing: any) => this.same(existing, entry))) {
                    throw new Error('A matching unowned hook already exists; do not duplicate it.');
                }
                value.hooks[event].push(entry);
            }
        }
        const registration = {
            schema_version: 1,
            host: input.host,
            file: settings.file,
            active: true,
            database: input.database,
            runtime,
            runtime_identity: runtimeIdentity,
            registration_digest: registrationDigest,
            collections: input.collections,
            hooks: generated.hooks,
        };
        if (write) {
            if (!this.runtimeRepository.matches(runtimeIdentity)) {
                throw new Error(
                    'Observer runtime changed; inspect its bytes again before writing.',
                );
            }
            this.persist(settings, value, receipt, registration);
        }
        return {
            enabled: write,
            written: write,
            file: settings.file,
            host: input.host,
            database: input.database,
            receipt: receipt.file,
            registration_digest: registrationDigest,
            runtime_identity: runtimeIdentity,
            configuration: generated,
            effects: write
                ? 'Merged selected hooks and recorded ownership; database retained.'
                : 'Preview only; no files written.',
        };
    }

    disable(input: HookInstallationInput, write = false) {
        const settings = this.repository.read(input.file);
        const receipt = this.receipt(input);
        if (!receipt.value.active)
            return {
                enabled: false,
                written: false,
                effects: 'Already disabled; no files changed.',
            };
        const value = structuredClone(settings.value);
        for (const [event, entry] of this.entries(receipt.value)) {
            const entries = value.hooks?.[event];
            if (!Array.isArray(entries))
                throw new Error('Owned hook changed; manual reconciliation required.');
            const matches = entries.filter((existing: any) => this.same(existing, entry));
            if (matches.length !== 1)
                throw new Error(
                    'Owned hook changed or duplicated; manual reconciliation required.',
                );
            value.hooks[event] = entries.filter((existing: any) => !this.same(existing, entry));
            if (!value.hooks[event].length) delete value.hooks[event];
        }
        if (write) this.persist(settings, value, receipt, { ...receipt.value, active: false });
        return {
            enabled: !write,
            written: write,
            file: settings.file,
            effects: write
                ? 'Removed exact owned entries; unrelated settings and database retained.'
                : 'Preview only; no files written.',
        };
    }

    private receipt(input: HookInstallationInput) {
        if (!['codex', 'claude', 'copilot', 'gemini'].includes(input.host))
            throw new Error('Unsupported telemetry host.');
        const receipt = this.repository.read(input.file + '.i9-skills.json');
        if (!receipt.bytes) return receipt;
        if (
            receipt.value.schema_version !== 1 ||
            receipt.value.file !== resolve(input.file) ||
            receipt.value.host !== input.host ||
            typeof receipt.value.active !== 'boolean'
        ) {
            throw new Error('Registration receipt does not match the selected settings and host.');
        }
        if (
            !Array.isArray(receipt.value.runtime) ||
            receipt.value.runtime.length < 1 ||
            receipt.value.runtime.length > 2 ||
            receipt.value.runtime.some((path: any) => typeof path !== 'string' || !isAbsolute(path))
        ) {
            throw new Error('Invalid registration runtime receipt.');
        }
        this.entries(receipt.value);
        return receipt;
    }

    private entries(receipt: Record<string, any>): Array<[string, any]> {
        if (!receipt.hooks || typeof receipt.hooks !== 'object' || Array.isArray(receipt.hooks))
            throw new Error('Invalid hook receipt.');
        return Object.entries(receipt.hooks).flatMap(([event, entries]) => {
            if (!Array.isArray(entries) || entries.length > 16)
                throw new Error('Invalid hook receipt entries.');
            return entries.map((entry) => [event, entry] as [string, any]);
        });
    }

    private persist(settings: any, value: any, receipt: any, registration: any) {
        const written = this.repository.replace(settings, value);
        try {
            this.repository.replace(receipt, registration);
        } catch (error) {
            this.repository.restore(written, settings);
            throw error;
        }
    }

    private same(left: any, right: any): boolean {
        return JSON.stringify(left) === JSON.stringify(right);
    }

    private digest(value: unknown): string {
        return createHash('sha256').update(JSON.stringify(value)).digest('hex');
    }

    private quote(value: string): string {
        return "'" + value.replaceAll("'", "'\"'\"'") + "'";
    }
}
