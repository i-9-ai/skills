// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import {
    CollectionFilesystemRepository,
    LIMITS,
} from '../repository/CollectionFilesystemRepository.ts';
import { CollectionValidator } from '../validator/CollectionValidator.ts';
import { CollectionValidationError } from '../validator/CollectionValidationError.ts';

/** Apply the same collection asset contract before validation and plugin staging. */
export class CollectionAssetValidationService {
    private readonly svgDigests = new Set<string>();
    private readonly pngDigests = new Set<string>();
    private readonly validator: CollectionValidator;

    constructor(validator = new CollectionValidator()) {
        this.validator = validator;
    }

    validatePackage(root: CollectionFilesystemRepository, relative: string, openAi: any): void {
        const metadata = `${relative}/agents/openai.yaml`;
        const smallIcon = `${relative}/assets/icon.svg`;
        const largeIcon = `${relative}/assets/icon.png`;

        for (const file of [metadata, smallIcon, largeIcon]) {
            if (!root.inspect(file, { allowMissingLeaf: true }).info) {
                throw new CollectionValidationError(
                    `${relative} must include agents/openai.yaml, assets/icon.svg, and assets/icon.png`,
                );
            }
        }
        if (
            openAi?.icon_small !== './assets/icon.svg' ||
            openAi.icon_large !== './assets/icon.png'
        ) {
            throw new CollectionValidationError(
                `${relative} must declare the required small SVG and large PNG icons`,
            );
        }

        let svg: string;
        try {
            svg = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
                root.readBytes(smallIcon, LIMITS.textBytes),
            );
        } catch {
            throw new CollectionValidationError(`${smallIcon} must be valid UTF-8`);
        }
        this.validator.validateCollectionIcon(smallIcon, svg, this.svgDigests);

        const png = root.readBytes(largeIcon, LIMITS.artifactBytes);
        const digest = createHash('sha256').update(png).digest('hex');
        if (this.pngDigests.has(digest)) {
            throw new CollectionValidationError(`${largeIcon} duplicates another skill icon`);
        }
        this.pngDigests.add(digest);
        this.validator.validateCollectionPng(largeIcon, png);
    }
}
