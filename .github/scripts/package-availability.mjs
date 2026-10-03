// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    PackageAvailabilityError,
    PackageAvailabilityRepository,
} from '../../src/repository/PackageAvailabilityRepository.ts';

export async function main(
    publishedPackages = process.env.PUBLISHED_PACKAGES,
    manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')),
    repository = new PackageAvailabilityRepository(),
) {
    return repository.verifyPublished(publishedPackages, manifest);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    try {
        console.log(JSON.stringify(await main()));
    } catch (error) {
        console.error(
            JSON.stringify({
                status:
                    error instanceof PackageAvailabilityError &&
                    error.code === 'availability_timeout'
                        ? 'timeout'
                        : 'rejected',
                installed_runtime: 'not_checked',
                error:
                    error instanceof PackageAvailabilityError
                        ? {
                              code: error.code,
                              message: error.message,
                              attempts: error.attempts,
                              elapsed_ms: error.elapsedMs,
                              last_observation: error.lastObservation,
                          }
                        : {
                              code: 'probe_failed',
                              message: 'Availability probe inputs or runtime could not be read.',
                          },
            }),
        );
        process.exitCode = 1;
    }
}
