// SPDX-License-Identifier: Apache-2.0
import { PluginHookConfiguration } from '../config/PluginHookConfiguration.ts';
import { PluginDataRepository } from '../repository/PluginDataRepository.ts';
import { SkillDiscoveryRepository } from '../repository/SkillDiscoveryRepository.ts';
import { SkillReadIdentityRepository } from '../repository/SkillReadIdentityRepository.ts';
import { PluginHookInputValidator } from '../validator/PluginHookInputValidator.ts';
import { PortableFrontmatterValidator } from '../validator/PortableFrontmatterValidator.ts';
import { AvailableSkillsService } from './AvailableSkillsService.ts';
import { HostHookConfiguration } from './HostHookConfiguration.ts';

export type PluginHookResult = { output: string; diagnostics: string[] };

/** Shares installed discovery and proven read telemetry without the repository CLI. */
export class PluginHookService {
    private readonly configuration: PluginHookConfiguration;
    private readonly discovery: SkillDiscoveryRepository;

    constructor(
        configuration: PluginHookConfiguration,
        discovery = new SkillDiscoveryRepository(new PortableFrontmatterValidator()),
    ) {
        this.configuration = configuration;
        this.discovery = discovery;
    }

    async run(value: unknown): Promise<PluginHookResult> {
        const configuration = this.configuration;
        const input = new PluginHookInputValidator().input(value, configuration.host);
        const result: PluginHookResult = { output: this.neutralOutput(), diagnostics: [] };
        if (!input) return result;

        const directories = new PluginDataRepository();
        const callerRoot = directories.canonicalDirectory(input.cwd);
        const sources = configuration.sources(callerRoot);
        if (input.session) {
            const discovery = this.discovery.read(sources);
            const context = new AvailableSkillsService().renderOverview(
                discovery,
                configuration.maxEntries,
                configuration.maxContextCharacters,
            );
            result.output = new HostHookConfiguration().sessionOutput(configuration.host, context);
        }

        // Codex currently supplies context only. Successful shell execution is
        // insufficient evidence of a particular skill read or session activation.
        if (configuration.host !== 'claude') return result;

        try {
            const { HookTelemetryService } = await import('./HookTelemetryService.ts');
            const identities = new SkillReadIdentityRepository(this.discovery, {
                allowIncompleteDiscovery: true,
            });
            const telemetry = new HookTelemetryService(identities);
            const event = telemetry.observation(input.payload, sources);
            if (!event) return result;

            const database = directories.prepareDatabase(configuration.usageDatabase(), [
                configuration.pluginRoot,
                callerRoot,
            ]);
            telemetry.record(database, event);
        } catch {
            result.diagnostics.push(
                'I-9 Skills plugin hook: local telemetry unavailable; continuing without this observation.',
            );
        }

        return result;
    }

    private neutralOutput(): string {
        return this.configuration.host === 'claude' ? '{}' : '';
    }
}
