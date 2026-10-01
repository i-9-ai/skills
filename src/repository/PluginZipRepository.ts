// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import {
    closeSync,
    constants,
    fchmodSync,
    fstatSync,
    openSync,
    readSync,
    writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { crc32 } from 'node:zlib';
import { relativeParts } from '../../.agents/skills/skill-authoring/scripts/skill_tools.mjs';
import { CollectionFilesystemRepository } from './CollectionFilesystemRepository.ts';
import type { PluginFile } from './PluginArtifactRepository.ts';

/** Bounded ZIP32 storage with fixed timestamps, no compression, comments or extra fields. */
export class PluginZipRepository {
    static readonly archiveBytes = 128 * 1024 * 1024;

    archive(files: PluginFile[]): Buffer {
        if (!files.length || files.length > 10_000)
            throw new Error('Submission ZIP exceeds its file count bound.');
        const local: Buffer[] = [];
        const central: Buffer[] = [];
        const paths = new Set<string>();
        let position = 0;
        let contentBytes = 0;
        for (const file of [...files].sort((left, right) =>
            Buffer.from(left.path).compare(Buffer.from(right.path)),
        )) {
            relativeParts(file.path);
            if (
                paths.has(file.path) ||
                ![0o644, 0o755].includes(file.mode) ||
                !Buffer.isBuffer(file.bytes) ||
                file.bytes.length > 4 * 1024 * 1024
            )
                throw new Error('Invalid submission ZIP file.');
            paths.add(file.path);
            contentBytes += file.bytes.length;
            if (contentBytes > 64 * 1024 * 1024)
                throw new Error('Submission ZIP exceeds its content bound.');
            const name = Buffer.from(file.path, 'utf8');
            if (name.length > 65_535) throw new Error('Submission ZIP path exceeds its bound.');
            const checksum = crc32(file.bytes);
            const header = Buffer.alloc(30);
            header.writeUInt32LE(0x04034b50, 0);
            header.writeUInt16LE(20, 4);
            header.writeUInt16LE(0x0800, 6);
            header.writeUInt16LE(33, 12); // January 1, 1980; DOS time remains midnight.
            header.writeUInt32LE(checksum, 14);
            header.writeUInt32LE(file.bytes.length, 18);
            header.writeUInt32LE(file.bytes.length, 22);
            header.writeUInt16LE(name.length, 26);
            local.push(header, name, file.bytes);

            const directory = Buffer.alloc(46);
            directory.writeUInt32LE(0x02014b50, 0);
            directory.writeUInt16LE((3 << 8) | 20, 4); // Unix file modes.
            directory.writeUInt16LE(20, 6);
            directory.writeUInt16LE(0x0800, 8);
            directory.writeUInt16LE(33, 14);
            directory.writeUInt32LE(checksum, 16);
            directory.writeUInt32LE(file.bytes.length, 20);
            directory.writeUInt32LE(file.bytes.length, 24);
            directory.writeUInt16LE(name.length, 28);
            directory.writeUInt32LE(((0o100000 | file.mode) << 16) >>> 0, 38);
            directory.writeUInt32LE(position, 42);
            central.push(directory, name);
            position += header.length + name.length + file.bytes.length;
        }
        const directoryBytes = central.reduce((total, bytes) => total + bytes.length, 0);
        if (position + directoryBytes + 22 > PluginZipRepository.archiveBytes)
            throw new Error('Submission ZIP exceeds its archive bound.');
        const end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50, 0);
        end.writeUInt16LE(files.length, 8);
        end.writeUInt16LE(files.length, 10);
        end.writeUInt32LE(directoryBytes, 12);
        end.writeUInt32LE(position, 16);
        return Buffer.concat([...local, ...central, end]);
    }

    /** Parent/output selection already passed the existing neutral artifact contract. */
    destinations(staging: string) {
        const parent = new CollectionFilesystemRepository(dirname(staging));
        try {
            const files = ['i9-skills.zip', 'i9-skills-submission.json'];
            for (const file of files)
                if (parent.inspect(file, { allowMissingLeaf: true }).info)
                    throw new Error('A submission output already exists; select a new parent.');
            return {
                archive: join(parent.path, files[0]),
                summary: join(parent.path, files[1]),
            };
        } finally {
            parent.close();
        }
    }

    write(destination: string, bytes: Buffer): void {
        const limit = destination.endsWith('.zip')
            ? PluginZipRepository.archiveBytes
            : 4 * 1024 * 1024;
        if (bytes.length > limit) throw new Error('Submission output exceeds its byte bound.');
        const parent = new CollectionFilesystemRepository(dirname(destination));
        try {
            const target = parent.inspect(basename(destination), { allowMissingLeaf: true });
            if (target.info) throw new Error('A submission output appeared during preparation.');
            parent.verifySnapshot(target);
            const descriptor = openSync(target.absolute, 'wx', 0o600);
            try {
                writeFileSync(descriptor, bytes);
                fchmodSync(descriptor, 0o600);
            } finally {
                closeSync(descriptor);
            }
            this.verifyWritten(parent, basename(destination), bytes);
        } finally {
            parent.close();
        }
    }

    digest(bytes: Buffer): string {
        return createHash('sha256').update(bytes).digest('hex');
    }

    private verifyWritten(
        parent: CollectionFilesystemRepository,
        file: string,
        bytes: Buffer,
    ): void {
        const snapshot = parent.inspect(file);
        if (!snapshot.info?.isFile() || snapshot.info.size !== bytes.length)
            throw new Error('A submission output changed during preparation.');
        const descriptor = openSync(
            snapshot.absolute,
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        try {
            const initial = fstatSync(descriptor);
            parent.verifySnapshot(snapshot);
            let offset = 0;
            while (offset <= bytes.length) {
                const chunk = Buffer.allocUnsafe(Math.min(65_536, bytes.length + 1 - offset));
                const count = readSync(descriptor, chunk, 0, chunk.length, null);
                if (count === 0) break;
                if (!chunk.subarray(0, count).equals(bytes.subarray(offset, offset + count)))
                    throw new Error('A submission output changed during preparation.');
                offset += count;
            }
            const after = fstatSync(descriptor);
            if (
                offset !== bytes.length ||
                after.size !== initial.size ||
                after.mtimeMs !== initial.mtimeMs ||
                after.ctimeMs !== initial.ctimeMs
            )
                throw new Error('A submission output changed during preparation.');
            parent.verifySnapshot(snapshot);
        } finally {
            closeSync(descriptor);
        }
    }
}
