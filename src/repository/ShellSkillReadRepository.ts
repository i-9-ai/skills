// SPDX-License-Identifier: Apache-2.0
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';

export type ShellSkillRead = { file: string; start?: number; end?: number };

/** Recognizes bounded literal reads, without executing or interpreting shell code. */
export class ShellSkillReadRepository {
    selection(command: unknown, cwd: string): ShellSkillRead | undefined {
        if (typeof command !== 'string' || command.length > 8192 || !command.isWellFormed()) return;
        const words = this.words(command);
        if (!words) return;
        if (words[0] === 'rtk' && words[1] === 'proxy') words.splice(0, 2);
        let filename: string | undefined;
        let start: number | undefined;
        let end: number | undefined;
        if (words[0] === 'cat') {
            if (words[1] === '--') words.splice(1, 1);
            if (words.length !== 2 || words[1]?.startsWith('-')) return;
            filename = words[1];
        } else if (words[0] === 'sed' && words[1] === '-n' && words.length === 4) {
            const range = /^([1-9]\d{0,5})(?:,([1-9]\d{0,5}))?p$/.exec(words[2]!);
            if (!range || words[3]?.startsWith('-')) return;
            start = Number(range[1]);
            end = Number(range[2] ?? range[1]);
            if (end < start) return;
            filename = words[3];
        }
        if (!filename || basename(filename) !== 'SKILL.md') return;
        return { file: resolve(cwd, filename), start, end };
    }

    /** Codex Bash post events carry raw output, not an exit-code object. */
    matches(selection: ShellSkillRead, output: unknown): boolean {
        if (
            typeof output !== 'string' ||
            Buffer.byteLength(output, 'utf8') > 1_048_576 ||
            !output.isWellFormed()
        )
            return false;
        const canonical = realpathSync(selection.file);
        const descriptor = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            const before = fstatSync(descriptor);
            if (!before.isFile() || before.size > 1_048_576) return false;
            const bytes = Buffer.alloc(before.size + 1);
            let length = 0;
            while (length < bytes.length) {
                const read = readSync(descriptor, bytes, length, bytes.length - length, null);
                if (!read) break;
                length += read;
            }
            const after = fstatSync(descriptor);
            if (
                length !== before.size ||
                after.size !== before.size ||
                after.mtimeMs !== before.mtimeMs ||
                after.ctimeMs !== before.ctimeMs ||
                realpathSync(selection.file) !== canonical
            )
                return false;
            const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
                bytes.subarray(0, length),
            );
            if (selection.start === undefined) return output === source && source.length > 0;
            const lines = source.split(/(?<=\n)/);
            const expected = lines.slice(selection.start - 1, selection.end).join('');
            return expected.length > 0 && output === expected;
        } finally {
            closeSync(descriptor);
        }
    }

    private words(command: string): string[] | undefined {
        const words: string[] = [];
        let word = '';
        let quote = '';
        let present = false;
        for (const character of command) {
            if (quote) {
                if (character === quote) {
                    quote = '';
                    continue;
                }
                if (quote === '"' && /[\\$`]/.test(character)) return;
                if (/[\r\n\0]/.test(character)) return;
                word += character;
                continue;
            }
            if (character === '"' || character === "'") {
                quote = character;
                present = true;
                continue;
            }
            if (/[\x00-\x1f\x7f\\;$`|&<>()[\]{}!*?#~]/.test(character)) return;
            if (/\s/.test(character)) {
                if (present) {
                    words.push(word);
                    word = '';
                    present = false;
                }
                continue;
            }
            present = true;
            word += character;
        }
        if (quote) return;
        if (present) words.push(word);
        return words;
    }
}
