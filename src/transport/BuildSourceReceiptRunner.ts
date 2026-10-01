// SPDX-License-Identifier: Apache-2.0
import { BuildSourceReceiptRepository } from '../repository/BuildSourceReceiptRepository.ts';

/** Internal post-compilation adapter; no public route or consumer-side effects. */
try {
    new BuildSourceReceiptRepository().capture();
} catch {
    process.stderr.write('Unable to create the bounded package source receipt.\n');
    process.exitCode = 1;
}
