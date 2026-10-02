// SPDX-License-Identifier: Apache-2.0
export type SourceUnavailableReason =
    'not_git_source' | 'dirty_source' | 'unverified_repository' | 'git_unavailable';

export type BuildSourceReceipt = {
    schema_version: 1;
    package_name: '@i-9.ai/skills';
    package_version: string;
    repository: 'https://github.com/i-9-ai/skills';
    source:
        | { status: 'verified'; git_sha: string; verification: 'clean_git_checkout' }
        | { status: 'unavailable'; reason: SourceUnavailableReason };
    files: { path: string; byte_length: number; sha256: string }[];
};

/** Closed, bounded build assertions; hashes do not authenticate the publisher. */
export class BuildSourceReceiptValidator {
    static readonly file = 'dist/source-receipt.json';
    static readonly receiptBytes = 1_048_576;
    static readonly fileBytes = 4_194_304;
    static readonly totalBytes = 33_554_432;
    static readonly files = 4096;
    static readonly rootFiles = [
        'package.json',
        'skills-catalog.json',
        '.codex-plugin/plugin.json',
        'assets/plugin-icon.png',
        'bin/index.mjs',
        'bin/index.md',
        'README.md',
        'LICENSE',
        'NOTICE',
    ];

    receipt(value: unknown): BuildSourceReceipt {
        const receipt = this.object(value, [
            'schema_version',
            'package_name',
            'package_version',
            'repository',
            'source',
            'files',
        ]);
        if (
            receipt.schema_version !== 1 ||
            receipt.package_name !== '@i-9.ai/skills' ||
            receipt.repository !== 'https://github.com/i-9-ai/skills' ||
            typeof receipt.package_version !== 'string' ||
            receipt.package_version.length > 128 ||
            !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/u.test(
                receipt.package_version,
            ) ||
            !Array.isArray(receipt.files) ||
            receipt.files.length > BuildSourceReceiptValidator.files
        )
            throw new Error('Invalid package source receipt.');

        const files = receipt.files as Record<string, unknown>[];
        const source = this.object(receipt.source);
        if (source.status === 'verified') {
            this.object(source, ['status', 'git_sha', 'verification']);
            if (
                typeof source.git_sha !== 'string' ||
                !/^[a-f0-9]{40}$/u.test(source.git_sha) ||
                source.verification !== 'clean_git_checkout'
            )
                throw new Error('Invalid package source receipt.');
        } else {
            this.object(source, ['status', 'reason']);
            if (
                source.status !== 'unavailable' ||
                ![
                    'not_git_source',
                    'dirty_source',
                    'unverified_repository',
                    'git_unavailable',
                ].includes(String(source.reason)) ||
                files.length !== 0
            )
                throw new Error('Invalid package source receipt.');
        }

        let previous = '';
        let total = 0;
        for (const value of files) {
            const file = this.object(value, ['path', 'byte_length', 'sha256']);
            if (
                typeof file.path !== 'string' ||
                !this.allowed(file.path) ||
                file.path <= previous ||
                !Number.isSafeInteger(file.byte_length) ||
                Number(file.byte_length) < 0 ||
                Number(file.byte_length) > BuildSourceReceiptValidator.fileBytes ||
                typeof file.sha256 !== 'string' ||
                !/^[a-f0-9]{64}$/u.test(file.sha256)
            )
                throw new Error('Invalid package source receipt.');
            total += Number(file.byte_length);
            if (total > BuildSourceReceiptValidator.totalBytes)
                throw new Error('Invalid package source receipt.');
            previous = file.path;
        }
        if (
            source.status === 'verified' &&
            [
                'package.json',
                'skills-catalog.json',
                '.codex-plugin/plugin.json',
                'assets/plugin-icon.png',
                'bin/index.mjs',
                'dist/index.js',
            ].some((path) => !files.some((file) => file.path === path))
        )
            throw new Error('Invalid package source receipt.');
        return receipt as BuildSourceReceipt;
    }

    allowed(path: string): boolean {
        if (
            path.length > 1024 ||
            !path.isWellFormed() ||
            /[\u0000-\u001f\u007f\\]/u.test(path) ||
            path.split('/').some((part) => !part || part === '.' || part === '..') ||
            path.split('/').length > 24
        )
            return false;
        return (
            BuildSourceReceiptValidator.rootFiles.includes(path) ||
            /^dist\/.+\.js$/u.test(path) ||
            /^\.agents\/skills\/.+$/u.test(path) ||
            /^docs\/.+$/u.test(path)
        );
    }

    private object(value: unknown, keys?: string[]): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Invalid package source receipt.');
        const object = value as Record<string, unknown>;
        if (
            keys &&
            (Object.keys(object).length !== keys.length ||
                Object.keys(object).some((key) => !keys.includes(key)))
        )
            throw new Error('Invalid package source receipt.');
        return object;
    }
}
