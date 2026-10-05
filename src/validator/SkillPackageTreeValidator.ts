// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { SkillEvidenceContractValidator } from './SkillEvidenceContractValidator.ts';

export type PackageTreeFile = { path: string; sha256: string; bytes: number };

/** The benchmark's exact portable tree representation; hashes prove byte identity only. */
export class SkillPackageTreeValidator {
    digest(files: PackageTreeFile[]): string {
        const contract = new SkillEvidenceContractValidator();
        if (!Array.isArray(files) || files.length > 2_048) contract.invalid();
        let total = 0;
        const paths = new Set<string>();
        for (const value of files) {
            const file = contract.object(value, ['path', 'sha256', 'bytes']);
            const path = contract.path(file.path);
            contract.hash(file.sha256);
            if ((file.sha256 as string).length !== 64) contract.invalid();
            total += contract.integer(file.bytes, 0, 4_194_304);
            if (paths.has(path) || total > 33_554_432) contract.invalid();
            paths.add(path);
        }
        const hash = createHash('sha256');
        for (const file of [...files].sort((left, right) =>
            Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)),
        ))
            hash.update(`${file.path}\0${file.sha256}\n`);
        return hash.digest('hex');
    }
}
