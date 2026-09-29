// SPDX-License-Identifier: Apache-2.0
import { SkillEvidenceDatabaseRepository } from '../repository/SkillEvidenceDatabaseRepository.ts';
import { SkillMemoryRepository } from '../repository/SkillMemoryRepository.ts';
import { SkillMemoryValidator } from '../validator/SkillMemoryValidator.ts';
import type { SkillMemoryKind } from '../validator/SkillMemoryValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';

/** Explicit local inspection only; never creates, migrates or opens a writer. */
export class SkillMemoryService {
    summarize(database: string, value: unknown) {
        return this.inspect(database, value, 'summarize');
    }

    retention(database: string, value: unknown) {
        return this.inspect(database, value, 'retention');
    }

    private inspect(database: string, value: unknown, kind: SkillMemoryKind) {
        const validator = new SkillMemoryValidator();
        const query = validator.query(value, kind);
        validator.database(database);
        let connection: SkillEvidenceDatabaseRepository | undefined;
        try {
            connection = new SkillEvidenceDatabaseRepository(database, { readOnly: true });
            const repository = new SkillMemoryRepository(connection);
            return kind === 'summarize' ? repository.summarize(query) : repository.retention(query);
        } catch (error) {
            if (error instanceof SkillOperationError) throw error;
            throw new SkillOperationError('storage_unavailable');
        } finally {
            connection?.close();
        }
    }
}
