// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NativeCodexSchemaConfiguration } from '../config/NativeCodexSchemaConfiguration.ts';
import { CodexJsonlCodec } from '../transport/CodexJsonlCodec.ts';

export type Schema = boolean | { [key: string]: any };

/** Loads only digest-pinned declarative schemas; never imports upstream implementation. */
export class NativeCodexSchemaRepository {
    private readonly schemas = new Map<string, Schema>();
    constructor(root: string) {
        if (realpathSync(root) !== resolve(root) || !lstatSync(root).isDirectory())
            throw new Error('schema_root');
        for (const [relative, digest] of Object.entries(
            NativeCodexSchemaConfiguration.identity.files,
        )) {
            const filename = join(root, relative);
            const stat = lstatSync(filename);
            if (
                !stat.isFile() ||
                stat.nlink !== 1 ||
                stat.size > 262_144 ||
                realpathSync(filename) !== filename
            )
                throw new Error('schema_file');
            const bytes = readFileSync(filename);
            if (createHash('sha256').update(bytes).digest('hex') !== digest)
                throw new Error('schema_digest');
            this.schemas.set(relative, CodexJsonlCodec.json(bytes) as Schema);
        }
    }
    get(name: string): Schema {
        const schema = this.schemas.get(name);
        if (!schema) throw new Error('unknown_schema');
        return schema;
    }
}
