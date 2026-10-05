// SPDX-License-Identifier: Apache-2.0
// Exact DDL and ledger identities independently derived from frozen issued A/B SQL.
const migrations = [
    {
        version: 1,
        checksum: '1ba72ecd68d789c51d40273debd3bf44201cc668225f1f7e4188bbe6e914f836',
    },
    {
        version: 2,
        checksum: '135cd6d9c7f255e209d4290498db19f7c31173e63eaac097437e0160bec41447',
    },
    {
        version: 3,
        checksum: '6699a82f2f6efe65f8e99824e70ca746ba779769a2065eb21cf61fac471c71a9',
    },
    {
        version: 4,
        checksum: '0a32f907ceb2cd1ac5214a9d8e72723274a7575cd7c3c9a622caf9c36c3e33b3',
    },
];
const definitions = [
    {
        version: 3,
        type: 'table',
        name: 'catalog_changes',
        sql_sha256: 'abbf70c9a3acb56274859a66bec1c79b5f3d6a108c3a71ee69dd8966f8100b20',
    },
    {
        version: 3,
        type: 'table',
        name: 'catalog_members',
        sql_sha256: 'd7bf4ce36ded5a640ae7dea505d320e33dff4deb45c8466569a3de2ca558de39',
    },
    {
        version: 3,
        type: 'index',
        name: 'catalog_observation_collection',
        sql_sha256: '84d7968f4a52afc5c864c868f5ad84b83cec90aa3a5951cca15f36e419d134d9',
    },
    {
        version: 3,
        type: 'index',
        name: 'catalog_observation_period',
        sql_sha256: '88d1f07609185b967ac65b217b6628d86b7adedcc2e4bb188f7e99b55e2e571c',
    },
    {
        version: 3,
        type: 'table',
        name: 'catalog_observations',
        sql_sha256: '2a82774a7ebb0142c61cbdd2126cc18885c44cb85e8df669b0722d496418f9f8',
    },
    {
        version: 3,
        type: 'index',
        name: 'lifecycle_activation',
        sql_sha256: '09bfd6c3e9ef6481d6bc59f14b5aee21c31776af17083bf628849740295b355d',
    },
    {
        version: 3,
        type: 'index',
        name: 'lifecycle_attempt',
        sql_sha256: 'f67424b0b3fc4e2a7d505d917953cbcbe5a0a37cdee2390930e601a08f2990a6',
    },
    {
        version: 3,
        type: 'index',
        name: 'lifecycle_collection_period',
        sql_sha256: '33421d03c864ccecb72b361c22ba32a54a80676e799f59e88b886e6ba78904f7',
    },
    {
        version: 3,
        type: 'table',
        name: 'lifecycle_events',
        sql_sha256: '3faed5041c28025f1b3377bb51b76ddfb0530063ea150d3a0bd94713a1ff9c7f',
    },
    {
        version: 3,
        type: 'index',
        name: 'lifecycle_named_period',
        sql_sha256: '45c4520c0b436dbae965eed48543b740c4b5c7fc9a516d51d4967c6459b55962',
    },
    {
        version: 3,
        type: 'index',
        name: 'lifecycle_period',
        sql_sha256: '43129478f801dbd00a18a8aba211ab5b30b27a84d31f45c09a53243fb698666f',
    },
    {
        version: 3,
        type: 'index',
        name: 'lifecycle_skill_period',
        sql_sha256: '1bda805c2bea04cc4ce776b7ba14be834de5c51dce8cf0a8a6673b0daedce914',
    },
    {
        version: 4,
        type: 'index',
        name: 'quality_collection_period',
        sql_sha256: 'ddbb2e56d6fe77d13b3c589169de750bbd8b3bde82efc412d1bd993655903da7',
    },
    {
        version: 4,
        type: 'index',
        name: 'quality_identity_period',
        sql_sha256: 'e89f225763ce8fe717499fedea69c05181dd0e1e7439f8a41ed77e5a4ecaf17e',
    },
    {
        version: 4,
        type: 'index',
        name: 'quality_kind_period',
        sql_sha256: '03aedb36ce753f9c80c655a10b68e355b4b1811c2e9ed9169e2762071fcb6080',
    },
    {
        version: 4,
        type: 'index',
        name: 'quality_period',
        sql_sha256: 'ef42a1b1f2de637eacca83661a4d60f58744b1faeae73a2647e9bd66bf19b48d',
    },
    {
        version: 4,
        type: 'table',
        name: 'quality_receipts',
        sql_sha256: '75999e4182cd13126e0e7f7d1ee91dccff2fcb1d37d88f51bbc0659996c3a2e0',
    },
    {
        version: 4,
        type: 'index',
        name: 'quality_skill_period',
        sql_sha256: 'ffc32b852ba91f0277818826e4c5e89114e983e10c45a60a2d59ffbb44c03b3a',
    },
    {
        version: 4,
        type: 'index',
        name: 'quality_source_period',
        sql_sha256: '5de02160ad9b58b93f5762f03bc4055713af1ea683bc66aa3da53502b78202af',
    },
    {
        version: 2,
        type: 'table',
        name: 'usage_events',
        sql_sha256: 'e657c1348b0b26fd6919ed48d3a5395807cf6eb5048649fba3b0c037a9f79859',
    },
    {
        version: 2,
        type: 'index',
        name: 'usage_events_period',
        sql_sha256: '15b9b9413e46596c5c5f333262e6e31060a35a726837924b6d030c0f92e186be',
    },
    {
        version: 1,
        type: 'table',
        name: 'usage_migrations',
        sql_sha256: '995473b5cd7a70089b3b9eb2d836a67116025d6bbac147f4fabd682b231c1944',
    },
    {
        version: 1,
        type: 'index',
        name: 'usage_period',
        sql_sha256: '37e209bcf58efc3145d8869850bf69465268af04a721665eecf570dc923f4f0a',
    },
    {
        version: 1,
        type: 'table',
        name: 'usage_reads',
        sql_sha256: '98549959d6ad827501d6caa1820f334756d4b66cbf7f8d2e9b33b273685cad22',
    },
];
export interface NativePilotStateDefinition {
    type: string;
    name: string;
    sql_sha256: string;
}

/** Supports only actual complete A3/B4 SQL definitions; copied ledgers alone never establish support. */
export class NativePilotStateSchemaValidator {
    schemaVersion(actual: NativePilotStateDefinition[]): 3 | 4 {
        const ordered = [...actual].sort((a, b) =>
            a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
        );
        for (const version of [3, 4] as const) {
            const expected = definitions
                .filter((row) => row.version <= version)
                .map(({ version, ...row }) => row);
            if (JSON.stringify(ordered) === JSON.stringify(expected)) return version;
        }
        throw new Error('state_unknown_sql_definitions');
    }
    validate(
        applied: Array<{ version: number; checksum: string }>,
        actual: NativePilotStateDefinition[],
    ): void {
        if (
            ![3, 4].includes(applied.length) ||
            applied.some(
                (row, index) =>
                    row.version !== migrations[index].version ||
                    row.checksum !== migrations[index].checksum,
            )
        )
            throw new Error('state_unknown_migrations');
        if (this.schemaVersion(actual) !== applied.length)
            throw new Error('state_schema_ledger_mismatch');
    }
}
