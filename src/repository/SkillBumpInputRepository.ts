// SPDX-License-Identifier: Apache-2.0
import type { Readable } from 'node:stream';
import { TelemetryInputRepository } from './TelemetryInputRepository.ts';
import { MAX_BUMP_REQUEST_BYTES } from '../validator/SkillBumpReportValidator.ts';
import { SkillBumpReportError } from '../validator/SkillBumpReportError.ts';

/** Reuses strict bounded file/stdin decoding without any evidence database access. */
export class SkillBumpInputRepository {
    async read(
        filename: string,
        input: Readable = process.stdin,
        limit = MAX_BUMP_REQUEST_BYTES,
    ): Promise<unknown> {
        try {
            return await new TelemetryInputRepository().read(filename, input, limit);
        } catch {
            throw new SkillBumpReportError('invalid_input');
        }
    }
}
