// SPDX-License-Identifier: Apache-2.0
import type {
    NativePilotContract,
    NativePilotSelection,
} from '../config/NativePilotConfiguration.ts';
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';
import { createHash } from 'node:crypto';

export interface NativePilotContainerPin {
    schema_version: 1;
    docker: { executable: string; sha256: string; endpoint: string };
    image: {
        kind: 'registry' | 'local-derived';
        reference: string;
        id: string;
        platform: 'linux/arm64' | 'linux/amd64';
        rootfs_layers: string[];
        config_sha256: string;
        build: null | {
            receipt_path: string;
            receipt_sha256: string;
            dockerfile_path: string;
            dockerfile_sha256: string;
            base_reference: string;
            base_id: string;
        };
    };
    account: { name: string; uid: number; gid: number; home: string; seed_sha256: string };
}

export interface NativePilotContainerIdentity {
    selection: NativePilotSelection;
    nonce: string;
    name: string;
    labels: Record<string, string>;
    volumes: Record<'home' | 'state' | 'work' | 'native-output', string>;
    mount: string;
}

export const containerLimits = Object.freeze({
    control_ms: 10_000,
    probe_ms: 30_000,
    kill_ms: 10_000,
    output_bytes: 1_048_576,
    worker_output_bytes: 8_388_608,
    retention_file_bytes: NativePilotConfiguration.retention.file_bytes,
    retention_bytes: NativePilotConfiguration.retention.raw_bytes,
    retention_output: NativePilotConfiguration.retention.encoded_bytes,
    retention_entries: 20_000,
    memory: 2_147_483_648,
    nano_cpus: 2_000_000_000,
    pids: 256,
});
export const containerPath = Object.freeze({
    root: '/pilot',
    worker: `/pilot/input/driver/${NativePilotConfiguration.entrypoint('NativePilotContainerWorkerRunner')}`,
    request: '/pilot/control/worker.json',
    node: '/pilot/runtime-bin/node',
    consumer: '/pilot/consumer',
    path: '/pilot/runtime-bin:/usr/local/bin:/usr/bin:/bin',
});
const hash = /^[a-f0-9]{64}$/;
const absolute = (v: unknown): v is string =>
    typeof v === 'string' &&
    /^\/(?!\/)[^\x00-\x1f\x7f,]*$/.test(v) &&
    !v.split('/').some((p) => p === '..' || p === '.') &&
    !v.endsWith('/');
export function containerRecord(value: unknown): Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Expected object.');
    return value as Record<string, any>;
}
const exact = (value: unknown, keys: string[]) => {
    const r = containerRecord(value);
    if (Object.keys(r).sort().join(',') !== [...keys].sort().join(','))
        throw new Error('Unexpected fields.');
    return r;
};
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function canonicalContainerDigest(value: unknown): string {
    const normalize = (v: unknown): unknown =>
        Array.isArray(v)
            ? v.map(normalize)
            : v && typeof v === 'object'
              ? Object.fromEntries(
                    Object.entries(v)
                        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                        .map(([k, item]) => [k, normalize(item)]),
                )
              : v;
    return createHash('sha256')
        .update(JSON.stringify(normalize(value)))
        .digest('hex');
}
export const requireContainer = (condition: unknown, reason: string): void => {
    if (!condition) throw new Error(reason);
};

