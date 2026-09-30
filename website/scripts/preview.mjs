import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.txt': 'text/plain; charset=utf-8',
};

export function createPreviewServer(outputDirectory) {
    const root = fs.realpathSync(outputDirectory);
    const markerPath = path.join(root, '.i9-site-build.json');
    if (!fs.lstatSync(markerPath).isFile() || fs.lstatSync(markerPath).isSymbolicLink()) {
        throw new Error('Preview requires a regular build ownership marker');
    }
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    if (
        marker.kind !== 'i9-skills-local-site' ||
        marker.schemaVersion !== 1 ||
        !marker.files ||
        Object.keys(marker.files).length > 1000
    ) {
        throw new Error('Preview requires a verified site build');
    }
    return http.createServer((request, response) => {
        const headers = {
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-store',
            'Content-Security-Policy':
                "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            'X-Robots-Tag': 'noindex',
        };
        const fail = (status) => {
            response.writeHead(status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
            response.end(status === 404 ? 'Not found\n' : 'Request refused\n');
        };
        if (!['GET', 'HEAD'].includes(request.method)) {
            fail(405);
            return;
        }
        let relative;
        try {
            const requestPath = decodeURIComponent(request.url.split('?')[0]);
            if (
                !requestPath.startsWith('/') ||
                requestPath.includes('\\') ||
                requestPath.includes('\0') ||
                requestPath.split('/').some((part) => part === '..' || part === '.')
            ) {
                fail(400);
                return;
            }
            relative = requestPath.slice(1);
            if (!relative || relative.endsWith('/')) relative += 'index.html';
        } catch {
            fail(400);
            return;
        }
        if (!Object.hasOwn(marker.files, relative)) {
            fail(404);
            return;
        }
        const target = path.join(root, relative);
        try {
            const actual = fs.realpathSync(target);
            if (
                !actual.startsWith(root + path.sep) ||
                fs.lstatSync(target).isSymbolicLink() ||
                !fs.statSync(target).isFile()
            ) {
                fail(403);
                return;
            }
            const bytes = fs.readFileSync(actual);
            const digest = createHash('sha256').update(bytes).digest('hex');
            if (digest !== marker.files[relative]) {
                fail(409);
                return;
            }
            response.writeHead(200, {
                ...headers,
                'Content-Type': mime[path.extname(relative)] ?? 'application/octet-stream',
                'Content-Length': bytes.length,
            });
            response.end(request.method === 'HEAD' ? undefined : bytes);
        } catch {
            fail(404);
        }
    });
}

function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
        process.stdout.write(
            'Serve an owned static build on loopback only.\nUsage: node website/scripts/preview.mjs [--root DIRECTORY] [--port NUMBER]\nDefaults: .work/website-preview, 4173. Never deploys.\n',
        );
        return;
    }
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
        if (
            !['--root', '--port'].includes(args[index]) ||
            !args[index + 1] ||
            options[args[index]] !== undefined
        ) {
            throw new Error('Use --help for the supported arguments');
        }
        options[args[index]] = args[index + 1];
    }
    const port = options['--port'] === undefined ? 4173 : Number(options['--port']);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('Port must be 1–65535');
    const project = fileURLToPath(new URL('../../', import.meta.url));
    const output = path.resolve(project, options['--root'] ?? '.work/website-preview');
    const server = createPreviewServer(output);
    server.on('error', (error) => {
        process.stderr.write(error.message + '\n');
        process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
        process.stdout.write(
            'Local review: http://127.0.0.1:' + port + '/\nPublication: not authorized\n',
        );
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        process.stderr.write(error.message + '\n');
        process.exitCode = 1;
    }
}
