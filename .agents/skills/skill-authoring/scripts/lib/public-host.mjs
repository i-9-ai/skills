/** Offline provenance policy; this does not resolve DNS or establish reachability. */
import { BlockList, isIP } from 'node:net';

// IANA special-purpose registries, checked 2026-09-29:
// https://www.iana.org/assignments/iana-ipv4-special-registry/
// https://www.iana.org/assignments/iana-ipv6-special-registry/
// Reject non-global and indeterminate entries, with explicit globally reachable
// exceptions. Keep multicast/reserved space outside ordinary public unicast.
const ipv4Excluded = subnets('ipv4', [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 3],
]);
const ipv6Public = subnets('ipv6', [['2000::', 3], ['64:ff9b::', 96]]);
const ipv6Excluded = subnets('ipv6', [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
]);
const ipv6Exceptions = subnets('ipv6', [
  ['2001:1::1', 128], ['2001:1::2', 128], ['2001:1::3', 128],
  ['2001:3::', 32], ['2001:4:112::', 48], ['2001:20::', 28], ['2001:30::', 28],
]);

function subnets(family, ranges) {
  const list = new BlockList();
  for (const [address, prefix] of ranges) list.addSubnet(address, prefix, family);
  return list;
}

/** Accept URL-normalized public hostnames and eligible public IP literals only. */
export function publicSourceHostname(hostname) {
  const host = hostname.replace(/^\[|\]$/gu, '').replace(/\.$/u, '').toLowerCase();
  const family = isIP(host);
  if (family === 4) {
    if (host === '192.0.0.9' || host === '192.0.0.10') return true;
    return !ipv4Excluded.check(host, 'ipv4');
  }
  if (family === 6) {
    if (ipv6Exceptions.check(host, 'ipv6')) return true;
    return ipv6Public.check(host, 'ipv6') && !ipv6Excluded.check(host, 'ipv6');
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'local' || host.endsWith('.local')) return false;
  const labels = host.split('.');
  return labels.length >= 2 && host.length <= 253 && labels.every(label =>
    label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label));
}
