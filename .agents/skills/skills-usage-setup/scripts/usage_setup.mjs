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

function managedSetup({
    action,
    file,
    registration,
    write = false,
    reviewedRegistrationDigest,
    observerDescriptor,
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
            runtime_available: owned.active ? observerRuntimeAvailable(owned) : null,
            legacy_runtime_unbound: Boolean(owned.active && !owned.observer_descriptor),
            observer_descriptor: owned.observer_descriptor ?? null,
            written: false,
        };
    if (action === 'disable' && !owned.active) return { enabled: false, written: false };
    if (action === 'enable') {
        validate(registration, file, provider, true);
        if (!runtimeAvailable(registration))
            throw new Error('Selected runtime file is unavailable.');
        const registrationDigest = hash(canonical({ registration, observer_descriptor: observerDescriptor ?? null }));
        if (write && reviewedRegistrationDigest !== registrationDigest)
            throw new Error('Explicit enablement requires the exact reviewed registration digest.');
        if (owned.active) {
            if (!matched || !same(owned.registration, registration) ||
                !same(owned.observer_descriptor ?? null, observerDescriptor ?? null))
                throw new Error('Owned setup changed; reconcile or remove before reconfiguration.');
            return {
                enabled: true,
                written: false,
                preview: !write,
                registration_digest: registrationDigest,
                registration: structuredClone(registration),
                observer_descriptor: observerDescriptor ?? null,
            };
        }
    }
    const selected = action === 'enable' ? registration : owned.registration;
    const result =
        action === 'enable'
            ? provider.merge(settings.value, selected)
            : provider.remove(settings.value, selected);
    if (action === 'enable' && observerDescriptor?.host === 'copilot') {
        if (result.version !== undefined && result.version !== 1)
            throw new Error('Copilot CLI hooks require version 1.');
        result.version = 1;
    }
    const next = {
        schema_version: 1,
        owner: 'skills-usage-setup',
        settings: file,
        provider: provider.id,
        active: action === 'enable',
        registration: selected,
        registration_digest: hash(canonical(selected)),
        ...(observerDescriptor ? { observer_descriptor: observerDescriptor } : owned.observer_descriptor ? { observer_descriptor: owned.observer_descriptor } : {}),
    };
    if (write)
        locked(file + '.skills-usage.lock', () => {
            if (action === 'enable' && observerDescriptor) validateObserver(observerDescriptor, file);
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
        registration_digest: hash(canonical({ registration: selected, observer_descriptor: next.observer_descriptor ?? null })),
        observer_descriptor: next.observer_descriptor ?? null,
        registration: structuredClone(selected),
        settings: file,
        ownership_receipt: file + '.skills-usage.json',
        effects:
            'Changes selected event registrations only. A native host can execute their commands automatically with user authority; the helper derives closed metadata-observer commands but does not grant host trust or authenticate consent.',
    };
}

/** Build one deliberately selected metadata observer; no caller command text or argument array. */
export function createObserverDescriptor({ host, script, collections, store }) {
    const executable = fs.realpathSync(process.execPath);
    const descriptor = {
        schema_version: 1, kind: 'skill-metadata-observer', host,
        runtime: {
            executable, executable_sha256: runtimeIdentity(executable, false),
            script, script_sha256: runtimeIdentity(script, true),
        },
        collections, store,
    };
    validateObserver(descriptor);
    return descriptor;
}

function runtimeIdentity(file, script) {
    const state = read(file, script ? MAX_FILE : 160 * 1024 * 1024);
    if (!state.bytes) throw new Error('Selected observer runtime is unavailable.');
    if (state.mode & (script ? 0o222 : 0o022))
        throw new Error('Retain a read-only observer script and a non-shared-writable Node executable.');
    fs.accessSync(file, script ? fs.constants.R_OK : fs.constants.X_OK);
    return hash(state.bytes);
}

function closed(value, fields) {
    return object(value) && Object.keys(value).length === fields.length &&
        Object.keys(value).every((key) => fields.includes(key));
}

function validateObserver(descriptor, settings) {
    if (!closed(descriptor, ['schema_version', 'kind', 'host', 'runtime', 'collections', 'store']) ||
        descriptor.schema_version !== 1 || descriptor.kind !== 'skill-metadata-observer' ||
        !['claude', 'gemini', 'copilot'].includes(descriptor.host) ||
        !closed(descriptor.runtime, ['executable', 'executable_sha256', 'script', 'script_sha256']))
        throw new Error('Select a supported closed metadata-observer descriptor.');
    const runtime = descriptor.runtime;
    if (runtime.executable !== fs.realpathSync(process.execPath))
        throw new Error('Only this running Node executable may launch the observer.');
    for (const field of ['executable_sha256', 'script_sha256'])
        if (typeof runtime[field] !== 'string' || !/^[a-f0-9]{64}$/u.test(runtime[field]))
            throw new Error('Observer runtime requires reviewed SHA-256 identities.');
    if (runtimeIdentity(runtime.executable, false) !== runtime.executable_sha256 ||
        runtimeIdentity(runtime.script, true) !== runtime.script_sha256)
        throw new Error('Observer runtime changed; retain and review its exact bytes again.');
    if (runtime.script_sha256 !== hash(read(fileURLToPath(import.meta.url)).bytes))
        throw new Error('Select the retained bundled metadata observer, not an unrelated script.');
    if (!object(descriptor.collections) || !Object.keys(descriptor.collections).length ||
        Object.keys(descriptor.collections).length > 16)
        throw new Error('Select one to sixteen skill collections explicitly.');
    safePath(descriptor.store);
    for (const [label, root] of Object.entries(descriptor.collections)) {
        if (!slug.test(label)) throw new Error('Collection labels must be safe slugs.');
        safePath(root, true);
        if (inside(root, descriptor.store) || (settings && inside(root, settings)))
            throw new Error('Settings and observations must stay outside skill-discovery roots.');
    }
    const paths = [runtime.executable, runtime.script, descriptor.store];
    if (settings) paths.push(settings, settings + '.skills-usage.json', settings + '.skills-usage.lock');
    if (new Set(paths).size !== paths.length)
        throw new Error('Select distinct runtime, settings, receipt and evidence paths.');
    if (inside(packageRoot, descriptor.store) || (settings && inside(packageRoot, settings)))
        throw new Error('Keep state outside the installed package.');
    const retainedRoot = dirname(dirname(runtime.script));
    if (inside(retainedRoot, descriptor.store) || (settings && inside(retainedRoot, settings)))
        throw new Error('Keep state outside the retained observer package.');
}

function observerRuntimeAvailable(owned) {
    if (!owned.observer_descriptor) return false;
    try {
        validateObserver(owned.observer_descriptor, owned.settings);
        return true;
    } catch {
        return false;
    }
}

function observerRegistration(descriptor, file) {
    validateObserver(descriptor, file);
    const quote = (value) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
    const command = [descriptor.runtime.executable, descriptor.runtime.script, 'observe-host', '--file', file]
        .map(quote).join(' ');
    const handler = { type: 'command', command, timeout: descriptor.host === 'gemini' ? 10000 : 10 };
    const events = descriptor.host === 'copilot'
        ? Object.fromEntries(['preToolUse', 'postToolUse'].map((event) => [event,
            [{ type: 'command', bash: command + ' --event ' + event, timeoutSec: 10 }]]))
        : Object.fromEntries((descriptor.host === 'gemini' ? ['BeforeTool', 'AfterTool'] : ['PreToolUse', 'PostToolUse'])
            .map((event) => [event, [{ matcher: descriptor.host === 'gemini' ? '^read_file$' : '^Read$', hooks: [handler] }]]));
    return {
        provider: 'json-array-map', hook_path: ['hooks'], events,
        runtime_files: [descriptor.runtime.executable, descriptor.runtime.script],
        collections: descriptor.collections, store: descriptor.store,
    };
}

export function setup(input) {
    if (input.action !== 'enable') return managedSetup(input);
    if (input.registration?.kind !== 'skill-metadata-observer') {
        if (input.write) throw new Error('Generic command registrations are manual-only; use a closed observer descriptor.');
        return { ...managedSetup(input), manual_only: true,
            effects: 'Manual configuration reference only; no automatic registration write is supported.' };
    }
    if (input.provider && input.provider !== jsonArrayMapProvider)
        throw new Error('Closed observers use only the verified bundled host adapters.');
    return managedSetup({ ...input,
        registration: observerRegistration(input.registration, input.file),
        observerDescriptor: structuredClone(input.registration),
    });
}

/** Map supported native entrypoint reads to metadata; never retain raw input or read bodies. */
export function observeHost({ file, value, event }) {
    const owned = json(file + '.skills-usage.json').value;
    if (!owned.active || owned.owner !== 'skills-usage-setup' || owned.settings !== file ||
        !owned.observer_descriptor || !observerRuntimeAvailable(owned))
        return { recorded: false, coverage_gap: 'observer-unavailable' };
    const descriptor = owned.observer_descriptor;
    if (!object(value)) return { recorded: false, coverage_gap: 'unsupported-payload' };
    const host = descriptor.host;
    const name = host === 'copilot' ? event : value.hook_event_name;
    const session = host === 'copilot' ? value.sessionId : value.session_id;
    if (typeof session !== 'string' || !session || session.length > 256 || /[\x00-\x1f\x7f]/u.test(session))
        return { recorded: false, coverage_gap: 'session-unavailable' };
    let filename;
    let kind;
    if (host === 'claude') {
        if (value.tool_name !== 'Read' || !['PreToolUse', 'PostToolUse'].includes(name) ||
            !object(value.tool_input)) return { recorded: false, coverage_gap: 'unsupported-tool' };
        if (name === 'PostToolUse' && (!Object.hasOwn(value, 'tool_response') || value.tool_response?.is_error === true))
            return { recorded: false, coverage_gap: 'success-unavailable' };
        filename = value.tool_input.file_path;
        kind = name === 'PreToolUse' ? 'read_attempt' : 'read_confirmed';
    }
    if (host === 'gemini') {
        if (value.tool_name !== 'read_file' || !['BeforeTool', 'AfterTool'].includes(name) ||
            !object(value.tool_input)) return { recorded: false, coverage_gap: 'unsupported-tool' };
        if (name === 'AfterTool' && (!object(value.tool_response) || value.tool_response.error !== undefined ||
            value.tool_response.llmContent === undefined || value.tool_response.llmContent === null))
            return { recorded: false, coverage_gap: 'success-unavailable' };
        filename = value.tool_input.file_path;
        if (typeof filename === 'string' && !isAbsolute(filename) && typeof value.cwd === 'string' && isAbsolute(value.cwd))
            filename = resolve(value.cwd, filename);
        kind = name === 'BeforeTool' ? 'read_attempt' : 'read_confirmed';
    }
    if (host === 'copilot') {
        if (value.toolName !== 'view' || !['preToolUse', 'postToolUse'].includes(name))
            return { recorded: false, coverage_gap: 'unsupported-tool' };
        const args = typeof value.toolArgs === 'string' ? JSON.parse(value.toolArgs) : value.toolArgs;
        if (!object(args)) return { recorded: false, coverage_gap: 'unsupported-tool' };
        if (name === 'postToolUse' && (!object(value.toolResult) || value.toolResult.resultType !== 'success' ||
            typeof value.toolResult.textResultForLlm !== 'string'))
            return { recorded: false, coverage_gap: 'success-unavailable' };
        filename = args.path;
        if (typeof filename === 'string' && !isAbsolute(filename) && typeof value.cwd === 'string' && isAbsolute(value.cwd))
            filename = resolve(value.cwd, filename);
        kind = name === 'preToolUse' ? 'read_attempt' : 'read_confirmed';
    }
    if (typeof filename !== 'string' || !isAbsolute(filename) || basename(filename) !== 'SKILL.md')
        return { recorded: false, coverage_gap: 'outside-selection' };
    safePath(filename);
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.nlink !== 1) return { recorded: false, coverage_gap: 'unsafe-entrypoint' };
    const selected = Object.entries(descriptor.collections).filter(([, root]) => dirname(dirname(filename)) === root);
    const skill = basename(dirname(filename));
    if (selected.length !== 1 || !slug.test(skill)) return { recorded: false, coverage_gap: 'outside-selection' };
    return record({ store: descriptor.store, write: true, value: {
        collection: selected[0][0], skill, kind,
        session_key: hash(host + ':' + session), observed_at: new Date().toISOString(),
    } });
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
            usage: 'node usage_setup.mjs enable|status|disable --file ABSOLUTE [--registration ABSOLUTE] [--write --reviewed-registration SHA256]; observe --store ABSOLUTE [--write] < metadata.json',
            effects:
                'Preview by default; status never writes. No runtime installation or hook execution.',
        };
    const [action, ...options] = args;
    const input = { action, write: false };
    for (let index = 0; index < options.length; index += 1) {
        const key = options[index];
        if (key === '--write' && !input.write) input.write = true;
        else if (
            ['--file', '--registration', '--store', '--reviewed-registration', '--event'].includes(key) &&
            !input[key.slice(2)] &&
            options[index + 1]
        )
            input[key.slice(2)] = options[++index];
        else throw new Error('Unsupported or duplicated option.');
    }
    if (action === 'observe' || action === 'observe-host') {
        if ((action === 'observe' && (input.file || input.event)) ||
            (action === 'observe-host' && (input.store || input.write)) ||
            input.registration || input['reviewed-registration'])
            throw new Error('Unsupported observation option.');
        let bytes = 0;
        const chunks = [];
        for await (const chunk of process.stdin) {
            bytes += chunk.length;
            if (bytes > 16 * 1024) throw new Error('Observation input exceeds 16 KiB.');
            chunks.push(chunk);
        }
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (action === 'observe-host') return observeHost({ ...input, value });
        return record({ ...input, value });
    }
    if (
        input.event || input.store ||
        (action !== 'enable' && input.registration) ||
        (input['reviewed-registration'] && (action !== 'enable' || !input.write)) ||
        (action === 'status' && input.write)
    )
        throw new Error('Unsupported option for the selected operation.');
    if (input.registration) input.registration = json(input.registration).value;
    input.reviewedRegistrationDigest = input['reviewed-registration'];
    return setup(input);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const result = await main();
        // Native hooks receive neutral output; inspect the selected local sink for evidence.
        console.log(JSON.stringify(process.argv[2] === 'observe-host' ? {} : result));
    } catch {
        console.error(
            'Operation failed; inspect selected paths, metadata, ownership and runtime without exposing settings content.',
        );
        if (!['observe', 'observe-host'].includes(process.argv[2])) process.exitCode = 1;
    }
}
