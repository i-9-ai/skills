// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { SkillInstallationConfiguration } from '../config/SkillInstallationConfiguration.ts';
import type { InstallationOperation } from '../config/SkillInstallationConfiguration.ts';
import { InstalledSkillRepository } from '../repository/InstalledSkillRepository.ts';
import { PluginInstallationClientRepository } from '../repository/PluginInstallationClientRepository.ts';
import type {
    InstallationHost,
    InstalledPluginObservation,
} from '../repository/PluginInstallationClientRepository.ts';
import { SkillInstallationRepository } from '../repository/SkillInstallationRepository.ts';
import { SkillBundleRepository } from '../repository/SkillBundleRepository.ts';
import { InstalledCollectionConfiguration } from '../config/InstalledCollectionConfiguration.ts';

interface NativeInstallationRecord {
    schema_version: 1;
    host: InstallationHost;
    root: string;
    scope: string;
    client: string;
    requested_revision: string;
    observation: InstalledPluginObservation;
}

type NativeMarketplaceRecord = Omit<NativeInstallationRecord, 'observation'> & {
    source: 'https://github.com/i-9-ai/skills.git';
};

/** Native hosts own activation and configuration; verified cache observations guard our registrations. */
export class PluginInstallationService {
    readonly configuration: SkillInstallationConfiguration;
    readonly clients: PluginInstallationClientRepository;
    readonly state: SkillInstallationRepository;
    readonly identity: () => { package_version: string; resolved_git_sha: string | null };
    readonly verifyPackages: (after: InstalledPluginObservation) => boolean;

    constructor(
        configuration: SkillInstallationConfiguration,
        clients = new PluginInstallationClientRepository(),
        state = new SkillInstallationRepository(configuration),
        identity = () => new InstalledSkillRepository().catalog().provenance,
        verifyPackages = (after: InstalledPluginObservation) => {
            const expected = new SkillBundleRepository().bundle();
            const actual = new SkillBundleRepository(
                new InstalledCollectionConfiguration(after.path),
            ).bundle();
            return (
                actual.version === expected.version &&
                actual.catalog_sha256 === expected.catalog_sha256 &&
                JSON.stringify(actual.packages) === JSON.stringify(expected.packages)
            );
        },
    ) {
        this.configuration = configuration;
        this.clients = clients;
        this.state = state;
        this.identity = identity;
        this.verifyPackages = verifyPackages;
    }

