import assert from 'node:assert/strict';
import test from 'node:test';
import { publicSourceHostname } from '../../../.agents/skills/skill-authoring/scripts/lib/public-host.mjs';

test('provenance host policy rejects non-global literal ranges without resolving hosts', () => {
    const nonGlobal = [
        '0.0.0.0', '10.0.0.1', '100.64.0.1', '100.127.255.255', '127.0.0.1', '169.254.1.1', '172.31.255.255',
        '192.0.0.8', '192.0.0.11', '192.0.2.1', '192.88.99.2', '192.168.1.1', '198.19.255.255',
        '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255',
        '[::]', '[::1]', '[::ffff:8.8.8.8]', '[64:ff9b:1::1]', '[100::1]', '[100:0:0:1::1]',
        '[2001::1]', '[2001:2::1]', '[2001:10::1]', '[2001:db8::1]', '[2002::1]', '[3fff::1]',
        '[3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff]', '[5f00::1]', '[fc00::1]', '[fe80::1]', '[ff02::1]',
        'localhost', 'host.localhost.', 'host.local', 'internal',
    ];
    for (const host of nonGlobal) assert.equal(publicSourceHostname(new URL(`https://${host}/`).hostname), false, host);

    for (const host of ['example.org', 'example.org.', '8.8.8.8', '100.128.0.1', '192.0.0.9', '192.0.0.10', '192.0.1.1',
        '[2001:4860:4860::8888]', '[64:ff9b::808:808]', '[2001:1::1]', '[2001:3::1]', '[2001:4:112::1]', '[2001:20::1]', '[2001:30::1]', '[3fff:1000::1]']) {
        assert.equal(publicSourceHostname(new URL(`https://${host}/`).hostname), true, host);
    }
});
