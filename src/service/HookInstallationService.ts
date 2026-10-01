// SPDX-License-Identifier: Apache-2.0
import { accessSync, constants, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { HookSettingsRepository } from '../repository/HookSettingsRepository.ts';
import { TelemetryHookConfiguration } from './TelemetryHookConfiguration.ts';

export type HookInstallationInput = {
    file: string;
    host: string;
    database?: string;
    collections?: string[];
    executable?: string;
    launcher?: string;
};

/** Owns explicit registration lifecycle; observations and evidence storage stay separate. */
export class HookInstallationService {
    private readonly repository: HookSettingsRepository;

    constructor(repository = new HookSettingsRepository()) {
        this.repository = repository;
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
        const runtime_available = this.runtimeAvailable(registration.runtime);
        return {
            enabled: matched,
            file: settings.file,
            host: input.host,
            registration_changed: !matched,
            runtime_available,
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
        const selectedRuntime = [input.executable ?? process.execPath];
        if (input.launcher) selectedRuntime.push(input.launcher);
        const runtime = selectedRuntime.map((path, index) => this.runtimeFile(path, index));
        const prefix = runtime.map((path) => this.quote(path)).join(' ');
        const generated = new TelemetryHookConfiguration().configuration(
            input.database,
            input.collections,
            input.host,
            prefix,
        );
        if (receipt.value.active) {
            const status = this.status(input);
            if (!status.enabled) {
                throw new Error('Owned hook entries changed; reconcile before enabling.');
            }
            if (
                !this.same(receipt.value.hooks, generated.hooks) ||
                !this.same(receipt.value.runtime, runtime) ||
                receipt.value.database !== input.database
            ) {
                throw new Error(
                    'Registration options changed; explicitly disable before enabling the new selection.',
                );
            }
            return { ...status, written: false, effects: 'Already enabled; no files changed.' };
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
            hooks: generated.hooks,
        };
        if (write) this.persist(settings, value, receipt, registration);
        return {
            enabled: write,
            written: write,
            file: settings.file,
            host: input.host,
            database: input.database,
            receipt: receipt.file,
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

    private runtimeAvailable(runtime: string[]): boolean {
        try {
            return runtime.every((path, index) => this.runtimeFile(path, index) === path);
        } catch {
            return false;
        }
    }

    private runtimeFile(path: string, index: number): string {
        if (!isAbsolute(path) || /[\r\n\0]/.test(path)) {
            throw new Error('Select existing absolute runtime files.');
        }
        // Package-manager executable links resolve to the installed runtime.
        const canonical = realpathSync(path);
        if (!lstatSync(canonical).isFile()) {
            throw new Error('Select existing absolute runtime files.');
        }
        try {
            accessSync(canonical, index === 0 ? constants.X_OK : constants.R_OK);
        } catch {
            throw new Error(
                index === 0
                    ? 'Selected runtime must be executable.'
                    : 'Selected launcher must be readable.',
            );
        }
        return canonical;
    }

    private quote(value: string): string {
        return "'" + value.replaceAll("'", "'\"'\"'") + "'";
    }
}
