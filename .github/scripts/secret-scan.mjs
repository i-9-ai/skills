import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LIMITS = Object.freeze({
    commits: 500,
    patchBytes: 32 * 1024 * 1024,
    treeBytes: 64 * 1024 * 1024,
    blobBytes: 8 * 1024 * 1024,
    files: 10000,
    outputBytes: 1024 * 1024,
    timeoutMs: 120000,
});

const SHA = /^[a-f0-9]{40}$/u;

class ScanError extends Error {}

function gitEnvironment(directory) {
    const env = Object.fromEntries(
        Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
    );
    return {
        ...env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: join(directory, 'empty-config'),
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
    };
}

function git(root, args, env, maxBuffer = LIMITS.outputBytes) {
    const result = spawnSync('git', ['-c', 'core.fsmonitor=false', ...args], {
        cwd: root,
        env,
        encoding: null,
        maxBuffer,
        timeout: LIMITS.timeoutMs,
    });
    if (result.error || result.status !== 0) {
        throw new ScanError('Git scan input is unavailable or exceeds its resource boundary.');
    }
    return result.stdout;
}

function detector(binary, root, kind, args, directory, env) {
    const result = spawnSync(
        binary,
        [
            kind,
            root,
            '--config',
            join(directory, 'rules.toml'),
            '--gitleaks-ignore-path',
            join(directory, 'empty-ignore'),
            '--ignore-gitleaks-allow',
            '--redact=100',
            '--no-banner',
            '--no-color',
            '--log-level=error',
            '--max-archive-depth=0',
            '--max-decode-depth=5',
            '--timeout=90',
            '--exit-code=10',
            ...args,
        ],
        {
            cwd: directory,
            env,
            encoding: null,
            maxBuffer: LIMITS.outputBytes,
            timeout: LIMITS.timeoutMs,
        },
    );
    // Never forward child diagnostics: even redacted output can contain source text.
    if (result.error || ![0, 10].includes(result.status)) {
        throw new ScanError('Secret detector failed or exceeded its resource boundary.');
    }
    return result.status === 10;
}

