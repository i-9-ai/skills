// SPDX-License-Identifier: Apache-2.0
import { TelemetryInputRepository } from '../repository/TelemetryInputRepository.ts';
import { SkillReadIdentityRepository } from '../repository/SkillReadIdentityRepository.ts';
import { SkillReadRepository } from '../repository/SkillReadRepository.ts';
import { ClaudeTelemetryAdapter } from './ClaudeTelemetryAdapter.ts';
import type { CollectionSource } from '../repository/SkillDiscoveryRepository.ts';
import type { SkillTelemetryEvent } from '../validator/SkillTelemetryValidator.ts';

/** Host ingestion is explicit and local; raw hook bodies never enter storage. */
export class HookTelemetryService {
    private readonly identities: SkillReadIdentityRepository;

    constructor(identities = new SkillReadIdentityRepository()) {
        this.identities = identities;
    }

    async observe(database: string, collections: string[]) {
        const sources = this.identities.sources(collections);
        const input = await new TelemetryInputRepository().read('-', process.stdin, 1_048_576);
        const event = this.observation(input, sources);
        if (event) this.record(database, event);
    }

    /** Accept a parsed payload so a session hook never consumes stdin twice. */
    observation(input: unknown, sources: CollectionSource[]): SkillTelemetryEvent | undefined {
        const observation = new ClaudeTelemetryAdapter().observation(
            input,
            new Date().toISOString(),
        );
        if (!observation) return;
        const payload = observation.file ? this.identities.identify(observation.file, sources) : {};
        if (!payload) return;

        return { ...observation.event, payload };
    }

    record(database: string, event: SkillTelemetryEvent): void {
        const store = new SkillReadRepository(database);
        try {
            store.recordEvent(event, { preserveFirstReceipt: true });
        } finally {
            store.close();
        }
    }
}
