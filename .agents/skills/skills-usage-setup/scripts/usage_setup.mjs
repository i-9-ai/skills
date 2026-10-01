// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const MAX_FILE = 128 * 1024;
const MAX_STORE = 4 * 1024 * 1024;
const noFollow = fs.constants.O_NOFOLLOW;
const nonBlock = fs.constants.O_NONBLOCK;
const reserved = new Set(['__proto__', 'constructor', 'prototype']);
const slug = /^[a-z][a-z0-9-]{0,63}$/u;
const object = (value) => value && !Array.isArray(value) && typeof value === 'object';
const inside = (root, file) => root === file || file.startsWith(root + sep);
const canonical = (value) =>
    JSON.stringify(value, (_, item) =>
        object(item)
            ? Object.fromEntries(
                  Object.keys(item)
                      .sort()
                      .map((key) => [key, item[key]]),
              )
            : item,
    );
const hash = (value) => createHash('sha256').update(value).digest('hex');
const same = (left, right) => canonical(left) === canonical(right);

function normalized(file) {
    if (
        typeof file !== 'string' ||
        !isAbsolute(file) ||
        resolve(file) !== file ||
        /[\r\n\0]/u.test(file)
    )
        throw new Error('Select a normalized absolute path.');
    return file;
}

export function safePath(file, directory = false) {
    normalized(file);
    for (let parent = directory ? file : dirname(file); ; parent = dirname(parent)) {
        const stat = fs.lstatSync(parent);
        if (!stat.isDirectory() || stat.isSymbolicLink())
            throw new Error('Select existing unlinked parent directories.');
        if (dirname(parent) === parent) break;
    }
    return file;
}

function identity(stat) {
    return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.mode, stat.nlink].join(':');
}

export function read(file, maximum = MAX_FILE) {
    safePath(file);
    if (!Number.isInteger(noFollow) || !Number.isInteger(nonBlock))
        throw new Error('This platform lacks the required nonblocking no-follow file open.');
    let inspected;
    try {
        inspected = fs.lstatSync(file);
    } catch (error) {
        if (error.code === 'ENOENT') return { file, bytes: null, identity: null, mode: 0o600 };
        throw new Error('Selected file could not be safely inspected.');
    }
    if (!inspected.isFile() || inspected.nlink !== 1 || inspected.size > maximum)
        throw new Error('Select a bounded regular file without links.');
    let fd;
    try {
        fd = fs.openSync(file, fs.constants.O_RDONLY | noFollow | nonBlock);
    } catch (error) {
        if (error.code === 'ENOENT') return { file, bytes: null, identity: null, mode: 0o600 };
        throw new Error('Selected file could not be safely opened.');
    }
    try {
        const before = fs.fstatSync(fd);
        if (
            !before.isFile() ||
            before.nlink !== 1 ||
            before.size > maximum ||
            identity(inspected) !== identity(before)
        )
            throw new Error('Select a bounded regular file without links.');
        const bytes = fs.readFileSync(fd);
        if (bytes.length > maximum || identity(before) !== identity(fs.fstatSync(fd)))
            throw new Error('Selected file changed during inspection.');
        return {
            file,
            bytes,
            identity: identity(before),
            mode: before.mode & 0o777,
        };
    } finally {
        fs.closeSync(fd);
    }
}

function json(file) {
    const state = read(file);
    try {
        const value = state.bytes ? JSON.parse(state.bytes.toString('utf8')) : {};
        if (!object(value)) throw new Error();
        return { ...state, value };
    } catch {
        throw new Error('Selected JSON must contain a valid object.');
    }
}

function unchanged(state) {
    const now = read(state.file);
    if (
        now.identity !== state.identity ||
        (state.bytes === null ? now.bytes !== null : !now.bytes?.equals(state.bytes))
    )
        throw new Error('Selected file changed; inspect again before writing.');
}

function replace(state, bytes) {
    if (bytes.length > MAX_FILE) throw new Error('Generated settings exceed the file bound.');
    const temporary = join(
        dirname(state.file),
        '.' + basename(state.file) + '.' + randomUUID() + '.tmp',
    );
    try {
        fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: state.mode });
        unchanged(state);
        fs.renameSync(temporary, state.file);
        return read(state.file);
    } finally {
        fs.rmSync(temporary, { force: true });
    }
}