function temporaryScan(operation) {
    const directory = mkdtempSync(join(tmpdir(), 'i9-secret-scan-'));
    try {
        writeFileSync(join(directory, 'empty-config'), '', { mode: 0o600 });
        writeFileSync(join(directory, 'empty-ignore'), '', { mode: 0o600 });
        writeFileSync(join(directory, 'rules.toml'), '[extend]\nuseDefault = true\n', {
            mode: 0o600,
        });
        return operation(directory, gitEnvironment(directory));
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

export function scanRepository({ root, head, base, binary = 'gitleaks' }) {
    if (!SHA.test(head) || (base && !SHA.test(base))) {
        throw new ScanError('The scan requires full lowercase Git commit SHAs.');
    }
    return temporaryScan((directory, env) => {
        const checkedOut = git(root, ['rev-parse', 'HEAD'], env).toString('utf8').trim();
        if (checkedOut !== head) throw new ScanError('The checkout does not match the scan head.');
        git(root, ['cat-file', '-e', `${head}^{commit}`], env);
        const boundedHistory = !base || /^0{40}$/u.test(base);
        if (!boundedHistory) git(root, ['cat-file', '-e', `${base}^{commit}`], env);
        const range = boundedHistory ? head : `${base}..${head}`;
        const commits = git(root, ['rev-list', `--max-count=${LIMITS.commits + 1}`, range], env)
            .toString('utf8')
            .trim()
            .split('\n')
            .filter(Boolean);
        if (!boundedHistory && commits.length > LIMITS.commits) {
            throw new ScanError(
                'The new commit range exceeds 500 commits; split or audit it explicitly.',
            );
        }
        const count = Math.min(commits.length, LIMITS.commits);
        const logOptions = `--full-history --diff-merges=first-parent --max-count=${count} ${range}`;
        if (count > 0) {
            git(
                root,
                [
                    'log',
                    '--format=',
                    '-p',
                    '--no-ext-diff',
                    '--no-textconv',
                    ...logOptions.split(' '),
                ],
                env,
                LIMITS.patchBytes,
            );
            if (detector(binary, root, 'git', [`--log-opts=${logOptions}`], directory, env)) {
                throw new ScanError(
                    'Credential pattern detected in commit content; matched values are omitted.',
                );
            }
        }

        const tree = join(directory, 'tree');
        mkdirSync(tree, { mode: 0o700 });
        const entries = git(root, ['ls-tree', '-r', '-z', '-l', head], env, 4 * LIMITS.outputBytes)
            .toString('utf8')
            .split('\0')
            .filter(Boolean);
        if (entries.length > LIMITS.files)
            throw new ScanError('The tracked tree exceeds 10000 entries.');
        let bytes = 0;
        let files = 0;
        for (const entry of entries) {
            const match = /^(\d+) (\w+) ([a-f0-9]{40})\s+(\d+|-)\t([\s\S]+)$/u.exec(entry);
            if (!match || match[2] !== 'blob') {
                throw new ScanError(
                    'Submodules or unsupported tree objects require a separate audit.',
                );
            }
            const size = Number(match[4]);
            const target = resolve(tree, match[5]);
            if (
                !target.startsWith(`${tree}/`) ||
                match[5].split('/').some((part) => ['.', '..'].includes(part))
            ) {
                throw new ScanError('The tracked tree contains an unsafe path.');
            }
            if (!Number.isSafeInteger(size) || size > LIMITS.blobBytes) {
                throw new ScanError('A tracked blob exceeds the 8 MiB scan boundary.');
            }
            bytes += size;
            if (bytes > LIMITS.treeBytes)
                throw new ScanError('The tracked tree exceeds the 64 MiB scan boundary.');
            const content = git(root, ['cat-file', 'blob', match[3]], env, LIMITS.blobBytes);
            if (content.length !== size)
                throw new ScanError('A tracked blob changed during capture.');
            mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
            // Symlink blobs are plain text here; no repository path is followed.
            writeFileSync(target, content, { flag: 'wx', mode: 0o600 });
            files += 1;
        }
        if (detector(binary, tree, 'dir', [], directory, env)) {
            throw new ScanError(
                'Credential pattern detected in the tracked tree; matched values are omitted.',
            );
        }
        return { commits: count, files, bytes, bounded_history: boundedHistory };
    });
}

export function selfTest(binary = 'gitleaks') {
    return temporaryScan((directory, env) => {
        const fixture = join(directory, 'fixture');
        mkdirSync(fixture, { mode: 0o700 });
        const file = join(fixture, 'example.txt');
        writeFileSync(join(fixture, '.gitleaks.toml'), "[allowlist]\nregexes = ['.*']\n");
        const placeholder = 'Documentation placeholder: EXAMPLE_TOKEN\n';
        writeFileSync(file, placeholder);
        if (detector(binary, fixture, 'dir', [], directory, env)) {
            throw new ScanError('Secret detector rejected the harmless documentation placeholder.');
        }
        git(fixture, ['init', '-q'], env);
        function commit() {
            git(fixture, ['add', '--', 'example.txt'], env);
            git(
                fixture,
                [
                    '-c',
                    'user.name=Synthetic Test',
                    '-c',
                    'user.email=test@example.invalid',
                    'commit',
                    '-qm',
                    'Record synthetic detector fixture',
                ],
                env,
            );
            return git(fixture, ['rev-parse', 'HEAD'], env).toString('utf8').trim();
        }
        const base = commit();
        const synthetic = ['ghp', '8zQ2mP7kR4tY9vN3cL6sA1dF5hJ0bW2uX7eG'].join('_');
        writeFileSync(file, `Synthetic credential fixture: ${synthetic} // gitleaks:allow\n`);
        if (!detector(binary, fixture, 'dir', [], directory, env)) {
            throw new ScanError('Secret detector did not reject the synthetic credential fixture.');
        }
        commit();
        writeFileSync(file, placeholder);
        const head = commit();
        if (!detector(binary, fixture, 'git', [`--log-opts=${base}..${head}`], directory, env)) {
            throw new ScanError(
                'Secret detector did not reject introduced and removed synthetic content.',
            );
        }
        return { positive: true, negative: true, removed_history: true };
    });
}

export function main(args = process.argv.slice(2), env = process.env) {
    const binary = env.GITLEAKS_BINARY || 'gitleaks';
    if (args.length === 1 && args[0] === '--self-test') return selfTest(binary);
    if (
        args.length !== 0 ||
        !['pull_request', 'push', 'workflow_dispatch'].includes(env.SCAN_EVENT)
    ) {
        throw new ScanError('Unsupported secret scan invocation.');
    }
    if (
        env.SCAN_EVENT === 'pull_request' &&
        (!env.SCAN_BASE_SHA || /^0{40}$/u.test(env.SCAN_BASE_SHA))
    ) {
        throw new ScanError('A pull request scan requires its complete base commit.');
    }
    if (env.SCAN_EVENT === 'push' && !env.SCAN_BASE_SHA) {
        throw new ScanError('A push scan requires its before commit or the initial-push zero SHA.');
    }
    return scanRepository({
        root: process.cwd(),
        head: env.SCAN_HEAD_SHA,
        base: env.SCAN_EVENT === 'workflow_dispatch' ? undefined : env.SCAN_BASE_SHA,
        binary,
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        console.log(JSON.stringify(main()));
    } catch (error) {
        console.error(
            error instanceof ScanError
                ? error.message
                : 'Secret scan input could not be safely captured.',
        );
        process.exitCode = 1;
    }
}
