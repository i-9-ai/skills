// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { SkillPanelDiffService } from '../../../src/service/SkillPanelDiffService.ts';

test('separated edits preserve equal lines and highlight only changed words in long paragraphs', () => {
    const before =
        'Read the current file and keep all other words unchanged.\n' +
        'stable\n'.repeat(12) +
        'Choose the old result.\n';
    const after = before.replace('current', 'selected').replace('old result', 'new result');
    const service = new SkillPanelDiffService();
    const diff = service.compare(before, after);
    assert.equal(diff.added, 2);
    assert.equal(diff.removed, 2);
    assert.equal(diff.left[4].changed, false);
    assert.deepEqual(
        diff.left[0].parts.filter((part) => part.changed).map((part) => part.text),
        ['current'],
    );
    assert.deepEqual(
        diff.right[0].parts.filter((part) => part.changed).map((part) => part.text),
        ['selected'],
    );
    assert.equal(
        diff.left.map((row) => row.parts.map((part) => part.text).join('')).join(''),
        before,
    );
    assert.equal(
        diff.right.map((row) => row.parts.map((part) => part.text).join('')).join(''),
        after,
    );
    const unified = service.unified('example-skill', before, after);
    assert.equal(unified.match(/^@@/gm).length, 2);
    assert.doesNotMatch(unified, /^[-+]stable$/m);
});

test('Unicode, repeated tokens, punctuation, insertion and newline-only edits preserve exact bytes', () => {
    const service = new SkillPanelDiffService();
    for (const [a, b] of [
        ['área área café.\r\n', 'área nova área café!\r\n'],
        ['<img src=x>\nlast', '<img src=x>\nlast\n'],
        ['a\nb\nc\n', 'a\ninsert\nb\nc\n'],
        ['', 'new\n'],
        ['old\n', ''],
        ['same\n', 'same\n'],
    ]) {
        const diff = service.compare(a, b);
        for (const [rows, expected] of [
            [diff.left, a],
            [diff.right, b],
        ])
            assert.equal(
                rows.map((row) => row.parts.map((part) => part.text).join('')).join(''),
                expected,
            );
    }
    assert.match(service.unified('example-skill', 'last', 'last\n'), /No newline at end of file/);
    assert.equal(
        service.compare('last', 'last\n').right[0].parts.find((part) => part.changed).text,
        '\n',
    );
});

test('work bounds disclose less precise highlighting without losing text or emitting unbounded rows', () => {
    const service = new SkillPanelDiffService();
    const a = Array.from({ length: 1100 }, (_, i) => `a${i}\n`).join('');
    const b = a.replaceAll('a', 'b');
    const diff = service.compare(a, b);
    assert.equal(diff.limited, true);
    assert.equal(diff.left.map((row) => row.text).join(''), a);
    assert.equal(service.compare('a\n'.repeat(5000), 'b\n'.repeat(5000)).left, null);
});
