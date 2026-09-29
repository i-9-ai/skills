// SPDX-License-Identifier: Apache-2.0
import { SkillEvidenceDatabaseRepository } from '../repository/SkillEvidenceDatabaseRepository.ts';
import { SkillLifecycleRepository } from '../repository/SkillLifecycleRepository.ts';
import { CatalogObservationRepository } from '../repository/CatalogObservationRepository.ts';
import { TelemetryInputRepository } from '../repository/TelemetryInputRepository.ts';
import { SkillEvidenceValidator } from '../validator/SkillEvidenceValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';

type DatabaseSelection = string | (() => string);
export type EvidenceQueryKind = 'lifecycle' | 'overlap' | 'inactivity' | 'history';

/** CLI and MCP share validation before any writer or host data-directory creation. */
export class SkillEvidenceService {
    recordLifecycle(database: DatabaseSelection, value: unknown) {
        const event = new SkillEvidenceValidator().lifecycle(value);
        return this.store(database, false, (connection) =>
            new SkillLifecycleRepository(connection).record(event),
        );
    }

    recordCatalog(database: DatabaseSelection, value: unknown) {
        const event = new SkillEvidenceValidator().catalog(value);
        return this.store(database, false, (connection) =>
            new CatalogObservationRepository(connection).record(event),
        );
    }

    async recordCatalogFile(database: string, file: string) {
        let input: unknown;
        try {
            input = await new TelemetryInputRepository().read(file, process.stdin, 262144);
        } catch {
            throw new SkillOperationError('invalid_input');
        }
        return this.recordCatalog(database, input);
    }

    query(database: DatabaseSelection, kind: EvidenceQueryKind, value: unknown) {
        // Validate before resolving a database selector; repositories recheck their public input.
        new SkillEvidenceValidator().query(value, kind);
        return this.store(database, true, (connection) => {
            if (kind === 'lifecycle')
                return new SkillLifecycleRepository(connection).metrics(value);
            if (kind === 'overlap') return new SkillLifecycleRepository(connection).overlap(value);
            if (kind === 'inactivity')
                return new CatalogObservationRepository(connection).inactivity(value);
            return new CatalogObservationRepository(connection).history(value);
        });
    }

    private store<T>(
        selection: DatabaseSelection,
        readOnly: boolean,
        operation: (connection: SkillEvidenceDatabaseRepository) => T,
    ): T {
        let connection: SkillEvidenceDatabaseRepository | undefined;
        try {
            connection = new SkillEvidenceDatabaseRepository(
                typeof selection === 'string' ? selection : selection(),
                { readOnly },
            );
            return operation(connection);
        } catch (error) {
            if (error instanceof SkillOperationError) throw error;
            throw new SkillOperationError('storage_unavailable');
        } finally {
            connection?.close();
        }
    }
}
