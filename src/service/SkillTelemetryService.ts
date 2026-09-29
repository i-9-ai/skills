// SPDX-License-Identifier: Apache-2.0
import { SkillReadRepository } from '../repository/SkillReadRepository.ts';
import { TelemetryInputRepository } from '../repository/TelemetryInputRepository.ts';
import { TelemetryLogRepository } from '../repository/TelemetryLogRepository.ts';
import { SkillTelemetryValidator } from '../validator/SkillTelemetryValidator.ts';
import { SkillEvidenceValidator } from '../validator/SkillEvidenceValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';
import { SkillEvidenceService } from './SkillEvidenceService.ts';

/** Composes explicit local operations; no host event or task status is inferred. */
export class SkillTelemetryService {
    async record(database: string, file: string, logFile?: string) {
        let input: unknown;
        try {
            input = await new TelemetryInputRepository().read(file);
        } catch {
            throw new SkillOperationError('invalid_input');
        }
        const event =
            input &&
            typeof input === 'object' &&
            'schema_version' in input &&
            input.schema_version === 2
                ? new SkillEvidenceValidator().lifecycle(input)
                : new SkillTelemetryValidator().event(input);
        if (logFile) {
            const protectedFiles = [
                database,
                database + '-wal',
                database + '-shm',
                database + '-journal',
            ];
            if (file !== '-') protectedFiles.push(file);
            TelemetryLogRepository.assertSeparate(logFile, protectedFiles);
        }
        let store: SkillReadRepository | undefined;
        try {
            const result =
                event.schema_version === 2
                    ? new SkillEvidenceService().recordLifecycle(database, event)
                    : (store = new SkillReadRepository(database)).recordEvent(event);
            let logStatus = logFile ? 'written' : 'disabled';
            if (logFile) {
                try {
                    new TelemetryLogRepository(logFile).append({
                        timestamp: new Date().toISOString(),
                        level: 'info',
                        component: 'skill-telemetry',
                        category: result.recorded ? 'recorded' : 'duplicate',
                        event_id: event.event_id,
                        correlation_id: event.correlation_id,
                    });
                } catch {
                    // Storage already committed. Report log failure without suggesting
                    // that the observation should be repeated with a different ID.
                    logStatus = 'unavailable';
                }
            }
            return { ...result, log: logStatus };
        } finally {
            store?.close();
        }
    }

    rankings(database: string, query: unknown) {
        const store = new SkillReadRepository(database, { readOnly: true });
        try {
            return store.rank(query);
        } finally {
            store.close();
        }
    }

    trends(database: string, query: unknown) {
        const store = new SkillReadRepository(database, { readOnly: true });
        try {
            return store.trends(query);
        } finally {
            store.close();
        }
    }
}
