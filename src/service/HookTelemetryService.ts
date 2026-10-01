// SPDX-License-Identifier: Apache-2.0
import { TelemetryInputRepository } from '../repository/TelemetryInputRepository.ts';
import { SkillReadIdentityRepository } from '../repository/SkillReadIdentityRepository.ts';
import { SkillReadRepository } from '../repository/SkillReadRepository.ts';
import { ClaudeTelemetryAdapter } from './ClaudeTelemetryAdapter.ts';
import { CodexTelemetryAdapter } from './CodexTelemetryAdapter.ts';
import { GeminiTelemetryAdapter } from './GeminiTelemetryAdapter.ts';
import { CopilotTelemetryAdapter } from './CopilotTelemetryAdapter.ts';
import type { PluginHookHost } from '../config/PluginHookConfiguration.ts';
import { TelemetryIdentityService } from './TelemetryIdentityService.ts';
import type { CollectionSource } from '../repository/SkillDiscoveryRepository.ts';
import type { SkillTelemetryEvent } from '../validator/SkillTelemetryValidator.ts';
import { SkillTelemetryValidator } from '../validator/SkillTelemetryValidator.ts';
import { PluginDataRepository } from '../repository/PluginDataRepository.ts';

/** Host ingestion is explicit and local; raw hook bodies never enter storage. */
export class HookTelemetryService {
    private readonly identities: SkillReadIdentityRepository;

    constructor(identities = new SkillReadIdentityRepository()) {
        this.identities = identities;
    }

    async observe(
        database: string,
        collections: string[],
        host: PluginHookHost = 'claude',
        nativeEvent?: string,
    ) {
        const sources = this.identities.sources(collections);
        const input = await new TelemetryInputRepository().read('-', process.stdin, 1_048_576);
        if (
            nativeEvent &&
            (host !== 'copilot' ||
                !['sessionStart', 'preToolUse', 'postToolUse'].includes(nativeEvent))
        )
            throw new Error('Unsupported native event selector');
        const value = nativeEvent
            ? { ...new TelemetryIdentityService().object(input), hook_event_name: nativeEvent }
            : input;
        const event = this.observation(value, sources, host);
        if (event) this.record(database, event);
    }

    /** Accept a parsed payload so a session hook never consumes stdin twice. */
    observation(
        input: unknown,
        sources: CollectionSource[],
        host: PluginHookHost = 'claude',
    ): SkillTelemetryEvent | undefined {
        const adapters = {
            claude: new ClaudeTelemetryAdapter(),
            codex: new CodexTelemetryAdapter(),
            gemini: new GeminiTelemetryAdapter(),
            copilot: new CopilotTelemetryAdapter(),
        };
        const adapter = adapters[host];
        const observation = adapter.observation(input, new Date().toISOString());
        if (!observation) return;
        const payload = observation.file ? this.identities.identify(observation.file, sources) : {};
        if (!payload) return;
        if (
            host === 'codex' &&
            observation.event.event_type === 'skill.read.observed' &&
            !new CodexTelemetryAdapter().verified(input)
        )
            return;

        return { ...observation.event, payload };
    }

    record(database: string, event: SkillTelemetryEvent): void {
        const validated = new SkillTelemetryValidator().event(event);
        const selected = new PluginDataRepository().prepareDatabase(database, []);
        const store = new SkillReadRepository(selected);
        try {
            store.recordEvent(validated, { preserveFirstReceipt: true });
        } finally {
            store.close();
        }
    }
}
