import { createHash } from 'node:crypto';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import {
    fields,
    strictJson,
    relativeParts,
    requireCondition,
    SHA256,
} from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';

/** Verify the reviewed source/artifact pair before publishing a visual guide. */
export class VisualGuideRepository {
    verify(directory: string): { guides: number } {
        const root = new SafeRoot(directory);
        try {
            const receipt = fields(
                strictJson(root.readBytes('docs/diagrams/visual-guides.lock.json', 262144)),
                ['schema_version', 'guides'],
                'visual guide receipt',
            );
            requireCondition(
                receipt.schema_version === 1,
                'unsupported visual guide receipt version',
            );
            requireCondition(
                Array.isArray(receipt.guides) &&
                    receipt.guides.length > 0 &&
                    receipt.guides.length <= 64,
                'visual guide receipt requires 1-64 guides',
            );
            const artifacts = new Set();

            for (const item of receipt.guides) {
                const guide = fields(
                    item,
                    [
                        'source',
                        'artifact',
                        'source_sha256',
                        'artifact_sha256',
                        'generator',
                        'reviewed_on',
                    ],
                    'visual guide',
                );
                relativeParts(guide.source);
                relativeParts(guide.artifact);
                requireCondition(
                    guide.source.startsWith('docs/diagrams/') && guide.source.endsWith('.json'),
                    'guide source must be a diagram JSON file',
                );
                requireCondition(
                    guide.artifact.startsWith('docs/assets/') && guide.artifact.endsWith('.html'),
                    'guide artifact must be an HTML asset',
                );
                requireCondition(!artifacts.has(guide.artifact), 'duplicate visual guide artifact');
                artifacts.add(guide.artifact);
                requireCondition(
                    typeof guide.generator === 'string' &&
                        guide.generator.length > 0 &&
                        guide.generator.length <= 128,
                    'guide generator identity is required',
                );
                const reviewedOn =
                    typeof guide.reviewed_on === 'string' &&
                    /^\d{4}-\d{2}-\d{2}$/.test(guide.reviewed_on)
                        ? new Date(`${guide.reviewed_on}T00:00:00Z`)
                        : new Date(NaN);
                requireCondition(
                    !Number.isNaN(reviewedOn.valueOf()) &&
                        reviewedOn.toISOString().slice(0, 10) === guide.reviewed_on,
                    'guide review date must be a valid calendar date in YYYY-MM-DD form',
                );

                for (const [name, limit] of [
                    ['source', 1048576],
                    ['artifact', 4194304],
                ] as const) {
                    requireCondition(
                        SHA256.test(guide[`${name}_sha256`]),
                        'guide digest must be SHA-256',
                    );
                    const actual = createHash('sha256')
                        .update(root.readBytes(guide[name], limit))
                        .digest('hex');
                    requireCondition(
                        actual === guide[`${name}_sha256`],
                        `visual guide ${name} changed after review; regenerate and review the source/artifact pair`,
                    );
                }
            }
            const assets = new SafeRoot(root.inspect('docs/assets').absolute);
            try {
                for (const [relative, info] of assets.inventory()) {
                    if (!info.isFile() || !/\.html?$/iu.test(relative) || relative === 'index.html')
                        continue;
                    requireCondition(
                        artifacts.has(`docs/assets/${relative}`),
                        'publishable HTML guide is missing from the reviewed receipt',
                    );
                }
            } finally {
                assets.close();
            }
            return { guides: receipt.guides.length };
        } finally {
            root.close();
        }
    }
}
