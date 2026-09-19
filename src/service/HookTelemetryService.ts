// SPDX-License-Identifier: Apache-2.0
import { TelemetryInputRepository } from '../repository/TelemetryInputRepository.ts';
import { SkillReadIdentityRepository } from '../repository/SkillReadIdentityRepository.ts';
import { SkillReadRepository } from '../repository/SkillReadRepository.ts';
import { ClaudeTelemetryAdapter } from './ClaudeTelemetryAdapter.ts';

/** Host ingestion is explicit and local; raw hook bodies never enter storage. */
export class HookTelemetryService {
    async observe(database: string, collections: string[]) {
        const identities = new SkillReadIdentityRepository();
        const sources = identities.sources(collections);
        const input = await new TelemetryInputRepository().read('-', process.stdin, 1_048_576);
        const observation = new ClaudeTelemetryAdapter().observation(
            input,
            new Date().toISOString(),
        );
        if (!observation) return;
        const payload = observation.file ? identities.identify(observation.file, sources) : {};
        if (!payload) return;
        const store = new SkillReadRepository(database);
        try {
            store.recordEvent({ ...observation.event, payload }, { preserveFirstReceipt: true });
        } finally {
            store.close();
        }
    }
}
