// SPDX-License-Identifier: Apache-2.0
import { CollectionValidationError } from './CollectionValidationError.ts';
// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

export const IGNORED_ROOT_NAMES = Object.freeze([
    '.git',
    '.beads',
    '.codex',
    '.work',
    'tmp',
    'node_modules',
]);
export const REPOSITORY_ALIASES = Object.freeze({
    'CLAUDE.md': 'AGENTS.md',
    'GEMINI.md': 'AGENTS.md',
    '.claude/skills': '../.agents/skills',
    '.github/skills': '../.agents/skills',
});

const SHA256 = /^[0-9a-f]{64}$/;
const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const PUBLIC_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
    ['private key material', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
    ['cloud access credential', /\bAKIA[A-Z0-9]{16}\b/],
    ['GitHub credential', /\bgh[pousr]_[A-Za-z0-9]{36,255}\b|\bgithub_pat_[A-Za-z0-9_]{22,255}\b/],
    ['API credential', /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/],
    ['authenticated URL', /https?:\/\/[^\s/:]+:[^\s/@]+@/],
    [
        'private local path',
        /\/(?:Users|home|root|workspace)\/[A-Za-z0-9_.-]+(?:\/|\b)|[A-Za-z]:\\(?:Users)\\/,
    ],
];

type PngColorType = 0 | 2 | 3 | 4 | 6;
interface PngHeader {
    width: number;
    height: number;
    bitDepth: number;
    colorType: PngColorType;
}

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const PNG_CRC_TABLE = (() => {
    const values = new Uint32Array(256);
    for (let index = 0; index < values.length; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
        values[index] = value >>> 0;
    }
    return values;
})();

const LIMIT_PNG_CHUNK = 16 * 1024 * 1024;

/** Validates catalog identity, source evidence and publication-safe assets. */
export class CollectionValidator {
    checkPublicHygiene(relative: string, text: string) {
        for (const [label, pattern] of PUBLIC_PATTERNS) {
            const match = pattern.exec(text);
            if (match) {
                const line = text.slice(0, match.index).split('\n').length;
                // Report a location and category, never credential-like matched bytes.
                throw new CollectionValidationError(
                    `${relative}:${line}: possible ${label}; inspect and sanitize`,
                );
            }
        }
    }

    checkPublicHygieneBytes(relative: string, payload: Uint8Array) {
        this.checkPublicHygiene(relative, Buffer.from(payload).toString('latin1'));
    }

    validateCatalog(value: unknown, files: ReadonlySet<string>, directories: ReadonlySet<string>) {
        const catalog = this.exactFields(value, ['schema_version', 'skills'], 'catalog');
        this.requireCondition(Array.isArray(catalog.skills), 'catalog must contain a skills array');
        this.requireCondition(catalog.schema_version === 1, 'catalog schema_version must be 1');
        this.requireCondition(
            catalog.skills.length > 0 && catalog.skills.length <= 256,
            'catalog must contain between 1 and 256 packages',
        );
        const names = new Set<string>();
        const packages = new Set<string>();
        for (const item of catalog.skills) {
            const entry = this.exactFields(
                item,
                ['name', 'path', 'description', 'tags'],
                'catalog entry',
            );
            const name = this.slug(entry.name, 'catalog skill name');
            this.requireCondition(!names.has(name), 'catalog names must be distinct');
            names.add(name);
            const expected = `.agents/skills/${name}`;
            this.requireCondition(
                entry.path === expected,
                'catalog path must be .agents/skills/<name>',
            );
            this.nonblank(entry.description, 'catalog description', 220);
            this.requireCondition(
                Array.isArray(entry.tags) && entry.tags.length <= 16,
                'catalog tags must be a bounded array',
            );
            const tags = entry.tags.map((tag) => this.slug(tag, 'catalog tag'));
            this.requireCondition(
                new Set(tags).size === tags.length &&
                    [...tags].sort().every((tag, index) => tag === tags[index]),
                'catalog tags must be distinct and sorted',
            );
            this.requireCondition(
                files.has(`${expected}/SKILL.md`),
                `catalog package is missing: ${name}`,
            );
            packages.add(expected);
        }
        this.requireCondition(
            [...names]
                .sort()
                .every(
                    (name, index) =>
                        name === (catalog.skills as Array<Record<string, unknown>>)[index].name,
                ),
            'catalog skills must be sorted by name',
        );
        const actual = new Set(
            [...directories].filter(
                (relative) =>
                    relative.startsWith('.agents/skills/') && relative.split('/').length === 3,
            ),
        );
        this.requireCondition(
            packages.size === actual.size && [...packages].every((path) => actual.has(path)),
            'catalog and package directories do not agree',
        );
        return { names, packages };
    }

