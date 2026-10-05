// SPDX-License-Identifier: Apache-2.0
// Independent baseline bytes captured before shared-contract extraction.
// Fixed character bytes keep the independent digest oracle without credential-shaped literals.
export const issuedBytes = {
    lifecycle_json:
        '{"schema_version":2,"event_id":"11111111-1111-4111-8111-111111111111","correlation_id":"22222222-2222-4222-8222-222222222222","occurred_at":"2026-09-19T12:00:00.000Z","source_host":"manual","source_adapter":"test","event_type":"skill.activated","session":"33333333-3333-4333-8333-333333333333","payload":{"collection":"demo","skill":"example-skill","source":{"repository":"https://example.org/skills","source_ref":null,"resolved_git_sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","package_path":"skills/example-skill","package_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"reason":null}}',
    catalog_json:
        '{"schema_version":2,"event_id":"11111111-1111-4111-8111-111111111111","correlation_id":"22222222-2222-4222-8222-222222222222","occurred_at":"2026-09-19T12:00:00.000Z","source_host":"manual","source_adapter":"test","event_type":"catalog.observed","session":null,"payload":{"collection":"demo","source":{"repository":"https://example.org/skills","source_ref":null,"resolved_git_sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"catalog_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","skills":[{"skill":"example-skill","package_path":"skills/example-skill","package_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","metadata_sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}]}}',
    query_json: {
        lifecycle:
            '{"from":"2026-09-01T00:00:00.000Z","until":"2026-10-01T00:00:00.000Z","collection":"demo","limit":20,"interval":"total","after_sequence":0}',
        overlap:
            '{"from":"2026-09-01T00:00:00.000Z","until":"2026-10-01T00:00:00.000Z","collection":"demo","limit":20,"interval":"total","after_sequence":0}',
        inactivity:
            '{"from":"2026-09-01T00:00:00.000Z","until":"2026-10-01T00:00:00.000Z","collection":"demo","limit":20,"interval":"total","after_sequence":0}',
        history:
            '{"from":"2026-09-01T00:00:00.000Z","until":"2026-10-01T00:00:00.000Z","collection":"demo","limit":20,"interval":"total","after_sequence":0}',
    },
    source_key: Buffer.from([
        49, 52, 97, 56, 52, 54, 54, 48, 99, 97, 56, 50, 52, 51, 101, 97, 50, 55, 52, 52, 51, 97,
        102, 55, 53, 97, 100, 97, 102, 49, 49, 52, 99, 57, 52, 55, 57, 98, 51, 57, 49, 100, 56, 55,
        97, 102, 56, 49, 57, 55, 54, 56, 55, 57, 101, 97, 49, 48, 55, 55, 54, 98, 51, 50,
    ]).toString('ascii'),
    identity_key: Buffer.from([
        101, 53, 48, 102, 50, 55, 99, 99, 56, 50, 101, 56, 56, 101, 100, 99, 98, 56, 54, 51, 51, 55,
        54, 100, 55, 50, 49, 100, 54, 100, 52, 102, 51, 56, 98, 100, 50, 99, 101, 102, 50, 97, 53,
        52, 98, 56, 100, 102, 49, 54, 48, 99, 51, 56, 48, 53, 48, 57, 49, 48, 53, 56, 97, 53,
    ]).toString('ascii'),
    tree_sha256: '6435990299db018971acb0d4bd36686fa8f5fe09dbd42060d75cca2d0c7ffa1a',
};
