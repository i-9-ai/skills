// SPDX-License-Identifier: Apache-2.0
import { CollectionValidator } from './CollectionValidator.ts';

/** Closed public presentation contract; URLs are syntax-checked, not fetched. */
export class PluginListingValidator {
    validate(value: unknown): void {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Plugin listing must be an object.');
        const listing = value as Record<string, unknown>;
        const limits = {
            displayName: 30,
            shortDescription: 30,
            longDescription: 4000,
            developerName: 80,
            category: 80,
        };
        const urls = ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL'];
        const fields = [
            ...Object.keys(limits),
            ...urls,
            'logo',
            'composerIcon',
            'capabilities',
            'defaultPrompt',
        ];
        if (
            Object.keys(listing).length !== fields.length ||
            fields.some((field) => !Object.hasOwn(listing, field))
        )
            throw new Error('Plugin listing requires the complete supported presentation fields.');
        for (const [field, maximum] of Object.entries(limits)) {
            const text = listing[field];
            if (
                typeof text !== 'string' ||
                !text.trim() ||
                !text.isWellFormed() ||
                /[\u0000-\u001f\u007f]/u.test(text) ||
                [...text].length > maximum
            )
                throw new Error(`Plugin listing ${field} must contain 1 to ${maximum} characters.`);
        }
        for (const field of urls) {
            const text = listing[field];
            if (
                typeof text !== 'string' ||
                text.length > 1024 ||
                !text.isWellFormed() ||
                /\s/u.test(text)
            )
                throw new Error('Plugin listing URLs must be bounded absolute HTTPS URLs.');
            let url: URL;
            try {
                url = new URL(text);
            } catch {
                throw new Error('Plugin listing URLs must be absolute HTTPS URLs.');
            }
            if (
                url.protocol !== 'https:' ||
                url.username ||
                url.password ||
                !url.hostname ||
                url.hash
            )
                throw new Error(
                    'Plugin listing URLs must use HTTPS without credentials or fragments.',
                );
        }
        if (listing.logo !== './assets/plugin-icon.png' || listing.composerIcon !== listing.logo)
            throw new Error('Plugin listing must reference the bundled product icon.');
        if (JSON.stringify(listing.capabilities) !== '["Skills"]')
            throw new Error('Prepared public plugin capabilities must remain skills-only.');
        const prompts = listing.defaultPrompt;
        if (
            !Array.isArray(prompts) ||
            prompts.length < 1 ||
            prompts.length > 3 ||
            prompts.some(
                (prompt) =>
                    typeof prompt !== 'string' ||
                    !prompt.trim() ||
                    !prompt.isWellFormed() ||
                    [...prompt].length > 128 ||
                    /[\u0000-\u001f\u007f]/u.test(prompt),
            )
        )
            throw new Error('Plugin listing prompts must be nonblank single-line strings.');
        if (
            new Set(prompts.map((prompt) => prompt.trim().replace(/\s+/gu, ' '))).size !==
            prompts.length
        )
            throw new Error('Plugin listing prompts must be distinct.');
    }

    validateIcon(bytes: Buffer): void {
        new CollectionValidator().validateCollectionPng('assets/plugin-icon.png', bytes);
        const width = bytes.readUInt32BE(16);
        const height = bytes.readUInt32BE(20);
        if (width !== height || width < 256 || bytes.length > 4 * 1024 * 1024)
            throw new Error(
                'Plugin logo must be a square PNG of at least 256 pixels within 4 MiB.',
            );
    }
}