    validateCollectionIcon(relative: string, text: string, digests: Set<string>) {
        this.requireCondition(text.startsWith('<svg '), `${relative} must be a titled 64x64 SVG`);
        const structure = this.validateSafeSvg(relative, text);
        this.requireCondition(
            structure.rootAttributes.get('viewBox') === '0 0 64 64' &&
                structure.titleCount === 1 &&
                structure.titleText.trim(),
            `${relative} must be a titled 64x64 SVG`,
        );
        this.requireCondition(
            !/<script\b|\bon[a-z]+\s*=|\b(?:href|src)\s*=|data:|@import\b/iu.test(text),
            `${relative} contains active or external SVG content`,
        );
        const digest = createHash('sha256').update(text).digest('hex');
        this.requireCondition(!digests.has(digest), `${relative} duplicates another skill icon`);
        digests.add(digest);
    }

    validateCollectionPng(relative: string, bytes: Buffer) {
        this.requireCondition(
            Buffer.isBuffer(bytes) &&
                bytes.length >= 57 &&
                bytes.subarray(0, 8).equals(PNG_SIGNATURE),
            `${relative} must be a valid PNG`,
        );
        let offset = 8;
        let ihdr: PngHeader | undefined;
        let sawPalette = false;
        let sawTransparency = false;
        let paletteEntries = 0;
        let sawIdat = false;
        let closedIdatSequence = false;
        let sawIend = false;
        const idat = [];
        while (offset < bytes.length) {
            this.requireCondition(offset + 12 <= bytes.length, `${relative} must be a valid PNG`);
            const size = bytes.readUInt32BE(offset);
            const type = bytes.toString('ascii', offset + 4, offset + 8);
            const end = offset + 12 + size;
            this.requireCondition(
                size <= LIMIT_PNG_CHUNK && end <= bytes.length && /^[A-Za-z]{4}$/.test(type),
                `${relative} must be a valid PNG`,
            );
            const content = bytes.subarray(offset + 8, offset + 8 + size);
            this.requireCondition(
                this.pngCrc(bytes.subarray(offset + 4, offset + 8 + size)) ===
                    bytes.readUInt32BE(offset + 8 + size),
                `${relative} must be a valid PNG`,
            );
            if (!ihdr) {
                this.requireCondition(
                    type === 'IHDR' && size === 13,
                    `${relative} must be a valid PNG`,
                );
                const width = content.readUInt32BE(0);
                const height = content.readUInt32BE(4);
                const bitDepth = content[8];
                const colorType = content[9];
                this.requireCondition(
                    width > 0 &&
                        height > 0 &&
                        width <= 4096 &&
                        height <= 4096 &&
                        this.validPngBitDepth(bitDepth, colorType) &&
                        content[10] === 0 &&
                        content[11] === 0 &&
                        content[12] === 0,
                    `${relative} must be a supported PNG`,
                );
                ihdr = { width, height, bitDepth, colorType };
                offset = end;
                continue;
            }

            switch (type) {
                case 'IHDR':
                    this.requireCondition(false, `${relative} must be a valid PNG`);
                    break;
                case 'PLTE':
                    this.requireCondition(
                        [2, 3, 6].includes(ihdr.colorType) &&
                            !sawPalette &&
                            !sawIdat &&
                            size >= 3 &&
                            size % 3 === 0,
                        `${relative} must be a valid PNG`,
                    );
                    paletteEntries = size / 3;
                    this.requireCondition(
                        paletteEntries <= 256 &&
                            (ihdr.colorType !== 3 || paletteEntries <= 2 ** ihdr.bitDepth),
                        `${relative} must be a valid PNG`,
                    );
                    sawPalette = true;
                    break;
                case 'tRNS':
                    this.requireCondition(
                        !sawTransparency && !sawIdat && [0, 2, 3].includes(ihdr.colorType),
                        `${relative} must be a valid PNG`,
                    );
                    this.requireCondition(
                        (ihdr.colorType === 0 && size === 2) ||
                            (ihdr.colorType === 2 && size === 6) ||
                            (ihdr.colorType === 3 &&
                                sawPalette &&
                                size > 0 &&
                                size <= paletteEntries),
                        `${relative} must be a valid PNG`,
                    );
                    sawTransparency = true;
                    break;
                case 'IDAT':
                    this.requireCondition(
                        !sawIend && !closedIdatSequence,
                        `${relative} must be a valid PNG`,
                    );
                    this.requireCondition(
                        ihdr.colorType !== 3 || sawPalette,
                        `${relative} must be a valid PNG`,
                    );
                    sawIdat = true;
                    idat.push(content);
                    break;
                case 'IEND':
                    this.requireCondition(
                        size === 0 && sawIdat && !sawIend && end === bytes.length,
                        `${relative} must be a valid PNG`,
                    );
                    sawIend = true;
                    break;
                default:
                    this.requireCondition(
                        type.charCodeAt(0) >= 97,
                        `${relative} must be a valid PNG`,
                    );
            }
            if (sawIdat && type !== 'IDAT') closedIdatSequence = true;
            offset = end;
        }
        this.requireCondition(ihdr && sawIdat && sawIend, `${relative} must be a valid PNG`);
        const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.colorType];
        const rowBytes = Math.ceil((ihdr.width * channels * ihdr.bitDepth) / 8);
        const expected = ihdr.height * (rowBytes + 1);
        try {
            const decoded = inflateSync(Buffer.concat(idat), { maxOutputLength: expected + 1 });
            this.requireCondition(decoded.length === expected, `${relative} must be a valid PNG`);
            const rows = this.unfilterPngRows(decoded, ihdr, rowBytes, relative);
            if (ihdr.colorType === 3) {
                const mask = (1 << ihdr.bitDepth) - 1;
                for (const row of rows)
                    for (let pixel = 0; pixel < ihdr.width; pixel += 1) {
                        const bitOffset = pixel * ihdr.bitDepth;
                        const index = row[Math.floor(bitOffset / 8)];
                        const shift = 8 - ihdr.bitDepth - (bitOffset % 8);
                        this.requireCondition(
                            ((index >> shift) & mask) < paletteEntries,
                            `${relative} must be a valid PNG`,
                        );
                    }
            }
        } catch (error) {
            if (error instanceof CollectionValidationError) throw error;
            throw new CollectionValidationError(`${relative} must be a valid PNG`);
        }
    }

    validateLock(value: unknown, names: ReadonlySet<string>) {
        const data = this.exactFields(
            value,
            ['schema_version', 'observed_on', 'hash_algorithm', 'sources'],
            'upstream lock',
        );
        this.requireCondition(data.schema_version === 1, 'upstream lock schema_version must be 1');
        this.requireCondition(
            data.hash_algorithm === 'sha256',
            'upstream lock hash_algorithm must be sha256',
        );
        const observed =
            typeof data.observed_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.observed_on)
                ? new Date(`${data.observed_on}T00:00:00Z`)
                : new Date(NaN);
        this.requireCondition(
            !Number.isNaN(observed.valueOf()) &&
                observed.toISOString().slice(0, 10) === data.observed_on,
            'upstream lock observed_on must be an ISO date',
        );
        this.requireCondition(
            Array.isArray(data.sources) && data.sources.length > 0 && data.sources.length <= 128,
            'upstream lock sources must contain between 1 and 128 entries',
        );
        const identifiers = new Set();
        for (const item of data.sources) {
            const source = this.exactFields(
                item,
                [
                    'id',
                    'repository',
                    'revision',
                    'package_path',
                    'license',
                    'license_path',
                    'license_sha256',
                    'reuse',
                    'consumers',
                    'files',
                    'package_sha256',
                ],
                'locked source',
            );
            const identifier = this.slug(source.id, 'locked source id');
            this.requireCondition(
                !identifiers.has(identifier),
                'locked source IDs must be distinct',
            );
            identifiers.add(identifier);
            const repositoryUrl = this.nonblank(source.repository, 'locked repository', 2048);
            let repository;
            try {
                repository = new URL(repositoryUrl);
            } catch {
                /* Rejected by the condition below. */
            }
            this.requireCondition(
                repository?.protocol === 'https:' &&
                    repository.hostname &&
                    this.publicRepositoryHostname(repository.hostname) &&
                    !repository.username &&
                    !repository.password &&
                    !repository.search &&
                    !repository.hash,
                'locked repository must be a public HTTPS URL',
            );
            this.requireCondition(
                typeof source.revision === 'string' &&
                    [40, 64].includes(source.revision.length) &&
                    REVISION.test(source.revision),
                'locked source revision must be an immutable 40/64-hex commit',
            );
            this.relativePath(source.package_path);
            this.relativePath(source.license_path);
            const license = this.nonblank(source.license, 'locked source license', 256);
            this.requireCondition(
                ![
                    'unknown',
                    'unknown license',
                    'tbd',
                    'none',
                    'unlicensed',
                    'proprietary',
                    'no-license',
                    'n/a',
                    'na',
                ].includes(license.trim().toLowerCase()),
                'locked source license must not be a placeholder',
            );
            this.requireCondition(
                typeof source.reuse === 'string' &&
                    ['pattern', 'adapt', 'reference', 'reject'].includes(source.reuse),
                'invalid locked source reuse',
            );
            for (const key of ['license_sha256', 'package_sha256']) {
                this.requireCondition(
                    typeof source[key] === 'string' &&
                        source[key].length === 64 &&
                        SHA256.test(source[key]),
                    `locked source ${key} must be a lowercase SHA-256`,
                );
            }
            this.requireCondition(
                Array.isArray(source.consumers) && source.consumers.length <= names.size,
                'invalid locked source consumers',
            );
            this.requireCondition(
                source.consumers.every((name) => typeof name === 'string' && names.has(name)),
                'locked source consumer must name a catalog package',
            );
            this.requireCondition(
                new Set(source.consumers).size === source.consumers.length,
                'locked source consumers must be distinct',
            );
            this.requireCondition(
                Array.isArray(source.files) &&
                    source.files.length > 0 &&
                    source.files.length <= 2048,
                'locked source files must contain between 1 and 2048 entries',
            );
            const hashes = new Map<string, string>();
            for (const item of source.files) {
                const file = this.exactFields(item, ['path', 'sha256'], 'locked file');
                this.relativePath(file.path);
                this.requireCondition(!hashes.has(file.path), 'locked file paths must be distinct');
                this.requireCondition(
                    typeof file.sha256 === 'string' &&
                        file.sha256.length === 64 &&
                        SHA256.test(file.sha256),
                    'locked file sha256 must be a lowercase SHA-256',
                );
                hashes.set(file.path, file.sha256);
            }
            const aggregate = createHash('sha256');
            const sorted = [...hashes].sort(([left], [right]) =>
                Buffer.compare(Buffer.from(left), Buffer.from(right)),
            );
            for (const [path, digest] of sorted) aggregate.update(`${path}\0${digest}\n`, 'utf8');
            this.requireCondition(
                aggregate.digest('hex') === source.package_sha256,
                `locked source package aggregate mismatch: ${identifier}`,
            );
        }
        return data.sources.length;
    }

    private requireCondition(condition: unknown, message: string): asserts condition {
        if (!condition) throw new CollectionValidationError(message);
    }

    private isObject(value: unknown): value is Record<string, unknown> {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    private exactFields(value: unknown, expected: readonly string[], label: string) {
        this.requireCondition(this.isObject(value), `${label} must be an object`);
        const keys = Object.keys(value);
        this.requireCondition(
            keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key)),
            `${label} has missing or unexpected fields`,
        );
        return value;
    }

    private nonblank(value: unknown, label: string, limit: number) {
        this.requireCondition(
            typeof value === 'string' && value.trim().length > 0 && [...value].length <= limit,
            `${label} must be a nonblank string of at most ${limit} characters`,
        );
        this.requireCondition(
            value.isWellFormed() && !/[\x00-\x08\x0b-\x1f\x7f]/.test(value),
            `${label} contains invalid Unicode or control characters`,
        );
        return value;
    }

    private slug(value: unknown, label: string) {
        this.requireCondition(
            typeof value === 'string' &&
                value.length <= 64 &&
                value.trim() === value &&
                /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value),
            `${label} must be a lowercase hyphenated slug of at most 64 characters`,
        );
        return value;
    }

    private relativePath(value: unknown): asserts value is string {
        this.requireCondition(
            typeof value === 'string' && value.length > 0 && value.length <= 1024,
            'path must be a nonempty relative POSIX path of at most 1024 characters',
        );
        this.requireCondition(
            value.isWellFormed() && !/[\\\x00-\x1f\x7f]/.test(value),
            'path contains a backslash, invalid Unicode, or control character',
        );
        this.requireCondition(
            !value.startsWith('/') && !/^[A-Za-z]:/.test(value),
            'absolute paths are not allowed',
        );
        const parts = value.split('/');
        this.requireCondition(
            parts.every((part) => !['', '.', '..'].includes(part)),
            'path contains an empty, current-directory, or parent-directory component',
        );
        this.requireCondition(parts.length <= 24, 'path nesting exceeds the limit');
    }

    private validateSafeSvg(relative: string, text: string) {
        this.requireCondition(
            !/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text),
            `${relative} is not well-formed XML`,
        );
        const stack: Array<{ name: string; namespaces: Map<string, string> }> = [];
        let offset = 0;
        let rootCount = 0;
        let rootAttributes: Map<string, string> | undefined;
        let titleCount = 0;
        let titleText = '';
        while (offset < text.length) {
            if (text.startsWith('<!--', offset)) {
                const end = text.indexOf('-->', offset + 4);
                this.requireCondition(
                    end !== -1 && !text.slice(offset + 4, end).includes('--'),
                    `${relative} is not well-formed XML`,
                );
                offset = end + 3;
                continue;
            }
            if (text[offset] !== '<') {
                const end = text.indexOf('<', offset);
                const content = text.slice(offset, end === -1 ? text.length : end);
                this.requireCondition(
                    stack.length > 0 || /^\s*$/.test(content),
                    `${relative} is not well-formed XML`,
                );
                this.requireCondition(
                    !/[<&]/.test(content) ||
                        /^(?:[^<&]|&(?:amp|apos|gt|lt|quot|#[0-9]+|#x[0-9a-fA-F]+);)*$/.test(
                            content,
                        ),
                    `${relative} is not well-formed XML`,
                );
                if (stack.at(-1)?.name === 'style')
                    this.validateSvgPaintReferences(relative, content);
                if (stack.length === 2 && stack[0].name === 'svg' && stack[1].name === 'title')
                    titleText += this.decodeXmlEntities(relative, content);
                offset = end === -1 ? text.length : end;
                continue;
            }
            this.requireCondition(
                !text.startsWith('<?', offset) && !text.startsWith('<!', offset),
                `${relative} contains unsupported XML declarations`,
            );
            const closing = text.startsWith('</', offset);
            const tagStart = offset + (closing ? 2 : 1);
            const tagMatch = /^([A-Za-z_][A-Za-z0-9_.:-]*)/.exec(text.slice(tagStart));
            this.requireCondition(tagMatch, `${relative} is not well-formed XML`);
            const name = tagMatch[1];
            const localName = name.split(':').pop()!.toLowerCase();
            this.requireCondition(
                ![
                    'script',
                    'foreignobject',
                    'iframe',
                    'object',
                    'embed',
                    'animate',
                    'animatemotion',
                    'animatetransform',
                    'set',
                ].includes(localName),
                `${relative} contains active or external SVG content`,
            );
            let cursor = tagStart + name.length;
            let quote = '';
            while (cursor < text.length) {
                const character = text[cursor];
                if (quote) {
                    if (character === quote) quote = '';
                    cursor += 1;
                    continue;
                }
                if (character === '"' || character === "'") {
                    quote = character;
                    cursor += 1;
                    continue;
                }
                if (character === '>') break;
                this.requireCondition(character !== '<', `${relative} is not well-formed XML`);
                cursor += 1;
            }
            this.requireCondition(
                cursor < text.length && !quote,
                `${relative} is not well-formed XML`,
            );
            const source = text.slice(tagStart + name.length, cursor);
            if (closing) {
                const parent = stack.at(-1);
                this.requireCondition(
                    /^\s*$/.test(source) && parent?.name === name,
                    `${relative} is not well-formed XML`,
                );
                this.assertXmlNameBound(relative, name, parent.namespaces);
                stack.pop();
            } else {
                const selfClosing = /\/\s*$/.test(source);
                const attributes = selfClosing ? source.replace(/\/\s*$/, '') : source;
                const parsedAttributes = this.validateXmlAttributes(relative, attributes);
                const namespaces: Map<string, string> = new Map(
                    stack.at(-1)?.namespaces ?? [['xml', 'http://www.w3.org/XML/1998/namespace']],
                );
                for (const [attribute, value] of parsedAttributes) {
                    if (attribute === 'xmlns') namespaces.set('', value);
                    if (attribute.startsWith('xmlns:'))
                        namespaces.set(attribute.slice('xmlns:'.length), value);
                }
                this.assertXmlNameBound(relative, name, namespaces);
                for (const attribute of parsedAttributes.keys()) {
                    if (attribute !== 'xmlns' && !attribute.startsWith('xmlns:'))
                        this.assertXmlNameBound(relative, attribute, namespaces);
                }
                if (stack.length === 0) {
                    this.requireCondition(
                        name === 'svg' && rootCount === 0,
                        `${relative} must have one SVG root element`,
                    );
                    rootCount += 1;
                    rootAttributes = parsedAttributes;
                }
                if (
                    !selfClosing &&
                    stack.length === 1 &&
                    stack[0].name === 'svg' &&
                    name === 'title' &&
                    parsedAttributes.get('id') === 'title'
                )
                    titleCount += 1;
                if (!selfClosing) stack.push({ name, namespaces });
            }
            offset = cursor + 1;
        }
        this.requireCondition(
            rootAttributes && stack.length === 0 && rootCount === 1,
            `${relative} is not well-formed XML`,
        );
        return { rootAttributes, titleCount, titleText };
    }

    private assertXmlNameBound(
        relative: string,
        name: string,
        namespaces: ReadonlyMap<string, string>,
    ) {
        const separator = name.indexOf(':');
        this.requireCondition(
            separator === -1 || separator === name.lastIndexOf(':'),
            `${relative} is not well-formed XML`,
        );
        if (separator !== -1)
            this.requireCondition(
                namespaces.has(name.slice(0, separator)),
                `${relative} is not well-formed XML`,
            );
    }

    private validateXmlAttributes(relative: string, source: string) {
        let offset = 0;
        const names = new Set<string>();
        const values = new Map<string, string>();
        while (offset < source.length) {
            const whitespace = /^\s+/.exec(source.slice(offset));
            if (whitespace) offset += whitespace[0].length;
            if (offset === source.length) break;
            const name = /^([A-Za-z_][A-Za-z0-9_.:-]*)/.exec(source.slice(offset));
            this.requireCondition(name, `${relative} is not well-formed XML`);
            this.requireCondition(!names.has(name[1]), `${relative} is not well-formed XML`);
            names.add(name[1]);
            offset += name[1].length;
            const equals = /^\s*=\s*/.exec(source.slice(offset));
            this.requireCondition(equals, `${relative} is not well-formed XML`);
            offset += equals[0].length;
            const quote = source[offset];
            this.requireCondition(
                quote === '"' || quote === "'",
                `${relative} is not well-formed XML`,
            );
            const end = source.indexOf(quote, offset + 1);
            this.requireCondition(end !== -1, `${relative} is not well-formed XML`);
            const value = source.slice(offset + 1, end);
            this.requireCondition(
                /^(?:[^<&]|&(?:amp|apos|gt|lt|quot|#[0-9]+|#x[0-9a-fA-F]+);)*$/.test(value),
                `${relative} is not well-formed XML`,
            );
            this.validateSvgPaintReferences(relative, value);
            values.set(name[1], value);
            offset = end + 1;
        }
        return values;
    }

    private validateSvgPaintReferences(relative: string, value: string) {
        const css = this.stripCssComments(this.decodeXmlEntities(relative, value)).replace(
            /\\([0-9a-fA-F]{1,6}\s?|.)/gu,
            (_match, escaped) => {
                const hex = escaped.trim();
                return /^[0-9a-fA-F]+$/u.test(hex)
                    ? String.fromCodePoint(Number.parseInt(hex, 16))
                    : escaped;
            },
        );
        this.requireCondition(
            !/@import\b/iu.test(css),
            `${relative} contains active or external SVG content`,
        );
        for (const match of css.matchAll(/url\(\s*(?:(['"])(.*?)\1|([^\s)]+))\s*\)/giu)) {
            const target = (match[2] ?? match[3]).trim();
            this.requireCondition(
                target.startsWith('#'),
                `${relative} contains an external SVG paint reference`,
            );
        }
    }

    private decodeXmlEntities(relative: string, value: string) {
        return value.replace(
            /&(amp|apos|gt|lt|quot|#(?:[0-9]+|x[0-9a-fA-F]+));/gu,
            (_match: string, entity: string) => {
                if (entity[0] !== '#')
                    return (
                        { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' } as Record<
                            string,
                            string
                        >
                    )[entity];
                const value = entity.slice(1);
                const hexadecimal = value[0].toLowerCase() === 'x';
                const codePoint = Number.parseInt(
                    hexadecimal ? value.slice(1) : value,
                    hexadecimal ? 16 : 10,
                );
                this.requireCondition(
                    codePoint === 0x9 ||
                        codePoint === 0xa ||
                        codePoint === 0xd ||
                        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
                        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
                        (codePoint >= 0x10000 && codePoint <= 0x10ffff),
                    `${relative} is not well-formed XML`,
                );
                return String.fromCodePoint(codePoint);
            },
        );
    }

    private stripCssComments(value: string) {
        let output = '';
        let quote = '';
        for (let index = 0; index < value.length; index += 1) {
            const character = value[index];
            if (quote) {
                output += character;
                if (character === quote) quote = '';
                continue;
            }
            if (character === '"' || character === "'") {
                quote = character;
                output += character;
                continue;
            }
            if (character === '/' && value[index + 1] === '*') {
                const end = value.indexOf('*/', index + 2);
                if (end === -1) return output;
                index = end + 1;
                continue;
            }
            output += character;
        }
        return output;
    }

    private pngCrc(bytes: Uint8Array) {
        let value = 0xffffffff;
        for (const byte of bytes) value = PNG_CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
        return (value ^ 0xffffffff) >>> 0;
    }

    private unfilterPngRows(decoded: Buffer, ihdr: PngHeader, rowBytes: number, relative: string) {
        const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.colorType];
        const bytesPerPixel = Math.max(1, Math.ceil((channels * ihdr.bitDepth) / 8));
        const rows = [];
        let previous = Buffer.alloc(rowBytes);
        for (let row = 0; row < ihdr.height; row += 1) {
            const offset = row * (rowBytes + 1);
            const filter = decoded[offset];
            this.requireCondition(filter <= 4, `${relative} must be a valid PNG`);
            const source = decoded.subarray(offset + 1, offset + rowBytes + 1);
            const output = Buffer.alloc(rowBytes);
            for (let index = 0; index < rowBytes; index += 1) {
                const left = index >= bytesPerPixel ? output[index - bytesPerPixel] : 0;
                const above = previous[index];
                const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
                const predictor =
                    filter === 0
                        ? 0
                        : filter === 1
                          ? left
                          : filter === 2
                            ? above
                            : filter === 3
                              ? Math.floor((left + above) / 2)
                              : this.paeth(left, above, upperLeft);
                output[index] = (source[index] + predictor) & 0xff;
            }
            rows.push(output);
            previous = output;
        }
        return rows;
    }

    private paeth(left: number, above: number, upperLeft: number) {
        const estimate = left + above - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const aboveDistance = Math.abs(estimate - above);
        const upperLeftDistance = Math.abs(estimate - upperLeft);
        return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
            ? left
            : aboveDistance <= upperLeftDistance
              ? above
              : upperLeft;
    }

    private validPngBitDepth(bitDepth: number, colorType: number): colorType is PngColorType {
        return (
            (
                {
                    0: [1, 2, 4, 8, 16],
                    2: [8, 16],
                    3: [1, 2, 4, 8],
                    4: [8, 16],
                    6: [8, 16],
                } as Record<number, number[]>
            )[colorType] ?? []
        ).includes(bitDepth);
    }

    private publicRepositoryHostname(hostname: string) {
        const host = hostname.replace(/^\[|\]$/gu, '').toLowerCase();
        if (
            host === 'localhost' ||
            host.endsWith('.localhost') ||
            host === 'local' ||
            host.endsWith('.local')
        )
            return false;
        const parts = host.split('.');
        if (
            parts.length === 4 &&
            parts.every((part) => /^(?:0|[1-9][0-9]{0,2})$/u.test(part) && Number(part) <= 255)
        ) {
            const [first, second] = parts.map(Number);
            return (
                first !== 0 &&
                first !== 10 &&
                first !== 127 &&
                first < 224 &&
                !(first === 100 && second >= 64 && second <= 127) &&
                !(first === 169 && second === 254) &&
                !(first === 172 && second >= 16 && second <= 31) &&
                !(first === 192 && second === 168) &&
                !(first === 198 && (second === 18 || second === 19))
            );
        }
        if (host.includes(':'))
            return (
                host !== '::' &&
                host !== '::1' &&
                !host.startsWith('::ffff:') &&
                !/^f[cd][0-9a-f:]*$/u.test(host) &&
                !/^fe[89ab][0-9a-f:]*$/u.test(host)
            );
        return host.includes('.');
    }
}
