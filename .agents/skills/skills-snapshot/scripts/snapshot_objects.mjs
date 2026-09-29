// Immutable byte storage and manifest materialization. No provider dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hashPattern = /^[0-9a-f]{64}$/;
const modeValid = value => Number.isInteger(value) && value >= 0 && value <= 0o777;
const exists = file => { try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
export const MAX_OBJECT_BYTES = 64 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
export const MAX_TREE_ENTRIES = 16384;
export const MAX_TREE_DEPTH = 64;

/** Collect only a bounded directory listing before deterministic sorting. */
export function boundedNames(directory, remaining = MAX_TREE_ENTRIES) {
  const names = [];
  const handle = fs.opendirSync(directory);
  try {
    for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
      if (names.length >= Math.min(remaining, MAX_TREE_ENTRIES)) throw new Error('Snapshot exceeds the entry limit');
      names.push(entry.name);
    }
  } finally { handle.closeSync(); }
  return names.sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
}

/** JSON manifests store UTF-8 link text; reject lossy POSIX target decoding. */
export function readLinkText(file) {
  const bytes = fs.readlinkSync(file, { encoding: 'buffer' });
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error('Snapshot symlink targets must be valid UTF-8'); }
}

/** Read only bounded regular files; O_NONBLOCK also prevents FIFO replacement from hanging. */
export function readRegularFile(file, limit = MAX_OBJECT_BYTES, expectedSize) {
  if (typeof fs.constants.O_NOFOLLOW !== 'number' || typeof fs.constants.O_NONBLOCK !== 'number') throw new Error('Safe file-read primitives are unavailable');
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('Snapshot input must be a regular file');
  if (!Number.isSafeInteger(before.size) || before.size > limit || expectedSize !== undefined && before.size !== expectedSize) throw new Error('Snapshot input size exceeds its bound or expected size');
  // Object publication removes its temporary hard link; that changes ctime,
  // but not bytes. Content hashes remain the integrity authority for objects.
  const same = stat => stat.isFile() && stat.dev === before.dev && stat.ino === before.ino && stat.size === before.size && stat.mtimeMs === before.mtimeMs;
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    if (!same(fs.fstatSync(descriptor))) throw new Error('Snapshot input changed before reading');
    const chunks = [];
    let length = 0;
    while (length <= before.size) {
      const chunk = Buffer.allocUnsafe(Math.min(65536, before.size + 1 - length));
      const count = fs.readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      chunks.push(chunk.subarray(0, count));
      length += count;
    }
    if (length !== before.size || !same(fs.fstatSync(descriptor)) || !same(fs.lstatSync(file))) throw new Error('Snapshot input changed during reading');
    return Buffer.concat(chunks, length);
  } finally { fs.closeSync(descriptor); }
}
export function storeFor(snapshot) {
  const parent = path.dirname(snapshot);
  return path.basename(parent) === '.trash' && !exists(path.join(parent, '.objects')) ? path.dirname(parent) : parent;
}
function objectDirectory(store, create = false) {
  let cursor = store;
  for (const part of ['.objects', 'sha256']) {
    cursor = path.join(cursor, part);
    if (!exists(cursor) && create) {
      try { fs.mkdirSync(cursor, { mode: 0o700 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    const stat = fs.lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Object directory must be a real directory');
  }
  return cursor;
}
export function readObject(store, hash, size) {
  if (!hashPattern.test(hash)) throw new Error('Invalid object digest');
  const file = path.join(objectDirectory(store), hash);
  const bytes = readRegularFile(file, MAX_OBJECT_BYTES, size);
  if (digest(bytes) !== hash) throw new Error('Object integrity verification failed');
  return bytes;
}
export function putObject(store, bytes) {
  const hash = digest(bytes);
  const directory = objectDirectory(store, true);
  const destination = path.join(directory, hash);
  if (exists(destination)) { readObject(store, hash, bytes.length); return false; }
  const temporary = path.join(directory, `.pending-${process.pid}-${crypto.randomBytes(8).toString('hex')}`);
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o400 });
    // Atomic no-clobber publication. Only immutable object files share this inode.
    try { fs.linkSync(temporary, destination); return true; }
    catch (error) { if (error.code !== 'EEXIST') throw error; readObject(store, hash, bytes.length); return false; }
  } finally { fs.rmSync(temporary, { force: true }); }
}
export function validateTree(tree) {
  if (!Array.isArray(tree?.entries) || !hashPattern.test(tree?.tree_hash) || !modeValid(tree?.root_mode)) throw new Error('Malformed object tree');
  if (tree.entries.length > MAX_TREE_ENTRIES) throw new Error('Snapshot exceeds the entry limit');
  if (digest(Buffer.from(JSON.stringify(tree.entries))) !== tree.tree_hash) throw new Error('Manifest tree hash mismatch');
  const seen = new Map();
  let previous = null;
  for (const entry of tree.entries) {
    if (typeof entry.path !== 'string' || !entry.path || entry.path === '.' || entry.path.endsWith('/') || /^[A-Za-z]:/.test(entry.path) || entry.path.includes('\\') || entry.path.includes('\0') || path.posix.normalize(entry.path) !== entry.path || entry.path.startsWith('/') || entry.path === '..' || entry.path.startsWith('../')) throw new Error('Unsafe manifest path');
    if (entry.path.split('/').length > MAX_TREE_DEPTH) throw new Error('Snapshot exceeds the depth limit');
    if (previous !== null && Buffer.from(previous).compare(Buffer.from(entry.path)) >= 0) throw new Error('Manifest paths must be unique and sorted');
    previous = entry.path;
    if (!modeValid(entry.mode) || !['file', 'directory', 'symlink'].includes(entry.type)) throw new Error('Malformed manifest entry');
    const parent = path.posix.dirname(entry.path);
    if (parent !== '.' && seen.get(parent) !== 'directory') throw new Error('Manifest entry parent must be a recorded directory');
    if (entry.type === 'file' && (!hashPattern.test(entry.sha256) || !Number.isSafeInteger(entry.size) || entry.size < 0)) throw new Error('Malformed file object reference');
    if (entry.type === 'symlink' && (!hashPattern.test(entry.target_sha256) || typeof entry.target_is_absolute !== 'boolean' || typeof entry.target !== 'string')) throw new Error('Malformed link object reference');
    seen.set(entry.path, entry.type);
  }
}
export function verifyTree(store, tree) {
  validateTree(tree);
  for (const entry of tree.entries) {
    if (entry.type === 'file') readObject(store, entry.sha256, entry.size);
    if (entry.type === 'symlink') {
      const bytes = readObject(store, entry.target_sha256);
      const target = bytes.toString('utf8');
      if (!target || target.includes('\0') || !Buffer.from(target).equals(bytes) || path.isAbsolute(target) !== entry.target_is_absolute || (entry.target_is_absolute ? '<absolute-redacted>' : target) !== entry.target) throw new Error('Link text does not match manifest');
    }
  }
}
export function persistTree(store, tree, source) {
  validateTree(tree);
  let added = 0;
  for (const entry of tree.entries) {
    if (entry.type === 'directory') continue;
    const file = path.join(source, ...entry.path.split('/'));
    const stat = fs.lstatSync(file);
    if (entry.type === 'file' && !stat.isFile() || entry.type === 'symlink' && !stat.isSymbolicLink()) throw new Error('Source changed during capture');
    const bytes = entry.type === 'file' ? readRegularFile(file, MAX_OBJECT_BYTES, entry.size) : Buffer.from(readLinkText(file));
    if (digest(bytes) !== (entry.type === 'file' ? entry.sha256 : entry.target_sha256) || entry.type === 'file' && bytes.length !== entry.size) throw new Error('Source changed during capture');
    if (/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/.test(bytes.toString('utf8'))) throw new Error('Private-key material is not allowed in a snapshot');
    if (putObject(store, bytes)) added += 1;
  }
  return added;
}
export function materializeTree(store, tree, destination) {
  verifyTree(store, tree);
  fs.mkdirSync(destination, { mode: 0o700 });
  for (const entry of tree.entries) {
    const file = path.join(destination, ...entry.path.split('/'));
    if (entry.type === 'directory') fs.mkdirSync(file, { mode: 0o700 });
    if (entry.type === 'file') fs.writeFileSync(file, readObject(store, entry.sha256, entry.size), { flag: 'wx', mode: entry.mode });
    if (entry.type === 'symlink') {
      fs.symlinkSync(readObject(store, entry.target_sha256).toString('utf8'), file);
      if ((fs.lstatSync(file).mode & 0o777) !== entry.mode && typeof fs.lchmodSync === 'function') fs.lchmodSync(file, entry.mode);
      if ((fs.lstatSync(file).mode & 0o777) !== entry.mode) throw new Error('Platform cannot preserve selected symlink permission bits');
    }
  }
  for (const entry of [...tree.entries].reverse()) if (entry.type !== 'symlink') fs.chmodSync(path.join(destination, ...entry.path.split('/')), entry.mode);
  fs.chmodSync(destination, tree.root_mode);
}
