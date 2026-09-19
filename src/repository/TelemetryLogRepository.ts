// SPDX-License-Identifier: Apache-2.0
import {
    appendFileSync,
    constants,
    lstatSync,
    openSync,
    closeSync,
    realpathSync,
    renameSync,
    unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute } from 'node:path';

export type TelemetryLogRecord = {
    timestamp: string;
    level: 'info' | 'error';
    component: 'skill-telemetry';
    category: 'recorded' | 'duplicate' | 'rejected';
    event_id?: string;
    correlation_id?: string;
};

/** Bounded diagnostic categories, deliberately separate from persisted events. */
export class TelemetryLogRepository {
    private readonly filename: string;
    private readonly maxBytes: number;
    private readonly archives: number;

    constructor(filename: string, maxBytes = 1_048_576, archives = 3) {
        if (!isAbsolute(filename) || realpathSync(dirname(filename)) !== dirname(filename)) {
            throw new Error('Log path needs an existing canonical absolute parent');
        }
        if (
            !Number.isInteger(maxBytes) ||
            maxBytes < 256 ||
            maxBytes > 16_777_216 ||
            !Number.isInteger(archives) ||
            archives < 1 ||
            archives > 10
        ) {
            throw new Error('Invalid log retention bounds');
        }
        this.filename = filename;
        this.maxBytes = maxBytes;
        this.archives = archives;
    }

    append(record: TelemetryLogRecord): void {
        // Reconstruct only known fields. Caller input and exception text never enter logs.
        if (
            !['info', 'error'].includes(record.level) ||
            !['recorded', 'duplicate', 'rejected'].includes(record.category) ||
            record.component !== 'skill-telemetry' ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.timestamp)
        ) {
            throw new Error('Invalid diagnostic record');
        }
        const identifiers: { event_id?: string; correlation_id?: string } = {};
        if (record.event_id !== undefined || record.correlation_id !== undefined) {
            const uuid =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
            if (
                typeof record.event_id !== 'string' ||
                typeof record.correlation_id !== 'string' ||
                !uuid.test(record.event_id) ||
                !uuid.test(record.correlation_id)
            ) {
                throw new Error('Invalid diagnostic identifiers');
            }
            identifiers.event_id = record.event_id;
            identifiers.correlation_id = record.correlation_id;
        }
        const line =
            JSON.stringify({
                timestamp: record.timestamp,
                level: record.level,
                component: record.component,
                category: record.category,
                ...identifiers,
            }) + '\n';
        if (Buffer.byteLength(line) > this.maxBytes) throw new Error('Log entry exceeds its bound');
        const current = this.size(this.filename);
        // Validate all selected destinations before a rotation can change anything.
        for (let index = 1; index <= this.archives; index++) this.size(this.filename + '.' + index);
        if (current !== null && current + Buffer.byteLength(line) > this.maxBytes) {
            const last = this.filename + '.' + this.archives;
            if (this.size(last) !== null) unlinkSync(last);
            for (let index = this.archives - 1; index >= 1; index--) {
                const source = this.filename + '.' + index;
                if (this.size(source) !== null)
                    renameSync(source, this.filename + '.' + (index + 1));
            }
            renameSync(this.filename, this.filename + '.1');
        }
        const fd = openSync(
            this.filename,
            constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
            0o600,
        );
        try {
            appendFileSync(fd, line);
        } finally {
            closeSync(fd);
        }
    }

    private size(filename: string): number | null {
        try {
            const info = lstatSync(filename);
            if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
                throw new Error('Log files must be regular and non-linked');
            return info.size;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
    }
}
