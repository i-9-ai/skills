// SPDX-License-Identifier: Apache-2.0
import { dirname, join } from 'node:path';
import { mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';
import { NativePilotInventoryRepository, pilotDigest } from './NativePilotInventoryRepository.ts';
import { relativePilotPath } from '../validator/NativePilotContractValidator.ts';

export interface NativePilotEvidence {
    path: string;
    sha256: string;
    bytes: number;
    kind: 'native-log' | 'process' | 'inventory' | 'state' | 'confinement' | 'retention';
}

/** Verifies retained local evidence bytes; never grants authenticity or writes SQLite. */
export class NativePilotEvidenceRepository {
    readonly inventory = new NativePilotInventoryRepository();

    verify(root: string, evidence: NativePilotEvidence[]) {
        this.inventory.canonicalDirectory(root);
        if (!evidence.length || evidence.length > NativePilotConfiguration.evidence.receipts)
            throw new Error('Retained private evidence is required.');
        let retentionBytes = 0;
        let ordinaryBytes = 0;
        for (const item of evidence) {
            const limit = NativePilotConfiguration.evidenceFileLimit(item.kind);
            if (!Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > limit)
                throw new Error('Retained evidence exceeds its file-kind byte bound.');
            if (item.kind === 'retention') retentionBytes += item.bytes;
            else ordinaryBytes += item.bytes;
            if (!NativePilotConfiguration.evidenceBytesWithinBounds(retentionBytes, ordinaryBytes))
                throw new Error('One phase exceeds the private evidence byte bound.');
        }
        const paths = new Set();
        for (const item of evidence) {
            if (!relativePilotPath(item.path) || paths.has(item.path))
                throw new Error('Invalid or duplicate evidence locator.');
            const path = join(root, item.path);
            if (
                realpathSync(dirname(path)) !== dirname(path) ||
                !this.inventory.contains(root, path)
            ) {
                throw new Error('Linked or escaping evidence parent.');
            }
            const actual = this.inventory.file(
                path,
                NativePilotConfiguration.evidenceFileLimit(item.kind),
            );
            if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes)
                throw new Error('Retained evidence does not match its receipt.');
            paths.add(item.path);
        }
    }

    preflightOutput(
        preparationRoot: string,
        contractSha256: string,
        parent: string,
        evidenceRoot: string,
    ) {
        const root = this.inventory.canonicalDirectory(preparationRoot);
        const home = realpathSync(homedir());
        if (
            root === home ||
            this.inventory.contains(home, root) ||
            parent !== join(root, 'output', 'journal') ||
            evidenceRoot !== join(root, 'output', 'evidence')
        ) {
            throw new Error(
                'Journal and evidence require the separate owned output roots, outside home and protected inputs.',
            );
        }
        this.inventory.canonicalDirectory(join(root, 'output'));
        this.inventory.canonicalDirectory(parent);
        this.inventory.canonicalDirectory(evidenceRoot);
        if (
            this.inventory.file(join(root, '.i9-native-pilot-owned')).sha256 !==
                pilotDigest('private-inert-preparation-v1\n') ||
            pilotDigest(JSON.stringify(this.inventory.readJson(join(root, 'contract.json')))) !==
                contractSha256 ||
            JSON.stringify(
                this.inventory.readJson(join(root, 'output', '.i9-native-pilot-output-owned')),
            ) !==
                JSON.stringify({
                    schema_version: 1,
                    contract_sha256: contractSha256,
                    journal: 'journal',
                    evidence: 'evidence',
                })
        ) {
            throw new Error('Output ownership or preparation contract changed.');
        }
    }

    createJournal(
        preparationRoot: string,
        contractSha256: string,
        parent: string,
        evidenceRoot: string,
        run: string,
    ) {
        if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(run) ||
            run.length !== 36
        ) {
            throw new Error('A journal requires a canonical run identity.');
        }
        this.preflightOutput(preparationRoot, contractSha256, parent, evidenceRoot);
        const path = join(parent, run);
        mkdirSync(path, { mode: 0o700 });
        return path;
    }

    append(root: string, sequence: number, record: unknown) {
        if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence >= 20)
            throw new Error('Invalid phase sequence.');
        this.inventory.canonicalDirectory(root);
        return this.inventory.writeJson(
            join(root, `${String(sequence).padStart(2, '0')}.json`),
            record,
        );
    }
}
