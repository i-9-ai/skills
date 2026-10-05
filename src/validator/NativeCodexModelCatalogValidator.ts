// SPDX-License-Identifier: Apache-2.0

/** Selected offline fixture preflight; this is not a complete upstream model-catalog validator. */
export class NativeCodexModelCatalogValidator {
    validate(raw: unknown): void {
        const catalog = raw as { models?: Array<Record<string, unknown>> } | null;
        if (!catalog || !Array.isArray(catalog.models) || catalog.models.length !== 1)
            throw new Error('fixture_model_catalog');
        const model = catalog.models[0];
        if (
            !model ||
            typeof model !== 'object' ||
            Array.isArray(model) ||
            model.slug !== 'native-pilot-fixture' ||
            model.shell_type !== 'disabled' ||
            model.apply_patch_tool_type !== null ||
            !Array.isArray(model.experimental_supported_tools) ||
            model.experimental_supported_tools.length !== 0
        )
            throw new Error('fixture_model_capabilities');
        // Pinned upstream ModelsResponse rejects a catalog model when both instruction forms are absent.
        // This recipe deliberately selects the documented legacy top-level form with original fixture text.
        if (
            typeof model.base_instructions !== 'string' ||
            model.base_instructions.trim().length === 0 ||
            Buffer.byteLength(model.base_instructions) > 4096
        )
            throw new Error('fixture_model_instructions');
    }
}
