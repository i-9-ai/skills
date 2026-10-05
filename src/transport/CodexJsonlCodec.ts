// SPDX-License-Identifier: Apache-2.0
/** Strict bounded JSON, including duplicate-key and invalid Unicode rejection. */
export class CodexJsonlCodec {
    private pending = Buffer.alloc(0);
    private total = 0;
    private frames = 0;
    static readonly frameBytes = 1_048_576;
    static readonly totalBytes = 8_388_608;
    static readonly frameCount = 512;

    push(bytes: Uint8Array): unknown[] {
        this.total += bytes.byteLength;
        if (this.total > CodexJsonlCodec.totalBytes) throw new Error('protocol_total_bound');
        this.pending = Buffer.concat([this.pending, bytes]);
        const values: unknown[] = [];
        for (;;) {
            const newline = this.pending.indexOf(10);
            if (newline < 0) break;
            if (newline === 0 || newline > CodexJsonlCodec.frameBytes)
                throw new Error('protocol_frame_bound');
            const frame = this.pending.subarray(0, newline);
            this.pending = this.pending.subarray(newline + 1);
            if (++this.frames > CodexJsonlCodec.frameCount) throw new Error('protocol_frame_count');
            values.push(CodexJsonlCodec.json(frame));
        }
        if (this.pending.length > CodexJsonlCodec.frameBytes)
            throw new Error('protocol_frame_bound');
        return values;
    }

    finish(): void {
        if (this.pending.length !== 0) throw new Error('protocol_truncated_frame');
    }

    static encode(value: unknown): Uint8Array {
        const bytes = Buffer.from(JSON.stringify(value) + '\n');
        if (bytes.length > this.frameBytes) throw new Error('protocol_frame_bound');
        this.json(bytes.subarray(0, -1));
        return bytes;
    }

    static json(bytes: Uint8Array): unknown {
        if (bytes.byteLength === 0 || bytes.byteLength > this.frameBytes)
            throw new Error('json_byte_bound');
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        let at = 0;
        let nodes = 0;
        const whitespace = () => {
            while (/^[\t\n\r ]$/.test(text[at] ?? '')) at++;
        };
        const string = (): string => {
            const start = at++;
            while (at < text.length) {
                const char = text[at++];
                if (char === '\\') {
                    at++;
                    continue;
                }
                if (char !== '"') continue;
                const value = JSON.parse(text.slice(start, at)) as string;
                if (
                    value.length > 524_288 ||
                    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
                        value,
                    )
                )
                    throw new Error('json_string_bound');
                return value;
            }
            throw new Error('json_unterminated_string');
        };
        const value = (depth: number): unknown => {
            if (depth > 48 || ++nodes > 32_768) throw new Error('json_structure_bound');
            whitespace();
            const char = text[at];
            if (char === '"') return string();
            if (char === '{') {
                at++;
                const output: Record<string, unknown> = Object.create(null);
                whitespace();
                if (text[at] === '}') {
                    at++;
                    return output;
                }
                for (;;) {
                    whitespace();
                    if (text[at] !== '"') throw new Error('json_object_key');
                    const key = string();
                    if (Object.hasOwn(output, key)) throw new Error('json_duplicate_key');
                    whitespace();
                    if (text[at++] !== ':') throw new Error('json_object_colon');
                    output[key] = value(depth + 1);
                    whitespace();
                    const separator = text[at++];
                    if (separator === '}') return output;
                    if (separator !== ',') throw new Error('json_object_separator');
                }
            }
            if (char === '[') {
                at++;
                const output: unknown[] = [];
                whitespace();
                if (text[at] === ']') {
                    at++;
                    return output;
                }
                for (;;) {
                    if (output.length >= 4096) throw new Error('json_array_bound');
                    output.push(value(depth + 1));
                    whitespace();
                    const separator = text[at++];
                    if (separator === ']') return output;
                    if (separator !== ',') throw new Error('json_array_separator');
                }
            }
            const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
                text.slice(at),
            );
            if (!match) throw new Error('json_value');
            at += match[0].length;
            const parsed = JSON.parse(match[0]) as unknown;
            if (typeof parsed === 'number' && !Number.isFinite(parsed))
                throw new Error('json_number');
            return parsed;
        };
        const output = value(0);
        whitespace();
        if (at !== text.length) throw new Error('json_trailing_bytes');
        return output;
    }
}