    run(operation: InstallationOperation, host: InstallationHost | undefined, write = false) {
        const available = (['codex', 'claude'] as const).filter((name) =>
            this.clients.detect(name),
        );
        const selected = host ?? (available.length === 1 ? available[0] : undefined);
        if (!selected)
            return {
                schema_version: 1,
                written: false,
                status: 'select-host',
                available_clients: available,
                message:
                    'Select --host codex or --host claude; detection does not install a client.',
            };
        const executable = this.clients.detect(selected);
        const before = this.record(selected);
        const marketplace = this.marketplace(selected);
        const ownedSource = before ?? marketplace;
        const identity =
            operation === 'install' || operation === 'upgrade' ? this.identity() : null;
        const revision = identity
            ? (identity.resolved_git_sha ?? `v${identity.package_version}`)
            : (ownedSource?.requested_revision ?? 'unselected');
        const scope = this.configuration.scope === 'global' ? 'user' : 'project';
        const source = 'https://github.com/i-9-ai/skills.git';
        const commands =
            operation === 'status' || operation === 'recover'
                ? []
                : selected === 'codex'
                  ? operation === 'uninstall'
                      ? [['plugin', 'remove', 'i9-skills@i9-skills']]
                      : [
                            ['plugin', 'marketplace', 'add', source, '--ref', revision, '--json'],
                            ['plugin', 'add', 'i9-skills@i9-skills', '--json'],
                        ]
                  : operation === 'uninstall'
                    ? [
                          [
                              'plugin',
                              'uninstall',
                              'i9-skills@i9-skills',
                              '--scope',
                              scope,
                              '--keep-data',
                          ],
                      ]
                    : [
                          ownedSource
                              ? ['plugin', 'marketplace', 'update', 'i9-skills']
                              : [
                                    'plugin',
                                    'marketplace',
                                    'add',
                                    `${source}#${revision}`,
                                    '--scope',
                                    scope,
                                ],
                          [
                              'plugin',
                              operation === 'upgrade' ? 'update' : 'install',
                              'i9-skills@i9-skills',
                              '--scope',
                              scope,
                          ],
                      ];
        const pending = this.state.nativeState(selected, true);
        const result = {
            schema_version: 1,
            operation,
            strategy: 'plugin',
            host: selected,
            scope: this.configuration.scope,
            client: executable,
            version: identity?.package_version ?? null,
            installed_version: before?.observation.version ?? null,
            installed: Boolean(before),
            marketplace_owned: Boolean(ownedSource),
            written: false,
            commands,
            pending: Boolean(pending),
            bundled_components: ['skills', 'hooks', 'mcp'],
            native_activation: 'not-observed',
            available_clients: available,
        };
        if (operation === 'recover')
            return {
                ...result,
                status: 'manual-required',
                message:
                    'Native clients own rollback. Inspect the retained native pending record and restore the recorded previous marketplace revision with that client.',
            };
        if (operation === 'status') {
            if (write) throw new Error('Status never writes.');
            let intact: boolean | null = null;
            if (before) {
                try {
                    intact =
                        this.clients.fingerprint(before.observation.path, selected) ===
                        before.observation.sha256;
                } catch {
                    intact = false;
                }
            }
            return {
                ...result,
                cache_intact: intact,
                status: before ? (intact === false ? 'conflict' : 'recorded') : 'absent',
                native_status: 'not-probed',
            };
        }
        if (operation !== 'uninstall' && ownedSource && ownedSource.requested_revision !== revision)
            return {
                ...result,
                status: 'manual-required',
                message:
                    'The selected native client cannot replace this registered source pin through repeat add or refresh. Review a different source revision through native settings before any command is dispatched.',
                manual_steps: [
                    `Review the i9-skills marketplace source ref in the selected ${scope} ${selected} settings. Preserve other entries and do not remove the marketplace; removal can affect unrelated plugins and their data.`,
                    `Select the intended source revision ${revision} through native settings and update only i9-skills@i9-skills at ${scope} scope using the supported native commands.`,
                    'Continue managing that source transition with the native client. This manager does not silently adopt changed cache bytes or declare the native transition completed.',
                    'For CLI-managed portable upgrades, first explicitly uninstall the owned native plugin, then preview a skills-only installation in the same scope.',
                ],
            };
        if (!write)
            return {
                ...result,
                status:
                    !executable || (selected === 'codex' && scope !== 'user')
                        ? 'manual-required'
                        : 'preview',
            };
        if (!executable || (selected === 'codex' && scope !== 'user'))
            return {
                ...result,
                status: 'manual-required',
                message:
                    'This client/scope needs native UI setup. No installation scope was widened.',
            };
        if (operation !== 'uninstall') this.assertNoLoose();
        if (pending)
            return {
                ...result,
                status: 'manual-required',
                message:
                    'Reconcile the recorded interrupted native operation with the host client first.',
            };
        const cwd = scope === 'project' ? dirname(this.configuration.root) : process.cwd();
        if (!this.clients.support(executable, selected, cwd, commands))
            return {
                ...result,
                status: 'manual-required',
                message: 'The selected native command contract is unsupported.',
            };
        const observed = this.clients.observe(executable, selected, this.configuration.scope, cwd);
        const marketplaceExists = this.clients.marketplaceExists(executable, selected, cwd);
        if (operation !== 'uninstall' && !before && !marketplace && !observed && marketplaceExists)
            return {
                ...result,
                status: 'manual-required',
                message:
                    'An existing unowned marketplace requires native-client reconciliation; it will not be overwritten.',
            };
        if (ownedSource && !marketplaceExists)
            throw new Error('The managed native marketplace is missing.');
        if (marketplace && marketplace.client !== executable)
            throw new Error('The managed native marketplace client changed.');
        if (
            selected === 'claude' &&
            ownedSource &&
            operation !== 'uninstall' &&
            !this.clients.claudeMarketplaceMatches(executable, cwd, ownedSource.requested_revision)
        )
            return {
                ...result,
                status: 'manual-required',
                message:
                    'The recorded marketplace source no longer matches the native registration. Preserve it and reconcile through the client.',
            };
        if (!before && observed)
            return {
                ...result,
                status: 'unmanaged',
                installed: true,
                message:
                    'The native plugin already exists outside this manager. Use the native client to manage it; no ownership was adopted.',
            };
        if (
            before &&
            (!observed ||
                observed.sha256 !== before.observation.sha256 ||
                observed.path !== before.observation.path ||
                before.client !== executable)
        )
            throw new Error(
                'Native plugin bytes or client changed; manual reconciliation is required.',
            );
        if (operation !== 'uninstall' && before && !observed?.enabled)
            return {
                ...result,
                status: 'manual-required',
                message:
                    'Keep the disabled plugin disabled; use the native UI to review its upgrade.',
            };
        if (operation === 'upgrade' && !before)
            throw new Error('No owned native installation; use install first.');
        if (operation === 'uninstall' && !before) return { ...result, status: 'absent' };
        if (
            operation !== 'uninstall' &&
            observed &&
            observed.version === identity?.package_version &&
            before?.requested_revision === revision
        ) {
            if (!this.verifyPackages(observed))
                return {
                    ...result,
                    status: 'manual-required',
                    selected_package_integrity: 'conflict',
                    message:
                        'The owned native packages differ from the running bundle at the same requested revision. Reconcile the source with the native client before updating.',
                };
            return {
                ...result,
                status: 'unchanged',
                selected_package_integrity: 'verified',
                immutable_native_revision: 'not-observed',
            };
        }
        const id = randomUUID();
        return this.state.locked(() => {
            if (operation !== 'uninstall') this.assertNoLoose();
            if (
                JSON.stringify(this.record(selected)) !== JSON.stringify(before) ||
                JSON.stringify(this.marketplace(selected)) !== JSON.stringify(marketplace) ||
                this.state.nativeState(selected, true)
            )
                throw new Error('Native ownership state changed.');
            if (
                JSON.stringify(
                    this.clients.observe(executable, selected, this.configuration.scope, cwd),
                ) !== JSON.stringify(observed)
            )
                throw new Error('Native installation changed before dispatch.');
            const retention = join(this.configuration.state, 'native-preimage', id);
            this.state.directory(dirname(retention), true);
            if (observed) this.clients.retain(observed, selected, retention);
            this.state.publishNative(
                selected,
                {
                    schema_version: 1,
                    id,
                    host: selected,
                    root: this.configuration.root,
                    before,
                    requested_revision: revision,
                    commands,
                    retention: observed ? retention : null,
                    completed_commands: 0,
                },
                true,
            );
            let completed = 0;
            for (const args of commands) {
                this.clients.execute(executable, args, cwd);
                this.state.publishNative(
                    selected,
                    {
                        schema_version: 1,
                        id,
                        host: selected,
                        root: this.configuration.root,
                        before,
                        requested_revision: revision,
                        commands,
                        retention: observed ? retention : null,
                        completed_commands: ++completed,
                    },
                    true,
                );
            }
            const after = this.clients.observe(executable, selected, this.configuration.scope, cwd);
            if (operation === 'uninstall') {
                if (after)
                    throw new Error('Native plugin remains installed; reconciliation is required.');
                if (!marketplace && before)
                    this.state.publishMarketplace(selected, {
                        schema_version: 1,
                        host: selected,
                        root: this.configuration.root,
                        scope: this.configuration.scope,
                        client: executable,
                        requested_revision: before.requested_revision,
                        source,
                    } satisfies NativeMarketplaceRecord);
                this.state.clearNative(selected);
            } else {
                if (!after || after.version !== identity?.package_version)
                    throw new Error('Native plugin version differs from the selected bundle.');
                if (!this.verifyPackages(after))
                    throw new Error(
                        'Native package bytes differ from the selected running bundle; reconciliation is required.',
                    );
                this.state.publishNative(selected, {
                    schema_version: 1,
                    host: selected,
                    root: this.configuration.root,
                    scope: this.configuration.scope,
                    client: executable,
                    requested_revision: revision,
                    observation: after,
                } satisfies NativeInstallationRecord);
                this.state.publishMarketplace(selected, {
                    schema_version: 1,
                    host: selected,
                    root: this.configuration.root,
                    scope: this.configuration.scope,
                    client: executable,
                    requested_revision: revision,
                    source,
                } satisfies NativeMarketplaceRecord);
            }
            this.state.clearNative(selected, true);
            return {
                ...result,
                written: true,
                installed: Boolean(after),
                pending: false,
                status: 'observed',
                installed_version: after?.version ?? null,
                native_activation: 'not-observed',
                immutable_native_revision: 'not-observed',
                selected_package_integrity: after ? 'verified' : 'not-applicable',
            };
        });
    }

