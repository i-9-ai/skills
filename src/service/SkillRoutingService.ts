// SPDX-License-Identifier: Apache-2.0
import { SkillRoutingValidator } from '../validator/SkillRoutingValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';
import { SkillRoutingPackageRepository } from '../repository/SkillRoutingPackageRepository.ts';
import { TelemetryInputRepository } from '../repository/TelemetryInputRepository.ts';
import { PluginDataRepository } from '../repository/PluginDataRepository.ts';
import { SkillEvidenceService } from './SkillEvidenceService.ts';
import { TelemetryIdentityService } from './TelemetryIdentityService.ts';

/** Materializes one explicit decision before opening its shared evidence writer. */
export class SkillRoutingService {
    record(database: string | ((protectedRoots: string[]) => string), value: unknown) {
        const decision = new SkillRoutingValidator().decision(value);
        let events;
        const seenPaths = new Set<string>();
        try {
            const packages = new SkillRoutingPackageRepository();
            const identities = new TelemetryIdentityService();
            const seenMembers = new Set<string>();
            let bytes = 0;
            events = decision.selections.map((selection) => {
                const member = packages.inspect(selection.path);
                const key = JSON.stringify([selection.collection, member.skill]);
                bytes += member.bytes;
                if (seenPaths.has(member.canonical) || seenMembers.has(key) || bytes > 33554432)
                    throw new SkillOperationError('invalid_input');
                seenPaths.add(member.canonical);
                seenMembers.add(key);
                return {
                    schema_version: 2 as const,
                    event_type: 'skill.routed' as const,
                    event_id: identities.routingEventId(
                        decision.correlation_id,
                        selection.collection,
                        member.skill,
                    ),
                    correlation_id: decision.correlation_id,
                    session: decision.session,
                    occurred_at: decision.occurred_at,
                    source_host: decision.source_host,
                    source_adapter: decision.source_adapter,
                    payload: {
                        collection: selection.collection,
                        skill: member.skill,
                        source: member.source,
                        reason: null,
                    },
                };
            });
        } catch {
            throw new SkillOperationError('invalid_input');
        }
        return new SkillEvidenceService().recordRouting(() => {
            const selected = typeof database === 'string' ? database : database([...seenPaths]);
            return new PluginDataRepository().prepareDatabase(selected, [...seenPaths]);
        }, events);
    }

    async recordFile(database: string, file: string) {
        let value;
        try {
            value = await new TelemetryInputRepository().read(file, process.stdin, 32768);
        } catch {
            throw new SkillOperationError('invalid_input');
        }
        return this.record(database, value);
    }
}
