#!/usr/bin/env node
/** Install reviewed Git package bytes; never execute package setup or fetch a source. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const MAX_FILES = 4096;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const encode = value => `${JSON.stringify(value, null, 2)}\n`;

function parseJson(text) {
    try { return JSON.parse(text); }
    catch { throw new Error('Expected a valid JSON document; input contents were suppressed'); }
}

function requireValue(condition, message) {
    if (!condition) throw new Error(message);
}

function exists(filename) {
    try { fs.lstatSync(filename); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function directory(filename) {
    requireValue(fs.lstatSync(filename).isDirectory(), 'Select an existing real directory, not a link');
    return fs.realpathSync(filename);
}

function contained(root, target) {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function overlaps(left, right) {
    return contained(left, right) || contained(right, left);
}

function relativePath(value) {
    requireValue(typeof value === 'string' && value.length > 0 && value.length <= 1024, 'Invalid package-relative path');
    requireValue(!/[\\\x00-\x1f\x7f:*?"<>|]/.test(value), 'Unsupported package-relative path');
    const parts = value.split('/');
    requireValue(parts.length <= 32 && parts.every(part => part && part !== '.' && part !== '..'
        && !/[. ]$/.test(part) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)), 'Unsafe package-relative path');
    requireValue(value.normalize('NFC') === value, 'Use normalized package-relative paths');
    return value;
}

function packageName(value) {
    requireValue(typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64, 'Invalid package name');
    return value;
}

function readFile(filename, maximum = MAX_FILE_BYTES) {
    requireValue(fs.lstatSync(filename).isFile(), 'Expected one bounded regular file');
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
        const before = fs.fstatSync(fd);
        requireValue(before.isFile() && before.nlink === 1 && before.size <= maximum, 'Expected one bounded regular file');
        const bytes = Buffer.alloc(before.size);
        let offset = 0;
        while (offset < bytes.length) {
            const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
            requireValue(count > 0, 'File changed while being read');
            offset += count;
        }
        const after = fs.fstatSync(fd);
        requireValue(before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, 'File changed while being read');
        return bytes;
    } finally { fs.closeSync(fd); }
}

function treeDigest(root) {
    const records = [];
    let total = 0;
    const seen = new Set();
    function visit(current, relative = '') {
        const stat = fs.lstatSync(current);
        requireValue(stat.isDirectory() && !stat.isSymbolicLink(), 'Package directories must be real directories');
        records.push({ path: relative, type: 'directory', mode: stat.mode & 0o777 });
        const handle = fs.opendirSync(current);
        try {
            for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
                requireValue(seen.size < MAX_FILES, 'Package exceeds the entry limit');
                const name = relativePath(relative ? `${relative}/${entry.name}` : entry.name);
                requireValue(!seen.has(name.toLowerCase()), 'Package has a portable path collision');
                seen.add(name.toLowerCase());
                const filename = path.join(current, entry.name);
                const info = fs.lstatSync(filename);
                if (info.isDirectory()) { visit(filename, name); continue; }
                requireValue(info.isFile() && !info.isSymbolicLink(), 'Links and special files are not supported');
                const bytes = readFile(filename);
                total += bytes.length;
                requireValue(total <= MAX_TOTAL_BYTES, 'Package exceeds the byte limit');
                records.push({ path: name, type: 'file', mode: info.mode & 0o777, size: bytes.length, sha256: sha256(bytes) });
            }
        } finally { handle.closeSync(); }
    }
    visit(root);
    records.sort((a, b) => Buffer.from(a.path).compare(Buffer.from(b.path)));
    return { sha256: sha256(Buffer.from(JSON.stringify(records))), entries: records.length, bytes: total };
}

function run(executable, args, maximum = MAX_OUTPUT_BYTES) {
    try {
        return execFileSync(executable, args, {
            encoding: null, timeout: 30_000, maxBuffer: maximum, stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0' },
        });
    } catch {
        // Source/tool output can contain private paths, credentials, or candidate text.
        throw new Error('A required tool failed, timed out, or exceeded its output limit; destination was not accepted');
    }
}

function sourceTree(options) {
    const repository = directory(options.repository);
    const revision = options.revision;
    requireValue(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision), 'Use a full immutable Git commit ID');
    const packagePath = options.package === '.' ? '.' : relativePath(options.package);
    const git = (...args) => run('git', ['--no-replace-objects', '--literal-pathspecs', '-C', repository, ...args],
        args[0] === 'cat-file' && args[1] === 'blob' ? MAX_FILE_BYTES : MAX_OUTPUT_BYTES);
    requireValue(fs.realpathSync(git('rev-parse', '--show-toplevel').toString('utf8').trim()) === repository,
        'Select the root of a non-bare Git repository');
    requireValue(git('rev-parse', '--verify', `${revision}^{commit}`).toString('utf8').trim() === revision, 'Revision must identify a commit directly');
    const tree = packagePath === '.' ? `${revision}^{tree}` : `${revision}:${packagePath}`;
    requireValue(git('cat-file', '-t', tree).toString('utf8').trim() === 'tree', 'Selected package must be a committed directory');
    const listing = git('ls-tree', '-r', '-z', tree);
    requireValue(Buffer.from(listing.toString('utf8')).equals(listing), 'Source paths must be valid UTF-8');
    const rows = listing.toString('utf8').split('\0').filter(Boolean);
    requireValue(rows.length > 0 && rows.length <= MAX_FILES, 'Source package is empty or exceeds the entry limit');
    const files = rows.map(row => {
        const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t(.+)$/.exec(row);
        requireValue(match, 'Git links, submodules, and special files are not supported');
        return { mode: match[1] === '100755' ? 0o755 : 0o644, object: match[2], path: relativePath(match[3]) };
    });
    const portablePaths = new Map();
    for (const file of files) {
        const parts = file.path.split('/');
        for (let index = 1; index <= parts.length; index++) {
            const prefix = parts.slice(0, index).join('/');
            const existing = portablePaths.get(prefix.toLowerCase());
            requireValue(!existing || existing === prefix, 'Source has a portable path collision');
            portablePaths.set(prefix.toLowerCase(), prefix);
        }
    }
    return { repository, revision, package: packagePath, files, git };
}

function assertPublicMaterial(filename, bytes) {
    requireValue(!filename.split('/').some(part => /^(?:\.git|\.ssh|\.env(?:\..*)?)$/i.test(part)), 'Private or repository metadata is not an installable package resource');
    const text = bytes.toString('utf8');
    requireValue(!/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/.test(text)
        && !/https?:\/\/[^\s/@]+:[^\s/@]+@/i.test(text)
        && !/\bgh[pousr]_[A-Za-z0-9]{30,}\b/.test(text), 'Package contains a high-confidence credential signature');
}

function stageSource(source, candidate) {
    fs.mkdirSync(candidate, { recursive: true, mode: 0o755 });
    fs.chmodSync(candidate, 0o755);
    const seen = new Set();
    let total = 0;
    for (const file of source.files) {
        requireValue(!seen.has(file.path.toLowerCase()), 'Source has a portable path collision');
        seen.add(file.path.toLowerCase());
        const size = Number(source.git('cat-file', '-s', file.object).toString('utf8').trim());
        requireValue(Number.isSafeInteger(size) && size >= 0 && size <= MAX_FILE_BYTES, 'Source file exceeds the byte limit');
        total += size;
        requireValue(total <= MAX_TOTAL_BYTES, 'Source package exceeds the byte limit');
        const bytes = source.git('cat-file', 'blob', file.object);
        requireValue(bytes.length === size, 'Git object size changed');
        assertPublicMaterial(file.path, bytes);
        const filename = path.join(candidate, file.path);
        fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o755 });
        let directoryPath = path.dirname(filename);
        while (directoryPath !== candidate) {
            fs.chmodSync(directoryPath, 0o755);
            directoryPath = path.dirname(directoryPath);
        }
        fs.writeFileSync(filename, bytes, { flag: 'wx', mode: file.mode });
        fs.chmodSync(filename, file.mode);
    }
    requireValue(exists(path.join(candidate, 'SKILL.md')) && exists(path.join(candidate, 'LICENSE')), 'Package requires SKILL.md and LICENSE');
    requireValue(readFile(path.join(candidate, 'LICENSE')).length > 0, 'Package license must not be empty');
}

function validateCandidate(candidate, options) {
    requireValue(path.isAbsolute(options.validator), 'Select an absolute path to the approved official validator');
    const executable = fs.realpathSync(options.validator);
    const executableDigest = sha256(readFile(executable));
    requireValue(/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(options['validator-version']), 'Specify the approved validator version');
    const version = run(executable, ['--version']).toString('utf8').trim();
    requireValue(version === `skills-ref, version ${options['validator-version']}`, 'Official validator version does not match the approved version');
    const before = treeDigest(candidate);
    run(executable, ['validate', candidate]);
    const properties = parseJson(run(executable, ['read-properties', candidate]).toString('utf8'));
    requireValue(properties.name === options.name, 'Validated package name does not match the approved name');
    requireValue(properties.license === options.license, 'Validated license does not match the approved license');
    const setup = properties.metadata?.setup ?? null;
    if (setup !== null) {
        relativePath(setup);
        requireValue(setup.startsWith('scripts/') && fs.lstatSync(path.join(candidate, setup)).isFile(), 'Declared setup must name an existing package script');
    }
    requireValue(treeDigest(candidate).sha256 === before.sha256, 'Candidate changed during validation');
    return { content: before, setup: { entrypoint: setup, status: 'not-run' }, validation: {
        tool: 'skills-ref', version: options['validator-version'], executable_sha256: executableDigest,
        commands: ['validate', 'read-properties'], content_sha256: before.sha256,
    } };
}

function selectedDestination(value) {
    const absolute = path.resolve(value);
    const name = packageName(path.basename(absolute));
    const parent = directory(path.dirname(absolute));
    return { name, parent, destination: path.join(parent, name) };
}

function withLock(selection, operation) {
    const lock = path.join(selection.parent, `.skill-install-${selection.name}.lock`);
    fs.mkdirSync(lock, { mode: 0o700 });
    try { return operation(); }
    finally { fs.rmdirSync(lock); }
}

function assertNoAlias(selection) {
    const handle = fs.opendirSync(selection.parent);
    let count = 0;
    try {
        for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
            requireValue(++count <= MAX_FILES, 'Destination collection exceeds the entry limit');
            requireValue(entry.name.toLowerCase() !== selection.name || entry.name === selection.name, 'Destination has a case-insensitive name collision');
        }
    } finally { handle.closeSync(); }
    if (exists(selection.destination)) directory(selection.destination);
}

function saveReceipt(filename, record, replace = false) {
    if (!replace) { fs.writeFileSync(filename, encode(record), { flag: 'wx', mode: 0o600 }); return; }
    readFile(filename, MAX_OUTPUT_BYTES);
    const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
    try {
        fs.writeFileSync(temporary, encode(record), { flag: 'wx', mode: 0o600 });
        fs.renameSync(temporary, filename);
    } finally { if (exists(temporary)) fs.unlinkSync(temporary); }
}

function loadReceipt(filename, selection) {
    const receipt = path.resolve(filename);
    requireValue(path.basename(receipt) === 'receipt.json', 'Select the generated receipt.json');
    const transaction = directory(path.dirname(receipt));
    requireValue(!overlaps(transaction, selection.parent), 'Receipt storage must remain outside discovery');
    const bytes = readFile(path.join(transaction, 'receipt.json'), MAX_OUTPUT_BYTES).toString('utf8');
    const record = parseJson(bytes);
    requireValue(encode(record) === bytes, 'Receipt must preserve its generated encoding without duplicate fields');
    requireValue(record.schema_version === 1 && record.name === selection.name && record.destination === selection.destination, 'Receipt does not match the explicitly selected destination');
    requireValue(['prepared', 'installed', 'rolled-back'].includes(record.state), 'Unknown receipt state');
    requireValue(/^[a-f0-9]{64}$/.test(record.content?.sha256)
        && (record.previous === null || /^[a-f0-9]{64}$/.test(record.previous?.sha256)), 'Invalid receipt digest');
    return { receipt: path.join(transaction, 'receipt.json'), transaction, record };
}

function transactionFolder(transaction, name, create = false) {
    const folder = path.join(transaction, name);
    if (!exists(folder)) {
        if (create) fs.mkdirSync(folder, { mode: 0o700 });
        return folder;
    }
    requireValue(directory(folder) === folder, 'Transaction resource must not redirect through a link');
    return folder;
}

function recover(selection, stored) {
    const { transaction, record, receipt } = stored;
    const previous = path.join(transactionFolder(transaction, 'previous'), selection.name);
    const withdrawn = path.join(transactionFolder(transaction, 'withdrawn'), selection.name);
    const current = exists(selection.destination) ? treeDigest(selection.destination) : null;
    const retained = exists(previous) ? treeDigest(previous) : null;
    requireValue(!retained || retained.sha256 === record.previous?.sha256, 'Retained package changed; recovery stopped');
    if (current?.sha256 === record.previous?.sha256 && !retained) {
        record.state = 'rolled-back';
        saveReceipt(receipt, record, true);
        return;
    }
    requireValue(!current || current.sha256 === record.content.sha256, 'Destination changed; recovery stopped without overwriting it');
    requireValue(!record.previous || retained, 'Required retained package is missing; recovery stopped');
    if (current) {
        requireValue(!exists(withdrawn), 'Withdrawn package already exists; inspect the transaction');
        transactionFolder(transaction, 'withdrawn', true);
        fs.renameSync(selection.destination, withdrawn);
    }
    try {
        if (retained) fs.renameSync(previous, selection.destination);
    } catch (error) {
        if (current && !exists(selection.destination)) fs.renameSync(withdrawn, selection.destination);
        throw error;
    }
    record.state = 'rolled-back';
    saveReceipt(receipt, record, true);
}

function install(options) {
    const selection = selectedDestination(options.destination);
    requireValue(selection.name === packageName(options.name), 'Destination basename must equal the approved package name');
    const stateRoot = directory(options['state-dir']);
    const source = sourceTree(options);
    requireValue(!overlaps(stateRoot, selection.parent) && !overlaps(source.repository, stateRoot)
        && !overlaps(source.repository, selection.destination), 'Source, transaction storage and destination must be separate');
    requireValue(fs.statSync(stateRoot).dev === fs.statSync(selection.parent).dev, 'Transaction storage and destination must be on the same filesystem');
    assertNoAlias(selection);
    requireValue(!exists(selection.destination) || options.replace, 'Destination exists; explicit --replace is required');
    return withLock(selection, () => {
        assertNoAlias(selection);
        requireValue(!exists(selection.destination) || options.replace, 'Destination appeared; refusing replacement');
        const previous = exists(selection.destination) ? treeDigest(selection.destination) : null;
        const transaction = fs.mkdtempSync(path.join(stateRoot, 'installation-'));
        const candidate = path.join(transaction, 'candidate', selection.name);
        const receipt = path.join(transaction, 'receipt.json');
        let stored = null;
        try {
            stageSource(source, candidate);
            const checked = validateCandidate(candidate, options);
            const record = {
                schema_version: 1, state: 'prepared', name: selection.name, destination: selection.destination,
                source: { repository: source.repository, package: source.package, revision: source.revision },
                ...checked, previous, host_projections: [], created_at: new Date().toISOString(),
            };
            saveReceipt(receipt, record);
            stored = { receipt, transaction, record };
            const current = exists(selection.destination) ? treeDigest(selection.destination) : null;
            requireValue(current?.sha256 === previous?.sha256, 'Destination changed before installation');
            if (previous) {
                const retained = path.join(transaction, 'previous', selection.name);
                fs.mkdirSync(path.dirname(retained), { mode: 0o700 });
                fs.renameSync(selection.destination, retained);
            }
            fs.renameSync(candidate, selection.destination);
            requireValue(treeDigest(selection.destination).sha256 === record.content.sha256, 'Installed read-back does not match staged bytes');
            record.state = 'installed';
            saveReceipt(receipt, record, true);
            return { ok: true, state: record.state, destination: selection.destination, receipt, content: record.content, setup: record.setup };
        } catch (error) {
            if (!stored) { fs.rmSync(transaction, { recursive: true, force: true }); throw error; }
            try { recover(selection, stored); }
            catch { throw new Error(`Installation needs inspection; retained transaction: ${transaction}`); }
            throw new Error(`${error.message}; installation rolled back, receipt: ${receipt}`);
        }
    });
}

function verify(options) {
    const selection = selectedDestination(options.destination);
    const { record, receipt } = loadReceipt(options.receipt, selection);
    requireValue(record.state !== 'prepared', 'Installation was interrupted; inspect and recover its receipt');
    const expected = record.state === 'installed' ? record.content : record.previous;
    const current = exists(selection.destination) ? treeDigest(selection.destination) : null;
    requireValue(current?.sha256 === expected?.sha256, 'Destination no longer matches the receipt');
    return { ok: true, state: record.state, destination: selection.destination, receipt, content: current };
}

function rollback(options) {
    const selection = selectedDestination(options.destination);
    return withLock(selection, () => {
        const stored = loadReceipt(options.receipt, selection);
        if (stored.record.state === 'rolled-back') return verify(options);
        recover(selection, stored);
        return verify(options);
    });
}

function parseArgs(args) {
    const command = args.shift();
    const required = command === 'install'
        ? ['repository', 'package', 'revision', 'name', 'license', 'destination', 'state-dir', 'validator', 'validator-version']
        : ['receipt', 'destination'];
    const options = {};
    requireValue(['install', 'verify', 'rollback'].includes(command), 'Use install, verify, or rollback; read the bundled fallback reference for complete examples');
    while (args.length) {
        const flag = args.shift();
        requireValue(flag.startsWith('--'), 'Options must use --name value');
        const key = flag.slice(2);
        requireValue(!Object.hasOwn(options, key), 'Repeated option');
        if (key === 'replace' && command === 'install') { options.replace = true; continue; }
        requireValue(required.includes(key), 'Unknown option');
        const value = args.shift();
        requireValue(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), 'Missing option value');
        options[key] = value;
    }
    for (const key of required) requireValue(options[key], `Missing --${key}`);
    return { command, options };
}

try {
    const { command, options } = parseArgs(process.argv.slice(2));
    const handlers = { install, verify, rollback };
    process.stdout.write(encode(handlers[command](options)));
} catch (error) {
    process.stderr.write(`Installation fallback: ${error.message}\n`);
    process.exitCode = 1;
}