/** Closed pins and independently measured controls. No command-flag-only success. */
export class NativePilotContainerValidator {
    pin(input: unknown, contract: NativePilotContract): NativePilotContainerPin {
        const p = exact(input, ['schema_version', 'docker', 'image', 'account']);
        const d = exact(p.docker, ['executable', 'sha256', 'endpoint']);
        const i = exact(p.image, [
            'kind',
            'reference',
            'id',
            'platform',
            'rootfs_layers',
            'config_sha256',
            'build',
        ]);
        const a = exact(p.account, ['name', 'uid', 'gid', 'home', 'seed_sha256']);
        requireContainer(
            p.schema_version === 1 && contract.authority.lane === 'local-container',
            'Local container scope required.',
        );
        requireContainer(
            absolute(d.executable) &&
                hash.test(d.sha256) &&
                typeof d.endpoint === 'string' &&
                d.endpoint.startsWith('unix://') &&
                absolute(d.endpoint.slice(7)),
            'Pinned local Unix Docker endpoint required.',
        );
        requireContainer(
            /^sha256:[a-f0-9]{64}$/.test(i.id) &&
                i.platform === contract.authority.platform &&
                hash.test(i.config_sha256) &&
                Array.isArray(i.rootfs_layers) &&
                i.rootfs_layers.length > 0 &&
                i.rootfs_layers.length <= 64 &&
                i.rootfs_layers.every(
                    (layer: unknown) =>
                        typeof layer === 'string' && /^sha256:[a-f0-9]{64}$/.test(layer),
                ),
            'Immutable matching image config and layers required.',
        );
        const registry = (reference: unknown) =>
            typeof reference === 'string' &&
            /^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(reference);
        if (i.kind === 'registry')
            requireContainer(
                registry(i.reference) && i.build === null,
                'Registry image requires an actual immutable repository digest.',
            );
        else {
            requireContainer(
                i.kind === 'local-derived' && i.reference === i.id,
                'Local derived image requires its exact configuration ID as reference.',
            );
            const build = exact(i.build, [
                'receipt_path',
                'receipt_sha256',
                'dockerfile_path',
                'dockerfile_sha256',
                'base_reference',
                'base_id',
            ]);
            requireContainer(
                absolute(build.receipt_path) &&
                    absolute(build.dockerfile_path) &&
                    hash.test(build.receipt_sha256) &&
                    hash.test(build.dockerfile_sha256) &&
                    registry(build.base_reference) &&
                    /^sha256:[a-f0-9]{64}$/.test(build.base_id),
                'Retained Dockerfile and immutable base/build receipt pins required.',
            );
        }
        requireContainer(
            /^[a-z][a-z0-9_-]{0,30}$/.test(a.name) &&
                a.home === `/home/${a.name}` &&
                Number.isSafeInteger(a.uid) &&
                a.uid >= 1000 &&
                a.uid < 65534 &&
                Number.isSafeInteger(a.gid) &&
                a.gid >= 1000 &&
                a.gid < 65534 &&
                hash.test(a.seed_sha256),
            'Ordinary non-root account and seed-home pin required.',
        );
        requireContainer(
            contract.authority.environment_sha256 ===
                (i.kind === 'registry' ? i.reference.split('@sha256:')[1] : i.id.slice(7)),
            'Image must match the selected environment digest.',
        );
        for (const binary of Object.values(contract.binaries))
            requireContainer(
                binary.platform === i.platform,
                'All binaries must match image platform.',
            );
        return structuredClone(p) as NativePilotContainerPin;
    }

    image(raw: unknown, pin: NativePilotContainerPin) {
        requireContainer(
            Array.isArray(raw) && raw.length === 1,
            'One installed image inspection required.',
        );
        const i = containerRecord((raw as unknown[])[0]);
        const c = containerRecord(i.Config);
        requireContainer(
            i.Id === pin.image.id &&
                i.Os === 'linux' &&
                i.Architecture === pin.image.platform.split('/')[1] &&
                equal(i.RootFS?.Layers, pin.image.rootfs_layers) &&
                i.RootFS?.Type === 'layers' &&
                canonicalContainerDigest(c) === pin.image.config_sha256 &&
                (pin.image.kind === 'local-derived' ||
                    (Array.isArray(i.RepoDigests) && i.RepoDigests.includes(pin.image.reference))),
            'Installed image identity differs.',
        );
        requireContainer(
            [
                '',
                'root',
                '0',
                '0:0',
                pin.account.name,
                `${pin.account.uid}:${pin.account.gid}`,
            ].includes(c.User) &&
                (!c.Volumes || Object.keys(c.Volumes).length === 0) &&
                (!c.OnBuild || c.OnBuild.length === 0) &&
                (!c.Healthcheck || equal(c.Healthcheck.Test, ['NONE'])),
            'Image user, implicit volumes or startup behavior is unsafe.',
        );
        this.environment(c.Env, pin, false);
    }

    environment(raw: unknown, pin: NativePilotContainerPin, running: boolean) {
        requireContainer(Array.isArray(raw), 'Environment must be measured.');
        const pairs = (raw as unknown[]).map((v) => {
            requireContainer(
                typeof v === 'string' && !/[\x00-\x1f]/.test(v),
                'Invalid environment.',
            );
            const [name, ...value] = (v as string).split('=');
            return [name, value.join('=')] as [string, string];
        });
        const map = new Map(pairs);
        requireContainer(
            map.size === pairs.length &&
                pairs.every(([key]) =>
                    ['PATH', 'HOME', 'LANG', 'HOSTNAME', 'NODE_VERSION', 'YARN_VERSION'].includes(
                        key,
                    ),
                ),
            'Unreviewed environment variable.',
        );
        requireContainer(
            !map.has('HOME') || map.get('HOME') === pin.account.home,
            'Image normal home differs.',
        );
        requireContainer(!map.has('LANG') || map.get('LANG') === 'C.UTF-8', 'Unreviewed locale.');
        for (const key of ['NODE_VERSION', 'YARN_VERSION'])
            requireContainer(
                !map.has(key) || /^\d+\.\d+\.\d+$/.test(map.get(key)!),
                'Unreviewed image version metadata.',
            );
        if (running)
            requireContainer(
                map.get('HOME') === pin.account.home && map.get('PATH') === containerPath.path,
                'Effective ordinary account environment differs.',
            );
    }

