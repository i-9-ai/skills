// SPDX-License-Identifier: Apache-2.0
import { execute } from '@oclif/core';

/** Start the single CLI. Help and argument errors are owned by oclif. */
export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
    await execute({ args, dir: import.meta.url });
}
