// SPDX-License-Identifier: Apache-2.0
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { strictJson } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';
import { ReleaseReferenceValidator } from '../validator/ReleaseReferenceValidator.ts';
import type { ReleaseReferenceReceipt } from '../validator/ReleaseReferenceValidator.ts';

export type ReleaseReferenceMode = 'record' | 'replay';
export type ReleaseReferenceControl = {
    mode: ReleaseReferenceMode;
    receipt: ReleaseReferenceReceipt;
};

/** Confined bounded control/results in a disposable version subprocess directory. */
export class ReleaseReferenceRepository {
    readonly root: string;
    private readonly validator = new ReleaseReferenceValidator();

    constructor(root: string) {
        this.root = root;
    }

    control(): ReleaseReferenceControl {
        const value = this.read('control.json');
        if (
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            Object.keys(value).length !== 2 ||
            !Object.hasOwn(value, 'mode') ||
            !Object.hasOwn(value, 'receipt')
        )
            throw new Error('Invalid release reference subprocess control.');
        const control = value as Record<string, unknown>;
        if (control.mode !== 'record' && control.mode !== 'replay')
            throw new Error('Invalid release reference subprocess mode.');
        return { mode: control.mode, receipt: this.validator.receipt(control.receipt) };
    }

    result(): ReleaseReferenceReceipt {
        return this.validator.receipt(this.read('result.json'));
    }

    writeControl(control: ReleaseReferenceControl): void {
        this.write('control.json', {
            mode: control.mode,
            receipt: this.validator.receipt(control.receipt),
        });
    }

    writeResult(receipt: ReleaseReferenceReceipt): void {
        this.write('result.json', this.validator.receipt(receipt));
    }

    private read(file: string): unknown {
        const safe = new SafeRoot(this.root);
        try {
            return strictJson(safe.readBytes(file, ReleaseReferenceValidator.maximumBytes));
        } finally {
            safe.close();
        }
    }

    private write(file: string, value: unknown): void {
        const safe = new SafeRoot(this.root);
        try {
            safe.inspect(file, { allowMissingLeaf: true });
            const content = JSON.stringify(value, null, 2) + '\n';
            if (Buffer.byteLength(content) > ReleaseReferenceValidator.maximumBytes)
                throw new Error('Release reference evidence exceeds the supported byte limit.');
            writeFileSync(join(this.root, file), content);
        } finally {
            safe.close();
        }
    }
}
