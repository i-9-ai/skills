// SPDX-License-Identifier: Apache-2.0
type Edit = { kind: 'equal' | 'removed' | 'added'; text: string };
type Part = { text: string; changed: boolean };
type Row = { line: number; text: string; changed: boolean; parts: Part[] };

/** Bounded exact text projection; presentation never normalizes the approved bytes. */
export class SkillPanelDiffService {
    private budget = 1_048_576;
    private limited = false;

    compare(before: string, after: string) {
        this.budget = 1_048_576;
        this.limited = false;
        const lines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
        const edits = this.match(lines(before), lines(after));
        const left: Row[] = [];
        const right: Row[] = [];
        for (let index = 0; index < edits.length;) {
            const edit = edits[index];
            if (edit.kind === 'equal') {
                left.push(this.row(left.length + 1, edit.text, false));
                right.push(this.row(right.length + 1, edit.text, false));
                index++;
                continue;
            }
            const removed: string[] = [];
            const added: string[] = [];
            while (index < edits.length && edits[index].kind !== 'equal') {
                const item = edits[index++];
                (item.kind === 'removed' ? removed : added).push(item.text);
            }
            for (let offset = 0; offset < Math.max(removed.length, added.length); offset++) {
                const a = removed[offset];
                const b = added[offset];
                const tokens = (text: string) =>
                    text.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? [];
                const words =
                    a !== undefined && b !== undefined ? this.match(tokens(a), tokens(b)) : null;
                if (a !== undefined)
                    left.push(
                        this.row(
                            left.length + 1,
                            a,
                            true,
                            words?.filter((part) => part.kind !== 'added'),
                        ),
                    );
                if (b !== undefined)
                    right.push(
                        this.row(
                            right.length + 1,
                            b,
                            true,
                            words?.filter((part) => part.kind !== 'removed'),
                        ),
                    );
            }
        }
        const plain =
            left.length > 4096 ||
            right.length > 4096 ||
            Buffer.byteLength(JSON.stringify({ left, right })) > 262_144;
        return {
            left: plain ? null : left,
            right: plain ? null : right,
            added: right.filter((row) => row.changed).length,
            removed: left.filter((row) => row.changed).length,
            limited: this.limited,
            edits,
        };
    }

    unified(skill: string, before: string, after: string): string {
        const { edits } = this.compare(before, after);
        const changed = edits.flatMap((edit, index) => (edit.kind === 'equal' ? [] : [index]));
        const ranges: [number, number][] = [];
        for (const index of changed) {
            const from = Math.max(0, index - 3);
            const to = Math.min(edits.length, index + 4);
            const last = ranges.at(-1);
            if (last && from <= last[1]) last[1] = Math.max(last[1], to);
            else ranges.push([from, to]);
        }
        const output = [`--- a/${skill}/SKILL.md`, `+++ b/${skill}/SKILL.md`];
        for (const [from, to] of ranges) {
            const prior = edits.slice(0, from);
            const hunk = edits.slice(from, to);
            const oldStart = prior.filter((edit) => edit.kind !== 'added').length;
            const newStart = prior.filter((edit) => edit.kind !== 'removed').length;
            const oldCount = hunk.filter((edit) => edit.kind !== 'added').length;
            const newCount = hunk.filter((edit) => edit.kind !== 'removed').length;
            output.push(
                `@@ -${oldCount ? oldStart + 1 : oldStart},${oldCount} +${newCount ? newStart + 1 : newStart},${newCount} @@`,
            );
            for (const edit of hunk) {
                const prefix = { equal: ' ', removed: '-', added: '+' }[edit.kind];
                output.push(
                    prefix + (edit.text.endsWith('\n') ? edit.text.slice(0, -1) : edit.text),
                );
                if (!edit.text.endsWith('\n')) output.push('\\ No newline at end of file');
            }
        }
        return output.join('\n') + '\n';
    }

    private row(line: number, text: string, changed: boolean, edits?: Edit[]): Row {
        const parts: Part[] = [];
        for (const edit of edits ?? [{ text, kind: changed ? 'added' : 'equal' }]) {
            const marked = edit.kind !== 'equal';
            const prior = parts.at(-1);
            if (prior && prior.changed === marked) prior.text += edit.text;
            else parts.push({ text: edit.text, changed: marked });
        }
        return { line, text, changed, parts };
    }

    private match(left: string[], right: string[]): Edit[] {
        let start = 0;
        while (start < left.length && start < right.length && left[start] === right[start]) start++;
        let end = 0;
        while (
            end < left.length - start &&
            end < right.length - start &&
            left.at(-1 - end) === right.at(-1 - end)
        )
            end++;
        const a = left.slice(start, left.length - end);
        const b = right.slice(start, right.length - end);
        const prefix: Edit[] = left.slice(0, start).map((text) => ({ kind: 'equal', text }));
        const suffix: Edit[] = end ? left.slice(-end).map((text) => ({ kind: 'equal', text })) : [];
        const cells = (a.length + 1) * (b.length + 1);
        if (!a.length || !b.length || cells > this.budget) {
            if (a.length && b.length) this.limited = true;
            return [
                ...prefix,
                ...a.map((text): Edit => ({ kind: 'removed', text })),
                ...b.map((text): Edit => ({ kind: 'added', text })),
                ...suffix,
            ];
        }
        this.budget -= cells;
        const width = b.length + 1;
        const table = new Uint32Array(cells);
        for (let i = a.length - 1; i >= 0; i--)
            for (let j = b.length - 1; j >= 0; j--)
                table[i * width + j] =
                    a[i] === b[j]
                        ? table[(i + 1) * width + j + 1] + 1
                        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
        let i = 0;
        let j = 0;
        const middle: Edit[] = [];
        while (i < a.length || j < b.length) {
            if (i < a.length && j < b.length && a[i] === b[j]) {
                middle.push({ kind: 'equal', text: a[i++] });
                j++;
                continue;
            }
            if (
                i < a.length &&
                (j === b.length || table[(i + 1) * width + j] >= table[i * width + j + 1])
            ) {
                middle.push({ kind: 'removed', text: a[i++] });
                continue;
            }
            middle.push({ kind: 'added', text: b[j++] });
        }
        return [...prefix, ...middle, ...suffix];
    }
}