function encode(value) {
    return Buffer.from(JSON.stringify(value, null, 2) + '\n');
}

function locked(file, operation) {
    safePath(file);
    let fd;
    try {
        fd = fs.openSync(file, 'wx', 0o600);
    } catch {
        throw new Error('Local writer lock is occupied; inspect it without automatic deletion.');
    }
    const marker = randomUUID();
    try {
        fs.writeFileSync(fd, marker);
        return operation();
    } finally {
        fs.closeSync(fd);
        if (read(file).bytes?.toString('utf8') === marker) fs.unlinkSync(file);
    }
}

export const jsonArrayMapProvider = {
    id: 'json-array-map',
    map(value, path, create = false) {
        let current = value;
        for (const key of path) {
            if (!Object.hasOwn(current, key)) {
                if (!create) return null;
                current[key] = {};
            }
            current = current[key];
            if (!object(current)) throw new Error('The selected hook container must be an object.');
        }
        return current;
    },
    inspect(value, registration) {
        const map = this.map(value, registration.hook_path);
        return Object.entries(registration.events).every(
            ([event, entries]) =>
                Array.isArray(map?.[event]) &&
                entries.every(
                    (entry) =>
                        map[event].filter((candidate) => same(candidate, entry)).length === 1,
                ),
        );
    },
    merge(value, registration) {
        const result = structuredClone(value);
        const map = this.map(result, registration.hook_path, true);
        for (const [event, entries] of Object.entries(registration.events)) {
            if (map[event] !== undefined && !Array.isArray(map[event]))
                throw new Error('Existing hook entries must be arrays.');
            map[event] ??= [];
            for (const entry of entries) {
                if (map[event].some((candidate) => same(candidate, entry)))
                    throw new Error('A matching unowned hook exists; reconcile before setup.');
                map[event].push(structuredClone(entry));
            }
        }
        return result;
    },
    remove(value, registration) {
        if (!this.inspect(value, registration))
            throw new Error(
                'Owned hooks changed or duplicated; manual reconciliation is required.',
            );
        const result = structuredClone(value);
        const map = this.map(result, registration.hook_path);
        for (const [event, entries] of Object.entries(registration.events)) {
            map[event] = map[event].filter(
                (candidate) => !entries.some((entry) => same(candidate, entry)),
            );
            if (!map[event].length) delete map[event];
        }
        return result;
    },
};

function validate(registration, file, provider, requirePaths = false) {
    const fields = ['provider', 'hook_path', 'events', 'runtime_files', 'collections', 'store'];
    if (
        !object(registration) ||
        Object.keys(registration).length !== fields.length ||
        Object.keys(registration).some((key) => !fields.includes(key)) ||
        registration.provider !== provider.id
    )
        throw new Error('Registration does not match the selected provider schema.');
    if (
        !Array.isArray(registration.hook_path) ||
        !registration.hook_path.length ||
        registration.hook_path.length > 4 ||
        registration.hook_path.some(
            (key) => typeof key !== 'string' || !slug.test(key) || reserved.has(key),
        )
    )
        throw new Error('Select a bounded safe hook-container path.');
    if (
        !object(registration.events) ||
        !Object.keys(registration.events).length ||
        Object.keys(registration.events).length > 8
    )
        throw new Error('Select one to eight explicit events.');
    for (const [event, entries] of Object.entries(registration.events)) {
        if (
            !/^[A-Za-z][A-Za-z0-9-]{0,63}$/u.test(event) ||
            reserved.has(event) ||
            !Array.isArray(entries) ||
            !entries.length ||
            entries.length > 16 ||
            entries.some((entry) => !object(entry)) ||
            new Set(entries.map(canonical)).size !== entries.length
        )
            throw new Error('Invalid or duplicate registration entries.');
    }
    if (
        !Array.isArray(registration.runtime_files) ||
        !registration.runtime_files.length ||
        registration.runtime_files.length > 8
    )
        throw new Error('Select existing runtime files explicitly.');
    for (const runtime of registration.runtime_files)
        (requirePaths ? safePath : normalized)(runtime);
    if (
        !object(registration.collections) ||
        !Object.keys(registration.collections).length ||
        Object.keys(registration.collections).length > 16
    )
        throw new Error('Select skill collections explicitly.');
    (requirePaths ? safePath : normalized)(registration.store);
    for (const [label, root] of Object.entries(registration.collections)) {
        if (!slug.test(label)) throw new Error('Collection labels must be safe slugs.');
        if (requirePaths) safePath(root, true);
        else normalized(root);
        if (inside(root, file) || inside(root, registration.store))
            throw new Error('Settings and observations must stay outside skill-discovery roots.');
    }
    const statePaths = [
        file,
        file + '.skills-usage.json',
        file + '.skills-usage.lock',
        registration.store,
        registration.store + '.lock',
    ];
    if (
        inside(packageRoot, file) ||
        inside(packageRoot, registration.store) ||
        new Set(statePaths).size !== statePaths.length
    )
        throw new Error(
            'Select distinct caller-owned settings, receipt, locks and evidence outside the installed package.',
        );
}

