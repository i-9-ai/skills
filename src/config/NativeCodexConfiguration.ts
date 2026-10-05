// SPDX-License-Identifier: Apache-2.0
import { posix } from 'node:path';
/** Fixed argv shared by the coordinator and its confined process boundary. */
export class NativeCodexConfiguration {
    /** Normal home of the fixed disposable image account, never a host-profile override. */
    static readonly accountHome = posix.join('/', 'home', 'node');
    static readonly assetRoot = '/pilot/input/observer/assets/native-pilot/codex';
    static readonly modelCatalog = `${this.assetRoot}/fixture-models.json`;
    static readonly schemaRoot = `${this.assetRoot}/schemas`;

    static argv(baseUrl: string): string[] {
        if (
            !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/v1$/.test(baseUrl) ||
            Number(new URL(baseUrl).port) > 65535
        )
            throw new Error('fixture_endpoint');
        const config = {
            model: 'native-pilot-fixture',
            model_provider: 'native_pilot',
            model_catalog_json: NativeCodexConfiguration.modelCatalog,
            web_search: 'disabled',
            'analytics.enabled': false,
            'model_providers.native_pilot.name': 'Disposable loopback fixture',
            'model_providers.native_pilot.base_url': baseUrl,
            'model_providers.native_pilot.wire_api': 'responses',
            'model_providers.native_pilot.requires_openai_auth': false,
            'model_providers.native_pilot.supports_websockets': false,
            'model_providers.native_pilot.request_max_retries': 0,
            'model_providers.native_pilot.stream_max_retries': 0,
            'model_providers.native_pilot.stream_idle_timeout_ms': 5000,
        };
        return [
            'app-server',
            '--stdio',
            '--strict-config',
            ...Object.entries(config).flatMap(([key, value]) => [
                '-c',
                `${key}=${JSON.stringify(value)}`,
            ]),
        ];
    }
}
