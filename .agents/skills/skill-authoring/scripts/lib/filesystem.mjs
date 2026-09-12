/**
 * Bounded filesystem inspection for a trusted, stable local workspace.
 *
 * Node has no portable openat/dir_fd API. These path checks reject static
 * symlinks, hard links, traversal, and special files before reading contents.
 * Identity rechecks and O_NOFOLLOW where available detect some replacements;
 * they do NOT provide atomic confinement against concurrent hostile mutation.
 * Do not use this utility as a sandbox for an attacker-controlled workspace.
 */
import fs from 'node:fs';
import path from 'node:path';
import { LIMITS, ValidationError, relativeParts, requireCondition } from './contracts.mjs';

function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode; }
function ordinary(info, relative, { allowSymlink = false } = {}) {
  if (allowSymlink && info.isSymbolicLink()) return;
  requireCondition(!info.isSymbolicLink(), `symlink is forbidden: ${relative}`);
  requireCondition(info.isFile() || info.isDirectory(), `special filesystem entry is forbidden: ${relative}`);
  if (info.isFile()) requireCondition(info.nlink === 1, `hard-linked file is forbidden: ${relative}`);
}

export class SafeRoot {
  constructor(input) {
    const selected = path.resolve(input);
    const initial = fs.lstatSync(selected);
    requireCondition(initial.isDirectory() && !initial.isSymbolicLink(), 'selected root must be a real directory');
    // The caller selects this trust boundary; canonicalize its ancestors once.
    this.path = fs.realpathSync.native(selected);
    this.rootInfo = fs.lstatSync(this.path);
    requireCondition(sameIdentity(initial, this.rootInfo), 'selected root changed during inspection');
    this.closed = false;
  }
  close() { this.closed = true; }
  assertStable() {
    requireCondition(!this.closed, 'filesystem root is closed');
    const current = fs.lstatSync(this.path);
    requireCondition(current.isDirectory() && !current.isSymbolicLink() && sameIdentity(this.rootInfo, current),
      'selected root changed during inspection');
  }
  inspect(relative, { allowSymlinkLeaf = false, allowMissingLeaf = false } = {}) {
    const parts = relativeParts(relative);
    this.assertStable();
    const ancestors = [];
    let absolute = this.path;
    for (const [index, part] of parts.entries()) {
      absolute = path.join(absolute, part);
      const leaf = index === parts.length - 1;
      let info;
      try { info = fs.lstatSync(absolute); }
      catch (error) {
        if (leaf && allowMissingLeaf && error.code === 'ENOENT') return { absolute, info: null, ancestors };
        throw error;
      }
      ordinary(info, relative, { allowSymlink: leaf && allowSymlinkLeaf });
      if (!leaf) requireCondition(info.isDirectory(), `parent component is not a directory: ${relative}`);
      else return { absolute, info, ancestors };
      ancestors.push([absolute, info]);
    }
    throw new ValidationError('invalid empty path');
  }
  verifySnapshot(snapshot, { includeLeaf = true } = {}) {
    this.assertStable();
    for (const [absolute, original] of snapshot.ancestors) {
      const current = fs.lstatSync(absolute);
      requireCondition(current.isDirectory() && !current.isSymbolicLink() && sameIdentity(original, current),
        'parent directory changed during inspection');
    }
    if (includeLeaf && snapshot.info !== null) {
      const current = fs.lstatSync(snapshot.absolute);
      requireCondition(sameIdentity(snapshot.info, current), 'filesystem entry changed during inspection');
      ordinary(current, path.basename(snapshot.absolute), { allowSymlink: snapshot.info.isSymbolicLink() });
    }
  }
  info(relative) { return this.inspect(relative).info; }
  readBytes(relative, limit = LIMITS.textBytes) {
    requireCondition(Number.isSafeInteger(limit) && limit >= 0 && limit <= LIMITS.totalBytes, 'invalid file read limit');
    requireCondition(Number.isInteger(fs.constants.O_NOFOLLOW) && Number.isInteger(fs.constants.O_NONBLOCK),
      'safe reads require this operating system to expose O_NOFOLLOW and O_NONBLOCK');
    const snapshot = this.inspect(relative);
    requireCondition(snapshot.info.isFile(), `not a regular file: ${relative}`);
    requireCondition(snapshot.info.size <= limit, `file exceeds ${limit} bytes: ${relative}`);
    let descriptor;
    try {
      const resolved = fs.realpathSync.native(snapshot.absolute);
      const fromRoot = path.relative(this.path, resolved);
      requireCondition(fromRoot !== '..' && !fromRoot.startsWith(`..${path.sep}`) && !path.isAbsolute(fromRoot),
        'resolved file escapes the selected root');
      descriptor = fs.openSync(snapshot.absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      const opened = fs.fstatSync(descriptor);
      ordinary(opened, relative);
      requireCondition(opened.isFile() && sameIdentity(snapshot.info, opened) && opened.size === snapshot.info.size,
        'file changed before reading');
      requireCondition(opened.size <= limit, `file exceeds ${limit} bytes: ${relative}`);
      this.verifySnapshot(snapshot);
      const chunks = []; let length = 0;
      while (length <= limit) {
        const chunk = Buffer.allocUnsafe(Math.min(65_536, limit + 1 - length));
        const count = fs.readSync(descriptor, chunk, 0, chunk.length, null);
        if (count === 0) break;
        chunks.push(chunk.subarray(0, count)); length += count;
      }
      requireCondition(length <= limit, `file exceeds ${limit} bytes: ${relative}`);
      const after = fs.fstatSync(descriptor);
      requireCondition(after.size === opened.size && after.mtimeMs === opened.mtimeMs && after.ctimeMs === opened.ctimeMs,
        'file contents changed during reading');
      this.verifySnapshot(snapshot);
      return Buffer.concat(chunks, length);
    } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
  }
  readText(relative, limit = LIMITS.textBytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(this.readBytes(relative, limit)); }
    catch (error) {
      if (error instanceof TypeError && error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') throw new ValidationError(`file must be UTF-8: ${relative}`);
      throw error;
    }
  }
  inventory({ ignoredNames = [], ignoredRootNames = [], allowedSymlinks = {} } = {}) {
    const ignored = new Set(ignoredNames); const ignoredRoot = new Set(ignoredRootNames);
    const result = []; let total = 0;
    const visit = parts => {
      requireCondition(parts.length <= LIMITS.depth, 'directory nesting exceeds the limit');
      const relativeDirectory = parts.join('/');
      const snapshot = parts.length ? this.inspect(relativeDirectory) : null;
      this.assertStable();
      if (snapshot) requireCondition(snapshot.info.isDirectory(), 'inventory requires a directory');
      const directory = fs.opendirSync(snapshot?.absolute ?? this.path);
      try {
        if (snapshot) this.verifySnapshot(snapshot); else this.assertStable();
        let entry;
        while ((entry = directory.readSync()) !== null) {
          if (ignored.has(entry.name) || (parts.length === 0 && ignoredRoot.has(entry.name))) continue;
          requireCondition(result.length < LIMITS.entries, 'package entry count exceeds the limit');
          const relative = [...parts, entry.name].join('/');
          const inspected = this.inspect(relative, { allowSymlinkLeaf: Object.hasOwn(allowedSymlinks, relative) });
          const { info } = inspected;
          if (info.isSymbolicLink()) {
            requireCondition(fs.readlinkSync(inspected.absolute) === allowedSymlinks[relative], `unexpected alias target: ${relative}`);
            this.verifySnapshot(inspected); result.push([relative, info]); continue;
          }
          result.push([relative, info]);
          if (info.isDirectory()) visit([...parts, entry.name]);
          else {
            total += info.size;
            requireCondition(info.size <= LIMITS.artifactBytes, `package file exceeds ${LIMITS.artifactBytes} bytes: ${relative}`);
            requireCondition(total <= LIMITS.totalBytes, 'package total size exceeds the limit');
          }
        }
        if (snapshot) this.verifySnapshot(snapshot); else this.assertStable();
      } finally { directory.closeSync(); }
    };
    visit([]); return result;
  }
}
