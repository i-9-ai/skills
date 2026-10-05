// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { SkillPackageTreeValidator } from '../validator/SkillPackageTreeValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';

/** Inert inspection with the shared 2,048 total-entry bound, including directories. */
export class SkillPackageRevisionRepository {
    inspect(directory: string) {
        const root = new SafeRoot(directory);
        try {
            const enumerate = root.inventory.bind(root) as () => [string, fs.Stats][];
            const before = enumerate().sort((left, right) =>
                Buffer.compare(Buffer.from(left[0]), Buffer.from(right[0])),
            );
            // Directory entries consume the same bounded traversal budget as regular files.
            const files = before.filter(([, info]) => info.isFile());
            if (
                files.length > 2048 ||
                !files.some(([name]) => name === 'SKILL.md') ||
                !files.some(([name]) => name === 'LICENSE')
            )
                throw new SkillOperationError('invalid_input');
            let total = 0;
            const inventory = files.map(([name, info]) => {
                if (total + info.size > 33_554_432) throw new SkillOperationError('invalid_input');
                const bytes = root.readBytes(name, Math.min(4_194_304, 33_554_432 - total));
                total += bytes.length;
                return {
                    path: name,
                    sha256: createHash('sha256').update(bytes).digest('hex'),
                    bytes: bytes.length,
                };
            });
            const after = enumerate().sort((left, right) =>
                Buffer.compare(Buffer.from(left[0]), Buffer.from(right[0])),
            );
            if (
                before.length !== after.length ||
                before.some(([name, info], index) => {
                    const [next, stat] = after[index];
                    return (
                        name !== next ||
                        ['dev', 'ino', 'mode', 'size', 'mtimeMs', 'ctimeMs'].some(
                            (key) => info[key as keyof fs.Stats] !== stat[key as keyof fs.Stats],
                        )
                    );
                })
            )
                throw new SkillOperationError('invalid_input');
            return {
                package_sha256: new SkillPackageTreeValidator().digest(inventory),
                files: inventory.length,
                bytes: total,
            };
        } finally {
            root.close();
        }
    }
}
