import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const syntheticContainerHome = join('/', 'home', 'node');
import { fixture, selection } from './NativePilotFixture.mjs';
import { pilotDigest } from '../../src/repository/NativePilotInventoryRepository.ts';
import { NativePilotContainerService } from '../../src/service/NativePilotContainerService.ts';
import { NativePilotPlanService } from '../../src/service/NativePilotPlanService.ts';
import {
    canonicalContainerDigest,
    containerLimits,
    containerPath,
} from '../../src/validator/NativePilotContainerValidator.ts';

// Every Docker and worker result in this helper is synthetic. No process is spawned.
export function containerFixture(t, options = {}) {
    const base = fixture(t);
    base.put(
        join(base.inputs.driver, 'src/transport/NativePilotContainerWorkerRunner.ts'),
        'throw new Error("inert fixture: never execute");\n',
    );
    base.contract.driver.tree_sha256 = base.inventory.tree(base.inputs.driver).tree_sha256;
    const imageConfig = {
        User: '1000:1000',
        Env: ['PATH=/usr/local/bin:/usr/bin:/bin', 'NODE_VERSION=24.21.0', 'YARN_VERSION=1.22.22'],
        Volumes: null,
        OnBuild: null,
    };
    const pin = {
        schema_version: 1,
        docker: {
            executable: join(base.root, 'inert-docker'),
            sha256: pilotDigest('inert docker'),
            endpoint: `unix://${base.root}/inert.sock`,
        },
        image: {
            kind: 'registry',
            reference: `example.invalid/pilot@sha256:${'e'.repeat(64)}`,
            id: `sha256:${'f'.repeat(64)}`,
            platform: 'linux/arm64',
            rootfs_layers: [`sha256:${'1'.repeat(64)}`],
            config_sha256: canonicalContainerDigest(imageConfig),
            build: null,
        },
        account: {
            name: 'node',
            uid: 1000,
            gid: 1000,
            home: syntheticContainerHome,
            seed_sha256: pilotDigest('synthetic empty seed'),
        },
    };
    base.contract.authority.environment_sha256 = 'e'.repeat(64);
    if (options.mutatePin) options.mutatePin(pin, base);
    const prepared = base.prepare();
    const lane = selection(options.host ?? 'codex', options.repetition ?? 1);
    const calls = [];
    const volumes = new Map();
    let instance = null;
    const id = '3'.repeat(64);
    let controller;
    const success = (stdout = '') => ({
        exitCode: 0,
        signal: null,
        timedOut: false,
        outputTruncated: false,
        stdout,
        stderr: '',
    });
    const image = () => [
        {
            Id: pin.image.id,
            Os: 'linux',
            Architecture: 'arm64',
            Config: imageConfig,
            RootFS: { Type: 'layers', Layers: pin.image.rootfs_layers },
            RepoDigests: pin.image.kind === 'registry' ? [pin.image.reference] : [],
        },
    ];
    const inspect = () => {
        const owned = controller.files.owned;
        return [
            {
                Id: id,
                Name: `/${owned.name}`,
                Image: pin.image.id,
                Config: {
                    Image: pin.image.reference,
                    User: '1000:1000',
                    WorkingDir: '/pilot/consumer',
                    Entrypoint: [containerPath.node],
                    Cmd: [containerPath.worker, 'idle', containerPath.request],
                    Labels: owned.labels,
                    Env: [
                        `PATH=${containerPath.path}`,
                        'LANG=C.UTF-8',
                        'NODE_VERSION=24.21.0',
                        'YARN_VERSION=1.22.22',
                    ],
                },
                HostConfig: {
                    NetworkMode: 'none',
                    ReadonlyRootfs: true,
                    Privileged: false,
                    Init: true,
                    CapDrop: ['ALL'],
                    CapAdd: [],
                    SecurityOpt: ['no-new-privileges=true'],
                    PidMode: '',
                    UTSMode: '',
                    IpcMode: 'private',
                    CgroupnsMode: 'private',
                    PidsLimit: 256,
                    Memory: containerLimits.memory,
                    MemorySwap: containerLimits.memory,
                    NanoCpus: containerLimits.nano_cpus,
                    RestartPolicy: { Name: 'no' },
                    AutoRemove: false,
                    Devices: [],
                    DeviceRequests: [],
                    PortBindings: {},
                    Tmpfs: { '/tmp': 'rw,noexec,nosuid,nodev,size=67108864,mode=1777' },
                },
                Mounts: [
                    {
                        Type: 'bind',
                        Source: owned.mount,
                        Destination: '/pilot',
                        RW: false,
                        Propagation: 'rprivate',
                    },
                    ...Object.entries(owned.volumes).map(([role, name]) => ({
                        Type: 'volume',
                        Name: name,
                        Driver: 'local',
                        RW: true,
                        Destination: role === 'home' ? syntheticContainerHome : `/pilot/${role}`,
                    })),
                ],
                State: {
                    Running: instance?.running ?? false,
                    Pid: instance?.running ? 812 : 0,
                    Paused: false,
                    Restarting: false,
                },
            },
        ];
    };
    const probe = () => ({
        schema_version: 1,
        operation: 'probe',
        nonce: controller.files.owned.nonce,
        selection: lane,
        platform: 'linux/arm64',
        node_executable: containerPath.node,
        node_version: '24.21.0',
        uid: 1000,
        gid: 1000,
        passwd_name: 'node',
        passwd_home: syntheticContainerHome,
        home: syntheticContainerHome,
        environment: [
            `PATH=${containerPath.path}`,
            `HOME=${syntheticContainerHome}`,
            'LANG=C.UTF-8',
            'HOSTNAME=synthetic',
            'NODE_VERSION=24.21.0',
            'YARN_VERSION=1.22.22',
        ],
        no_new_privileges: 1,
        seccomp: 2,
        capabilities: {
            effective: '0000000000000000',
            permitted: '0000000000000000',
            bounding: '0000000000000000',
        },
        cgroups: {
            memory_max: String(containerLimits.memory),
            memory_swap_max: '0',
            pids_max: '256',
            cpu_max: '200000 100000',
        },
        namespaces: Object.fromEntries(
            ['pid', 'mnt', 'net', 'user', 'ipc', 'uts'].map((name, i) => [
                name,
                `${name}:[${i + 10}]`,
            ]),
        ),
        interfaces: ['lo'],
        routes: [],
        external_connect: 'ENETUNREACH',
        hashes: structuredClone(controller.files.request.expected),
        denied: [
            '/pilot/input',
            '/pilot/source',
            '/pilot/runtime-bin',
            '/pilot/consumer',
            '/pilot/control',
            '/var/tmp',
        ].map((path) => ({ path, error: 'EROFS' })),
        writable: [
            syntheticContainerHome,
            '/pilot/state',
            '/pilot/work',
            '/pilot/native-output',
            '/tmp',
        ].map((path) => ({ path, created: true, removed: true })),
        sockets: [
            '/var/run/docker.sock',
            '/run/docker.sock',
            '/run/systemd/private',
            '/run/dbus/system_bus_socket',
        ].map((path) => ({ path, present: false })),
        home_seed_sha256: pin.account.seed_sha256,
        credential_paths: [],
    });
    const audit = () => {
        const sample = {
            worker_pid: 22,
            network_observation: 'observed',
            network_contract: 'linux-proc-inet-v1',
            sockets: [],
            closed_time_wait: [],
            blocking_sockets: [],
            processes: [
                {
                    pid: 1,
                    ppid: 0,
                    start_ticks: '1',
                    state: 'S',
                    comm: 'docker-init',
                    argv: ['/sbin/docker-init', '--'],
                    role: 'init',
                    observation: 'observed',
                },
                {
                    pid: 7,
                    ppid: 1,
                    start_ticks: '2',
                    state: 'S',
                    comm: 'node',
                    argv: [containerPath.node, containerPath.worker, 'idle', containerPath.request],
                    role: 'idle',
                    observation: 'observed',
                },
                {
                    pid: 22,
                    ppid: 0,
                    start_ticks: '3',
                    state: 'R',
                    comm: 'node',
                    argv: [
                        containerPath.node,
                        containerPath.worker,
                        'audit',
                        containerPath.request,
                    ],
                    role: 'worker',
                    observation: 'observed',
                },
            ],
            listeners: [],
        };
        return {
            schema_version: 1,
            operation: 'audit',
            nonce: controller.files.owned.nonce,
            selection: lane,
            ...sample,
            samples: [structuredClone(sample), structuredClone(sample)],
            quiescent: true,
            status: 'quiescent',
            residual_zombies: [],
        };
    };
    const bundle = () => ({
        schema_version: 1,
        operation: 'export',
        nonce: controller.files.owned.nonce,
        selection: lane,
        audit: audit(),
        roots: ['home', 'state', 'work', 'native-output'].map((name) => ({
            name,
            path: name === 'home' ? syntheticContainerHome : `/pilot/${name}`,
            entries: [
                {
                    path: 'sentinel.txt',
                    kind: 'file',
                    bytes: 8,
                    sha256: pilotDigest('retained'),
                    target: null,
                    base64: Buffer.from('retained').toString('base64'),
                },
            ],
        })),
    });
    const execute = async (request) => {
        calls.push(request);
        if (options.intercept) {
            const intercepted = await options.intercept(request, {
                controller,
                calls,
                volumes,
                instance,
            });
            if (intercepted) return intercepted;
        }
        const args = request.args.slice(4);
        const [group, action] = args;
        if (group === 'image' && action === 'inspect')
            return success(JSON.stringify(options.image ? options.image(image()) : image()));
        if (group === 'volume') {
            const name = args.at(-1);
            if (action === 'ls')
                return success(
                    [...volumes.keys()]
                        .filter((name) => args.includes(`name=${name}`))
                        .map((name) => JSON.stringify(name))
                        .join('\n'),
                );
            if (action === 'create') {
                const role = Object.entries(controller.files.owned.volumes).find(
                    ([, value]) => value === name,
                )[0];
                volumes.set(name, {
                    Name: name,
                    Driver: 'local',
                    Scope: 'local',
                    Options: null,
                    Labels: { ...controller.files.owned.labels, 'i9.pilot.role': role },
                });
                return success(name);
            }
            if (action === 'inspect') return success(JSON.stringify([volumes.get(name)]));
            if (action === 'rm') {
                volumes.delete(name);
                return success(name);
            }
        }
        if (group === 'container') {
            if (action === 'create') {
                instance = { running: false };
                writeFileSync(args[args.indexOf('--cidfile') + 1], id, { flag: 'wx' });
                return success(id);
            }
            if (action === 'inspect')
                return success(
                    JSON.stringify(options.inspect ? options.inspect(inspect()) : inspect()),
                );
            if (action === 'start') {
                instance.running = true;
                return success(id);
            }
            if (action === 'stop' || action === 'kill') {
                instance.running = false;
                return success(id);
            }
            if (action === 'rm') {
                instance = null;
                return success(id);
            }
            if (action === 'ls') return success(instance ? JSON.stringify(id) : '');
            if (action === 'exec') {
                const offset = args.indexOf(containerPath.worker);
                const operation = args[offset + 1];
                if (operation === 'probe')
                    return success(
                        JSON.stringify(options.probe ? options.probe(probe()) : probe()),
                    );
                if (operation === 'audit')
                    return success(
                        JSON.stringify(options.audit ? options.audit(audit()) : audit()),
                    );
                if (operation === 'export')
                    return success(
                        JSON.stringify(options.bundle ? options.bundle(bundle()) : bundle()),
                    );
                if (operation === 'execute') {
                    const phase = args[offset + 3];
                    const index = Number(args[offset + 4]);
                    const result = {
                        schema_version: 1,
                        operation: 'execute',
                        nonce: controller.files.owned.nonce,
                        selection: lane,
                        phase,
                        index,
                        command: new NativePilotPlanService()
                            .plan({ root: '/pilot', contract: prepared.contract }, lane)
                            .find((step) => step.id === phase).commands[index],
                        process: { status: 'completed', exit_code: 0, signal: null },
                        stdout: JSON.stringify({ synthetic: true, phase }),
                        stderr: '',
                    };
                    return success(
                        JSON.stringify(options.command ? options.command(result) : result),
                    );
                }
            }
        }
        throw new Error(`Unexpected synthetic Docker request: ${group}/${action}`);
    };
    controller = new NativePilotContainerService(prepared, lane, pin, execute, () => {});
    return {
        ...base,
        prepared,
        pin,
        controller,
        lane,
        calls,
        volumes,
        id,
        image,
        inspect,
        probe,
        audit,
        bundle,
        nativeCalls: () => calls.filter((call) => call.args.includes('execute')),
        async through(phase) {
            const facts = [];
            for (const step of controller.plan) {
                facts.push(await controller.perform(step));
                if (step.id === phase) break;
            }
            return facts;
        },
    };
}
