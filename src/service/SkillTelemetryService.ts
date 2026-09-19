// SPDX-License-Identifier: Apache-2.0
import { SkillReadRepository } from '../repository/SkillReadRepository.ts';
import { TelemetryInputRepository } from '../repository/TelemetryInputRepository.ts';
import { TelemetryLogRepository } from '../repository/TelemetryLogRepository.ts';
import { SkillTelemetryValidator } from '../validator/SkillTelemetryValidator.ts';

/** Composes explicit local operations; no host event or task status is inferred. */
export class SkillTelemetryService {
    async record(database: string, file: string, logFile?: string) {
        const event = new SkillTelemetryValidator().event(
            await new TelemetryInputRepository().read(file),
        );
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
        const store = new SkillReadRepository(database);
        try {
            const result = store.recordEvent(event);
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
            store.close();
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
