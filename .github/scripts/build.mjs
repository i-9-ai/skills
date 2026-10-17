// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const compiler = require.resolve('typescript/bin/tsc');
const options = { cwd: root, stdio: 'inherit' };

execFileSync(process.execPath, [compiler, '--noEmit'], options);
rmSync(join(root, 'dist'), { recursive: true, force: true });
execFileSync(process.execPath, [compiler, '--project', 'tsconfig.build.json'], options);
execFileSync(process.execPath, [join(root, 'dist/transport/BuildSourceReceiptRunner.js')], options);