function runtimeAvailable(registration) {
    return registration.runtime_files.every((file) => {
        try {
            safePath(file);
            const stat = fs.lstatSync(file);
            return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1;
        } catch {
            return false;
        }
    });
}

export function setup({
    action,
    file,
    registration,
    write = false,
    provider = jsonArrayMapProvider,
}) {
    safePath(file);
    if (!['enable', 'status', 'disable'].includes(action))
        throw new Error('Select enable, status or disable.');
    const settings = json(file);
    const receipt = json(file + '.skills-usage.json');
    const owned = receipt.value;
    if (receipt.bytes !== null) {
        if (
            owned.schema_version !== 1 ||
            owned.owner !== 'skills-usage-setup' ||
            owned.settings !== file ||
            owned.provider !== provider.id ||
            typeof owned.active !== 'boolean'
        )
            throw new Error('Ownership receipt does not match this setup.');
        validate(owned.registration, file, provider);
        if (owned.registration_digest !== hash(canonical(owned.registration)))
            throw new Error('Ownership receipt digest changed.');
    }
    const matched = Boolean(owned.active && provider.inspect(settings.value, owned.registration));
    if (action === 'status')
        return {
            enabled: matched,
            registration_changed: Boolean(owned.active && !matched),
            runtime_available: owned.active ? runtimeAvailable(owned.registration) : null,
            written: false,
        };
    if (action === 'disable' && !owned.active) return { enabled: false, written: false };
    if (action === 'enable') {
        validate(registration, file, provider, true);
        if (!runtimeAvailable(registration))
            throw new Error('Selected runtime file is unavailable.');
        if (owned.active) {
            if (!matched || !same(owned.registration, registration))
                throw new Error('Owned setup changed; reconcile or remove before reconfiguration.');
            return { enabled: true, written: false };
        }
    }
    const selected = action === 'enable' ? registration : owned.registration;
    const result =
        action === 'enable'
            ? provider.merge(settings.value, selected)
            : provider.remove(settings.value, selected);
    const next = {
        schema_version: 1,
        owner: 'skills-usage-setup',
        settings: file,
        provider: provider.id,
        active: action === 'enable',
        registration: selected,
        registration_digest: hash(canonical(selected)),
    };
    if (write)
        locked(file + '.skills-usage.lock', () => {
            const written = replace(settings, encode(result));
            try {
                replace(receipt, encode(next));
            } catch (error) {
                unchanged(written);
                if (settings.bytes === null) fs.unlinkSync(file);
                else replace(written, settings.bytes);
                throw error;
            }
        });
    return {
        enabled: action === 'enable' ? write : !write,
        written: write,
        preview: !write,
        entries: Object.values(selected.events).reduce((sum, entries) => sum + entries.length, 0),
        evidence_retained: true,
    };
}

