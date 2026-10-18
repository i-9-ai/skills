// SPDX-License-Identifier: Apache-2.0
import { BuildSourceReceiptRepository } from '../repository/BuildSourceReceiptRepository.ts';
import { PluginPanelRuntimeRepository } from '../repository/PluginPanelRuntimeRepository.ts';
import { PluginArtifactRepository } from '../repository/PluginArtifactRepository.ts';
import { ProjectConfiguration } from '../config/ProjectConfiguration.ts';
import { fileURLToPath } from 'node:url';

/** Internal post-compilation adapter; no public route or consumer-side effects. */
try {
    new BuildSourceReceiptRepository().capture();
    const configuration = new ProjectConfiguration({
        root: fileURLToPath(new URL('../../', import.meta.url)),
    });
    new PluginPanelRuntimeRepository().capture(
        configuration,
        new PluginArtifactRepository().read(configuration).files,
    );
} catch {
    process.stderr.write('Unable to create the bounded package source receipt.\n');
    process.exitCode = 1;
}