    inspect(
        raw: unknown,
        pin: NativePilotContainerPin,
        owned: NativePilotContainerIdentity,
        id: string,
        running: boolean,
    ) {
        requireContainer(
            hash.test(id) && Array.isArray(raw) && raw.length === 1,
            'Full owned container ID required.',
        );
        const c = containerRecord((raw as unknown[])[0]);
        const h = containerRecord(c.HostConfig);
        const cfg = containerRecord(c.Config);
        const state = containerRecord(c.State);
        requireContainer(
            c.Id === id &&
                c.Name === `/${owned.name}` &&
                c.Image === pin.image.id &&
                cfg.Image === pin.image.reference &&
                Object.entries(owned.labels).every(([k, v]) => cfg.Labels?.[k] === v),
            'Container ownership or identity differs.',
        );
        requireContainer(
            cfg.User === `${pin.account.uid}:${pin.account.gid}` &&
                cfg.WorkingDir === containerPath.consumer &&
                equal(cfg.Entrypoint, [containerPath.node]) &&
                equal(cfg.Cmd, [containerPath.worker, 'idle', containerPath.request]),
            'Container launch differs.',
        );
        this.environment(cfg.Env, pin, false);
        requireContainer(
            h.NetworkMode === 'none' &&
                h.ReadonlyRootfs === true &&
                h.Privileged === false &&
                h.Init === true &&
                equal(h.CapDrop, ['ALL']) &&
                (!h.CapAdd || h.CapAdd.length === 0) &&
                Array.isArray(h.SecurityOpt) &&
                h.SecurityOpt.length === 1 &&
                ['no-new-privileges', 'no-new-privileges=true'].includes(h.SecurityOpt[0]) &&
                ['', 'private'].includes(h.PidMode) &&
                ['', 'private'].includes(h.UTSMode) &&
                h.IpcMode === 'private' &&
                h.CgroupnsMode === 'private' &&
                h.PidsLimit === containerLimits.pids &&
                h.Memory === containerLimits.memory &&
                h.MemorySwap === containerLimits.memory &&
                h.NanoCpus === containerLimits.nano_cpus &&
                h.RestartPolicy?.Name === 'no' &&
                !h.AutoRemove &&
                (!h.Devices || h.Devices.length === 0) &&
                (!h.DeviceRequests || h.DeviceRequests.length === 0) &&
                (!h.PortBindings || Object.keys(h.PortBindings).length === 0),
            'Measured container controls differ.',
        );
        requireContainer(
            equal(h.Tmpfs, { '/tmp': 'rw,noexec,nosuid,nodev,size=67108864,mode=1777' }),
            'Unexpected temporary mounts.',
        );
        requireContainer(
            Array.isArray(c.Mounts) && c.Mounts.length === 5,
            'Exactly one read-only bind and four owned volumes required.',
        );
        const mount = (target: string) => c.Mounts.filter((m: any) => m.Destination === target);
        const input = mount('/pilot');
        requireContainer(
            input.length === 1 &&
                input[0].Type === 'bind' &&
                input[0].Source === owned.mount &&
                input[0].RW === false &&
                input[0].Propagation === 'rprivate',
            'Input bind is not confined.',
        );
        for (const [role, name] of Object.entries(owned.volumes)) {
            const found = mount(role === 'home' ? pin.account.home : `/pilot/${role}`);
            requireContainer(
                found.length === 1 &&
                    found[0].Type === 'volume' &&
                    found[0].Name === name &&
                    found[0].RW === true &&
                    found[0].Driver === 'local',
                'Volume ownership differs.',
            );
        }
        requireContainer(
            state.Running === running &&
                Number.isSafeInteger(state.Pid) &&
                (running ? state.Pid > 0 : state.Pid === 0) &&
                !state.Paused &&
                !state.Restarting,
            'Container process state not established.',
        );
        return c;
    }

