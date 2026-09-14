// SPDX-License-Identifier: Apache-2.0
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { CollectionFilesystem, LIMITS, rejectTrackedScratch } from '../infrastructure/collection-filesystem.mjs';
import {
  CollectionValidationError, IGNORED_ROOT_NAMES, REPOSITORY_ALIASES,
  checkPublicHygiene, checkPublicHygieneBytes, validateCatalog, validateCollectionIcon, validateCollectionPng, validateLock,
} from '../domain/collection-policy.mjs';
import { checkCatalog } from '../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function validateRepository(path = DEFAULT_ROOT) {
  const root = new CollectionFilesystem(path);
  try {
    rejectTrackedScratch(root.path);
    const inventory = root.inventory({
      ignoredRootNames: IGNORED_ROOT_NAMES,
      allowedSymlinks: REPOSITORY_ALIASES,
    });
    for (const [relative, target] of Object.entries(REPOSITORY_ALIASES)) root.checkAlias(relative, target);
    const files = new Set(inventory.filter(([, info]) => info.isFile()).map(([path]) => path));
    const directories = new Set(inventory.filter(([, info]) => info.isDirectory()).map(([path]) => path));
    const { names, packages } = validateCatalog(root.readJson('skills-catalog.json'), files, directories);
    const packageInterfaces = new Map();
    for (const relative of packages) packageInterfaces.set(relative, root.validatePackage(relative).openai_interface);
    checkCatalog(root.path);
    const iconDigests = new Set();
    const pngDigests = new Set();
    for (const relative of packages) {
      const metadata = `${relative}/agents/openai.yaml`;
      const smallIcon = `${relative}/assets/icon.svg`;
      const largeIcon = `${relative}/assets/icon.png`;
      if (!files.has(metadata) || !files.has(smallIcon) || !files.has(largeIcon)) {
        throw new CollectionValidationError(`${relative} must include agents/openai.yaml, assets/icon.svg, and assets/icon.png`);
      }
      const openAi = packageInterfaces.get(relative);
      if (openAi?.icon_small !== './assets/icon.svg' || openAi.icon_large !== './assets/icon.png') {
        throw new CollectionValidationError(`${relative} must declare the required small SVG and large PNG icons`);
      }
      let svg;
      try { svg = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(root.readBytes(smallIcon, LIMITS.textBytes)); }
      catch { throw new CollectionValidationError(`${smallIcon} must be valid UTF-8`); }
      validateCollectionIcon(smallIcon, svg, iconDigests);
      const largePng = root.readBytes(largeIcon, LIMITS.artifactBytes);
      const pngDigest = createHash('sha256').update(largePng).digest('hex');
      if (pngDigests.has(pngDigest)) throw new CollectionValidationError(`${largeIcon} duplicates another skill icon`);
      pngDigests.add(pngDigest);
      validateCollectionPng(largeIcon, largePng);
    }
    let localLinks = 0;
    let textFiles = 0;
    const sorted = [...files].sort();
    const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    for (const relative of sorted) {
      const payload = root.readBytes(relative, LIMITS.artifactBytes);
      checkPublicHygieneBytes(relative, payload);
      let text;
      try { text = utf8.decode(payload); } catch { continue; }
      textFiles += 1;
      checkPublicHygiene(relative, text);
      if (relative.endsWith('.md')) {
        if (payload.length > LIMITS.textBytes) {
          throw new CollectionValidationError(`Markdown exceeds text limit: ${relative}`);
        }
        localLinks += root.checkMarkdown(relative, text);
      } else if (relative.endsWith('.html')) {
        localLinks += root.checkHtml(relative, text);
      }
    }
    const lockedSources = files.has('upstreams.lock.json') ? validateLock(root.readJson('upstreams.lock.json'), names) : 0;
    let exampleRuns = 0;
    for (const relative of sorted) {
      if (relative.endsWith('/run.json') && relative.includes('/examples/')) {
        root.validateExampleRun(relative);
        exampleRuns += 1;
      }
    }
    return { packages: packages.size, text_files: textFiles, local_links: localLinks,
      locked_sources: lockedSources, example_runs: exampleRuns };
  } finally {
    root.close();
  }
}
