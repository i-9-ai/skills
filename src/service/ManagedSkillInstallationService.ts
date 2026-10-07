// SPDX-License-Identifier: Apache-2.0
import type { InstallationOperation } from '../config/SkillInstallationConfiguration.ts';
import { SkillInstallationConfiguration } from '../config/SkillInstallationConfiguration.ts';
import { PluginInstallationClientRepository } from '../repository/PluginInstallationClientRepository.ts';
import type { InstallationHost } from '../repository/PluginInstallationClientRepository.ts';
import { SkillInstallationService } from './SkillInstallationService.ts';
import { PluginInstallationService } from './PluginInstallationService.ts';
import { SkillInstallationRepository } from '../repository/SkillInstallationRepository.ts';

/** One orchestration boundary chooses one backend; it never installs both. */
export class ManagedSkillInstallationService {
    run(
        operation: InstallationOperation,
        flags: {
            project?: string;
            global: boolean;
            write: boolean;
            strategy: string;
            host?: string;
        },
    ) {
        const configuration = new SkillInstallationConfiguration(flags);
        const clients = new PluginInstallationClientRepository();
        const available = (['codex', 'claude'] as const).filter((host) => clients.detect(host));
        const state = new SkillInstallationRepository(configuration);
        if (flags.strategy === 'plugin')
            return new PluginInstallationService(configuration, clients).run(
                operation,
                flags.host as InstallationHost | undefined,
                flags.write,
            );
        if (flags.host) throw new Error('Select --strategy plugin when selecting a native --host.');
        if (flags.strategy === 'auto' && (state.receipt() || state.pending() || state.hasLock()))
            return {
                ...new SkillInstallationService(configuration).run(operation, flags.write),
                strategy: 'skills',
                available_clients: available,
            };
        if (flags.strategy === 'auto') {
            const managed = (['codex', 'claude'] as const).filter(
                (host) => state.nativeState(host) || state.nativeState(host, true),
            );
            if (managed.length === 1)
                return new PluginInstallationService(configuration, clients).run(
                    operation,
                    managed[0],
                    flags.write,
                );
            if (managed.length > 1)
                return {
                    schema_version: 1,
                    status: 'select-host',
                    written: false,
                    available_clients: managed,
                };
        }
        if (flags.strategy === 'auto' && available.length) {
            if (available.length > 1)
                return {
                    schema_version: 1,
                    status: 'select-strategy',
                    written: false,
                    available_clients: available,
                    message: 'Choose --strategy skills or --strategy plugin --host codex|claude.',
                };
            return new PluginInstallationService(configuration, clients).run(
                operation,
                available[0],
                flags.write,
            );
        }
        return {
            ...new SkillInstallationService(configuration).run(operation, flags.write),
            strategy: 'skills',
            available_clients: available,
        };
    }
}