    volume(
        raw: unknown,
        owned: NativePilotContainerIdentity,
        role: keyof NativePilotContainerIdentity['volumes'],
    ) {
        requireContainer(
            Array.isArray(raw) && raw.length === 1,
            'One owned volume inspection required.',
        );
        const v = containerRecord((raw as unknown[])[0]);
        requireContainer(
            v.Name === owned.volumes[role] &&
                v.Driver === 'local' &&
                v.Scope === 'local' &&
                (!v.Options || Object.keys(v.Options).length === 0) &&
                v.Labels?.['i9.pilot.role'] === role &&
                Object.entries(owned.labels).every(([k, value]) => v.Labels?.[k] === value),
            'Volume is not exactly owned.',
        );
    }

    probe(
        raw: unknown,
        pin: NativePilotContainerPin,
        owned: NativePilotContainerIdentity,
        expected: Record<string, string>,
        fresh: boolean,
    ) {
        const p = containerRecord(raw);
        requireContainer(
            p.schema_version === 1 &&
                p.operation === 'probe' &&
                p.nonce === owned.nonce &&
                equal(p.selection, owned.selection),
            'Probe identity differs.',
        );
        requireContainer(
            p.platform === pin.image.platform &&
                p.node_executable === containerPath.node &&
                p.node_version === '24.21.0' &&
                p.uid === pin.account.uid &&
                p.gid === pin.account.gid &&
                p.passwd_name === pin.account.name &&
                p.passwd_home === pin.account.home &&
                p.home === pin.account.home,
            'Measured normal account differs.',
        );
        this.environment(p.environment, pin, true);
        requireContainer(
            p.no_new_privileges === 1 &&
                p.seccomp === 2 &&
                ['effective', 'permitted', 'bounding'].every(
                    (k) => p.capabilities?.[k] === '0000000000000000',
                ),
            'Measured process privileges differ.',
        );
        const cpu =
            typeof p.cgroups?.cpu_max === 'string'
                ? p.cgroups.cpu_max.split(/\s+/).map(Number)
                : [];
        requireContainer(
            p.cgroups?.memory_max === String(containerLimits.memory) &&
                p.cgroups?.memory_swap_max === '0' &&
                p.cgroups?.pids_max === String(containerLimits.pids) &&
                cpu.length === 2 &&
                cpu.every((value: number) => Number.isSafeInteger(value) && value > 0) &&
                cpu[0] === cpu[1] * 2,
            'Kernel resource limits were not measured.',
        );
        requireContainer(
            p.namespaces &&
                ['pid', 'mnt', 'net', 'user', 'ipc', 'uts'].every((k) =>
                    /^\w+:\[\d+\]$/.test(p.namespaces[k]),
                ),
            'Missing namespace measurements.',
        );
        requireContainer(
            equal(p.interfaces, ['lo']) &&
                Array.isArray(p.routes) &&
                p.routes.length === 0 &&
                NativePilotConfiguration.isUnreachableNetworkResult(p.external_connect),
            'Network isolation was not measured.',
        );
        requireContainer(equal(p.hashes, expected), 'Measured input or binary bytes differ.');
        const denied = [
            '/pilot/input',
            '/pilot/source',
            '/pilot/runtime-bin',
            '/pilot/consumer',
            '/pilot/control',
            '/var/tmp',
        ];
        const writable = [
            pin.account.home,
            '/pilot/state',
            '/pilot/work',
            '/pilot/native-output',
            '/tmp',
        ];
        requireContainer(
            equal(
                p.denied?.map((v: any) => v.path),
                denied,
            ) &&
                p.denied.every((v: any) => v.error === 'EROFS') &&
                equal(
                    p.writable?.map((v: any) => v.path),
                    writable,
                ) &&
                p.writable.every((v: any) => v.created === true && v.removed === true),
            'Actual write confinement was not measured.',
        );
        requireContainer(
            equal(
                p.sockets,
                [
                    '/var/run/docker.sock',
                    '/run/docker.sock',
                    '/run/systemd/private',
                    '/run/dbus/system_bus_socket',
                ].map((path) => ({ path, present: false })),
            ),
            'Privileged socket access is unknown.',
        );
        requireContainer(
            equal(p.credential_paths, []),
            'Credential paths appeared in the disposable account.',
        );
        if (fresh)
            requireContainer(
                p.home_seed_sha256 === pin.account.seed_sha256 && equal(p.credential_paths, []),
                'Clean fresh account seed differs.',
            );
        return p;
    }
}
