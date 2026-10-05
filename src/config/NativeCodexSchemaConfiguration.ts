// SPDX-License-Identifier: Apache-2.0
// Exact selected schemas from the immutable official experimental export set.
export class NativeCodexSchemaConfiguration {
    static readonly identity = {
        source_commit: 'a956835d020762cb2b570053af06f643a11c0ecc',
        codex_version: '0.160.0',
        experimental_api: true,
        export_set: 'precomputed-experimental',
        source_export_sha256: '63028565f715c584c2dad98163de85dcb03801f9a7c096f5ef07d4769a900984',
        files: {
            'v1/InitializeParams.json':
                'b55124e7c0f36a1789396daa5578217a92be67f053903696236686e59f6f212e',
            'v1/InitializeResponse.json':
                '62ad689c2cb6379913c1d72749cfd8de5089d35760214123518eb92eef11acc9',
            'v2/AccountRateLimitsUpdatedNotification.json':
                '37326ef0364007be0c8f92bf5cd228941b513f87266edd566d694409b5aa5b8b',
            'v2/AccountUpdatedNotification.json':
                '268dba6977cc3adcced751a97367772a1e201a199c14f454741d851fe8bbacb1',
            'v2/AgentMessageDeltaNotification.json':
                '996e6c0ea65e57bed5a00f410b94381fe5ebf804333e5d00c2b6e6d47e5c55f6',
            'v2/ConfigBatchWriteParams.json':
                'd092c4412237735cdc9516b396ab1445f079e956cc10271be7c53f0d0e1e650e',
            'v2/ConfigWarningNotification.json':
                '533e713405b582cce4d772d0b4ebbc75e840f0fe71cedbb17c2c83da285a21d4',
            'v2/ConfigWriteResponse.json':
                '1d690287d9e8a0c552f664038d3810dfc3903ec8042eb2c0f772856414f59954',
            'v2/ErrorNotification.json':
                'ae1f4d6e0bb794211f28dc67b11885a1a0e0f8a198c6114b2ed27372f60a227c',
            'v2/GetAccountParams.json':
                '30b545275f60975b55bd6fbaafd70f15505801d14168ee82d3931b6e93c78aab',
            'v2/GetAccountResponse.json':
                '67ac3095b058a7d3c1627ff4dd9e52c8ee3c55f961cb1b980959ac15336d6827',
            'v2/HookCompletedNotification.json':
                '1f146d70303cea6e59752191179e36a273650d63a74d4f9338f9a399da6597d2',
            'v2/HookStartedNotification.json':
                '913ca61da2ab299d5f3318f6ea4d842d22708fc9308a9b10cdfad5e757098f2f',
            'v2/HooksListParams.json':
                '07638c3a8a3690cf368fa92c7ff697fdd0132865e8c59d53f6e5789e5a260053',
            'v2/HooksListResponse.json':
                '891dd10ef7f78e59631fce05fff2becddb8004b3c0338dbbbd6b4f17ef1fa64f',
            'v2/ItemCompletedNotification.json':
                'd04b9153de38cd8302a2a418a44a65e8265d4c7586d46ea2cc801b594c6acf5b',
            'v2/ItemStartedNotification.json':
                '7574788d2a352747f50d44be3ef649011cb8de8069da4c655faff14d0aee32c4',
            'v2/ListMcpServerStatusParams.json':
                '30b978c6502b37c9f0002aeba241f41c91d4c6adf0f92d89242b62ffde415a2d',
            'v2/ListMcpServerStatusResponse.json':
                '00c56c0faacbd4950b7f446f20b11b8a95456c5108de2f1e7366a1b2e60db8c6',
            'v2/McpResourceReadParams.json':
                '7ff0e4de6d70bd1c86b6d32ae781c9a841fee4d2e6d11eff8d8d0f224f7ad801',
            'v2/McpResourceReadResponse.json':
                'a48af749203ed3307414750d5070facb5ae6ef8b00253f1cfd9a8124bdfcfe41',
            'v2/McpServerStatusUpdatedNotification.json':
                'd6f4cb120b2363d321247592f03b9afbbf2762ad6d8af31b88c1b1bf39c4c7aa',
            'v2/McpServerToolCallParams.json':
                '7039a7583a1cbf38e9e0f5fe6398ff3711acd4d654b81b0be562514087fce6ba',
            'v2/McpServerToolCallResponse.json':
                '04a59b2064922c37b0c49bdb2470b8fff08d943e56dba4f7280a6b34bfa52c68',
            'v2/RemoteControlStatusChangedNotification.json':
                '56aa1d58294238557cd8b16199909c2c157a7542b9259ef2deddf40fe4c02c91',
            'v2/SkillsListParams.json':
                '1d245374e64c5acc9739dfc68a4fe5114c6c9147af04c480886f1846d2ca6239',
            'v2/SkillsListResponse.json':
                '230f125d6c36ec1b1514018a0bb6d0627f7308ea82f1ef04cad85490de482bae',
            'v2/ThreadStartParams.json':
                '80a40a7fac15b4bf70efb7f893fb353acc0a0d30c68f54aee4f01923deca85de',
            'v2/ThreadStartResponse.json':
                '92f5ddc37717b922de1dc0b0405e9a6d463f370554e2091610c6e595bc2616d4',
            'v2/ThreadStartedNotification.json':
                'f4c4acf11b4a71d72c19678583df1b5639561434b5156b12657951cda25cf0d1',
            'v2/ThreadStatusChangedNotification.json':
                '26f3c60c1b73f7fa2d31c74429cdc36f8746c76c33e3d314b3fb61d3661f05f6',
            'v2/ThreadTokenUsageUpdatedNotification.json':
                'aba4f6c7e4a19b2b842c08ee793b57000c07dafd57b922ad0d8e7c76609108c2',
            'v2/TurnCompletedNotification.json':
                '016870158603b0f84bd9f8f65f927161c9fd5128e5ec632087616462dc44e085',
            'v2/TurnStartParams.json':
                '07771223642e1b61bd9aac0069fc0f98143a1c047724ca02c7ceb13653442738',
            'v2/TurnStartResponse.json':
                '12c5151421bb061297c9790ff795a44aa4b9bdb91fbb68012dcf0a08cf4198b1',
            'v2/TurnStartedNotification.json':
                '2e9a109ee549c1e266223304c9e0580075cda03feb65473363b124f18e9a3769',
        },
    } as const;
}
