import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { VisualGuideRepository } from '../../../src/repository/VisualGuideRepository.ts';

test('the checked-in visual guide matches its reviewed source/artifact pair', () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    assert.deepEqual(new VisualGuideRepository().verify(root), { guides: 1 });
});

test('visual guide verification rejects source-only and artifact-only drift before publication', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-guide-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = 'docs/diagrams/example.json';
    const artifact = 'docs/assets/example.html';
    fs.mkdirSync(path.join(root, 'docs/diagrams'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs/assets'), { recursive: true });
    fs.writeFileSync(path.join(root, source), '{"title":"example"}\n');
    fs.writeFileSync(path.join(root, artifact), '<h1>example</h1>\n');
    const hash = (file) =>
        createHash('sha256')
            .update(fs.readFileSync(path.join(root, file)))
            .digest('hex');
    const receipt = {
        schema_version: 1,
        guides: [
            {
                source,
                artifact,
                source_sha256: hash(source),
                artifact_sha256: hash(artifact),
                generator: 'synthetic generator',
                reviewed_on: '2026-09-22',
            },
        ],
    };
    fs.writeFileSync(
        path.join(root, 'docs/diagrams/visual-guides.lock.json'),
        JSON.stringify(receipt),
    );
    assert.deepEqual(new VisualGuideRepository().verify(root), { guides: 1 });
    for (const file of [source, artifact]) {
        const original = fs.readFileSync(path.join(root, file));
        fs.appendFileSync(path.join(root, file), 'changed');
        assert.throws(() => new VisualGuideRepository().verify(root), /changed after review/);
        fs.writeFileSync(path.join(root, file), original);
    }
    fs.writeFileSync(path.join(root, 'docs/assets/index.html'), '<h1>Guide index</h1>');
    assert.deepEqual(new VisualGuideRepository().verify(root), { guides: 1 });
    fs.mkdirSync(path.join(root, 'docs/assets/nested'));
    for (const relative of ['docs/assets/unreviewed.html', 'docs/assets/nested/unreviewed.HTM']) {
        fs.writeFileSync(path.join(root, relative), '<h1>Unreviewed</h1>');
        assert.throws(
            () => new VisualGuideRepository().verify(root),
            /missing from the reviewed receipt/,
        );
        fs.rmSync(path.join(root, relative));
    }
});