export function record({ store, value, write = false }) {
    safePath(store);
    if (inside(packageRoot, store))
        throw new Error('Store observations outside the installed package.');
    const fields = ['collection', 'skill', 'kind', 'session_key', 'observed_at'];
    if (
        !object(value) ||
        Object.keys(value).length !== fields.length ||
        Object.keys(value).some((key) => !fields.includes(key))
    )
        throw new Error('Observation requires only the five documented metadata fields.');
    if (
        ![value.collection, value.skill].every(
            (item) => typeof item === 'string' && slug.test(item),
        ) ||
        !['read_attempt', 'read_confirmed'].includes(value.kind) ||
        typeof value.session_key !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(value.session_key)
    )
        throw new Error('Invalid observation identity or read kind.');
    if (
        typeof value.observed_at !== 'string' ||
        !Number.isFinite(Date.parse(value.observed_at)) ||
        new Date(value.observed_at).toISOString() !== value.observed_at
    )
        throw new Error('Use a canonical UTC timestamp.');
    const event = { schema_version: 1, event_id: randomUUID(), ...value };
    if (!write) return { recorded: false, preview: true, event };
    return locked(store + '.lock', () => {
        const current = read(store, MAX_STORE);
        const separator = current.bytes?.length && current.bytes.at(-1) !== 0x0a ? '\n' : '';
        const bytes = Buffer.from(separator + JSON.stringify(event) + '\n');
        if ((current.bytes?.length ?? 0) + bytes.length > MAX_STORE)
            throw new Error(
                'Observation store is full; retain it and choose a new explicit store.',
            );
        const fd = fs.openSync(
            store,
            fs.constants.O_APPEND |
                fs.constants.O_CREAT |
                fs.constants.O_WRONLY |
                noFollow |
                nonBlock,
            0o600,
        );
        try {
            const stat = fs.fstatSync(fd);
            if (
                !stat.isFile() ||
                stat.nlink !== 1 ||
                stat.size !== (current.bytes?.length ?? 0) ||
                (current.identity && identity(stat) !== current.identity)
            )
                throw new Error('Observation storage changed during append.');
            const written = fs.writeSync(fd, bytes);
            if (written !== bytes.length) {
                if (fs.fstatSync(fd).size === stat.size + written) fs.ftruncateSync(fd, stat.size);
                throw new Error('Observation append was incomplete.');
            }
        } finally {
            fs.closeSync(fd);
        }
        return { recorded: true, event_id: event.event_id };
    });
}

export async function main(args = process.argv.slice(2)) {
    if (!args.length || args.includes('--help'))
        return {
            usage: 'node usage_setup.mjs enable|status|disable --file ABSOLUTE [--registration ABSOLUTE] [--write]; observe --store ABSOLUTE [--write] < metadata.json',
            effects:
                'Preview by default; status never writes. No runtime installation or hook execution.',
        };
    const [action, ...options] = args;
    const input = { action, write: false };
    for (let index = 0; index < options.length; index += 1) {
        const key = options[index];
        if (key === '--write' && !input.write) input.write = true;
        else if (
            ['--file', '--registration', '--store'].includes(key) &&
            !input[key.slice(2)] &&
            options[index + 1]
        )
            input[key.slice(2)] = options[++index];
        else throw new Error('Unsupported or duplicated option.');
    }
    if (action === 'observe') {
        if (input.file || input.registration) throw new Error('Unsupported observation option.');
        let bytes = 0;
        const chunks = [];
        for await (const chunk of process.stdin) {
            bytes += chunk.length;
            if (bytes > 16 * 1024) throw new Error('Observation input exceeds 16 KiB.');
            chunks.push(chunk);
        }
        return record({
            ...input,
            value: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        });
    }
    if (
        input.store ||
        (action !== 'enable' && input.registration) ||
        (action === 'status' && input.write)
    )
        throw new Error('Unsupported option for the selected operation.');
    if (input.registration) input.registration = json(input.registration).value;
    return setup(input);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        console.log(JSON.stringify(await main()));
    } catch {
        console.error(
            'Operation failed; inspect selected paths, metadata, ownership and runtime without exposing settings content.',
        );
        if (process.argv[2] !== 'observe') process.exitCode = 1;
    }
}