    private assertNoLoose() {
        if (this.state.receipt() || this.state.pending())
            throw new Error(
                'Resolve the owned loose-skill installation before selecting a plugin route.',
            );
        for (const item of new InstalledSkillRepository().catalog().skills) {
            if (this.state.actual(item.name))
                throw new Error(
                    'Existing loose skill copies require explicit migration before plugin installation.',
                );
        }
    }

    private record(host: InstallationHost): NativeInstallationRecord | null {
        const raw = this.state.nativeState(host);
        if (raw === null) return null;
        const item = this.state.validator.object(raw, [
            'schema_version',
            'host',
            'root',
            'scope',
            'client',
            'requested_revision',
            'observation',
        ]);
        const observation = this.state.validator.object(item.observation, [
            'version',
            'path',
            'enabled',
            'sha256',
        ]);
        if (
            item.schema_version !== 1 ||
            item.host !== host ||
            item.root !== this.configuration.root ||
            item.scope !== this.configuration.scope ||
            typeof item.client !== 'string' ||
            typeof item.requested_revision !== 'string' ||
            !/^(?:[a-f0-9]{40}|v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)(?![\s\S])/.test(
                item.requested_revision,
            ) ||
            typeof observation.version !== 'string' ||
            typeof observation.path !== 'string' ||
            typeof observation.enabled !== 'boolean'
        )
            throw new Error('Invalid native ownership record.');
        this.state.validator.sha(observation.sha256);
        this.clients.cacheLocator(observation.path);
        return raw as NativeInstallationRecord;
    }

    private marketplace(host: InstallationHost): NativeMarketplaceRecord | null {
        const raw = this.state.marketplaceState(host);
        if (raw === null) return null;
        const item = this.state.validator.object(raw, [
            'schema_version',
            'host',
            'root',
            'scope',
            'client',
            'requested_revision',
            'source',
        ]);
        if (
            item.schema_version !== 1 ||
            item.host !== host ||
            item.root !== this.configuration.root ||
            item.scope !== this.configuration.scope ||
            typeof item.client !== 'string' ||
            item.source !== 'https://github.com/i-9-ai/skills.git' ||
            typeof item.requested_revision !== 'string' ||
            !/^(?:[a-f0-9]{40}|v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)(?![\s\S])/.test(
                item.requested_revision,
            )
        )
            throw new Error('Invalid native marketplace ownership record.');
        return raw as NativeMarketplaceRecord;
    }
}
