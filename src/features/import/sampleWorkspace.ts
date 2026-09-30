/**
 * Built-in sample workspace for local demo mode (running outside Cribl).
 *
 * The fixtures mimic real Cribl REST responses (`{ count, items }`, extra fields, internal and
 * disabled objects) and are served through the same `Getter` interface as the live API, so the
 * sample exercises exactly the same discovery and mapping code.
 */
import { ApiError } from '../../platform/cribl';
import type { Getter } from './criblApi';

export const SAMPLE_WORKSPACE_LABEL = 'Sample workspace — not connected to Cribl';

const GB = 1024 ** 3;
const DAY_MS = 86_400_000;

const list = (items: object[]) => ({ count: items.length, items });

const groups = list([
  { id: 'dc1-network', name: 'DC1 Network & Syslog', onPrem: true, workerCount: 4, configVersion: 'a1b2c3d', provisioned: true, workerRemoteAccess: true, streamtags: ['dc1'] },
  { id: 'dc1-endpoint', name: 'DC1 Endpoint Ingest', onPrem: true, workerCount: 3, configVersion: 'a1b2c3d', streamtags: ['dc1'] },
  { id: 'cloud-collectors', name: 'Cloud Collectors', onPrem: false, workerCount: 2, estimatedIngestRate: 2048, cloud: { provider: 'aws', region: 'us-east-1' }, provisioned: true },
  { id: 'default_fleet', name: 'Windows & Linux endpoints', isFleet: true, type: 'edge', onPrem: true, workerCount: 1840 },
  { id: 'default_search', isSearch: true, type: 'search', onPrem: false, workerCount: 0 },
]);

const node = (id: string, group: string, cpus: number, extra: object = {}) => ({
  id,
  group,
  disconnected: false,
  info: { hostname: id, cpus, totalmem: cpus * 2 * GB, platform: 'linux', architecture: 'x64', cribl: { distMode: 'worker', group, version: '4.14.0' }, ...extra },
});

const workers = list([
  ...[1, 2, 3, 4].map((n) => node(`dc1-net-wn0${n}`, 'dc1-network', 16)),
  ...[1, 2, 3].map((n) => node(`dc1-ep-wn0${n}`, 'dc1-endpoint', 16)),
  ...[1, 2].map((n) => node(`cloud-wn-${n}`, 'cloud-collectors', 8, { isSaasWorker: true })),
  // A handful of Edge Nodes are returned too; they belong to a Fleet and must not count as Stream capacity.
  ...[1, 2, 3].map((n) => node(`laptop-${n}`, 'default_fleet', 4, { cribl: { distMode: 'managed-edge', group: 'default_fleet' } })),
  { ...node('dc1-net-wn05', 'dc1-network', 16), disconnected: true },
]);

const internalInputs = [
  { id: 'CriblLogs', type: 'cribl', disabled: false },
  { id: 'CriblMetrics', type: 'criblmetrics', disabled: false, prefix: 'cribl.logstream.' },
];

const inputs: Record<string, object> = {
  'dc1-network': list([
    ...internalInputs,
    { id: 'in_syslog_paloalto', type: 'syslog', description: 'Palo Alto NGFW cluster (PAN-OS)', host: '0.0.0.0', tcpPort: 9514, udpPort: 9514, disabled: false, pqEnabled: true, pq: { mode: 'always' } },
    { id: 'in_syslog_network', type: 'syslog', description: 'Cisco routers, switches and load balancers', host: '0.0.0.0', tcpPort: 1514, udpPort: 1514, disabled: false },
    { id: 'in_syslog_legacy', type: 'syslog', description: 'Legacy 514 listener (retired)', udpPort: 514, disabled: true },
  ]),
  'dc1-endpoint': list([
    ...internalInputs,
    { id: 'in_cribl_tcp', type: 'cribl_tcp', description: 'Edge Fleet → Stream (Linux servers)', host: '0.0.0.0', port: 10300, disabled: false, pqEnabled: true, pq: { mode: 'smart' } },
    { id: 'in_cribl_http_win', type: 'cribl_http', description: 'Windows servers via Cribl Edge', host: '0.0.0.0', port: 10200, disabled: false },
    { id: 'in_splunk_hec_apps', type: 'splunk_hec', description: 'Application teams HEC endpoint', port: 8088, disabled: false },
  ]),
  'cloud-collectors': list([
    ...internalInputs,
    { id: 'in_s3_cloudtrail', type: 's3', description: 'AWS CloudTrail via SQS notifications', queueName: 'cloudtrail-events', disabled: false },
    { id: 'in_eventhub_entra', type: 'eventhub', description: 'Microsoft Entra ID sign-in and audit logs', disabled: false },
    { id: 'in_rest_okta', type: 'rest', description: 'Okta System Log API', disabled: false },
    { id: 'in_datagen_test', type: 'datagen', disabled: false },
  ]),
};

const internalOutputs = [
  { id: 'default', type: 'default', defaultId: 'splunk_prod' },
  { id: 'devnull', type: 'devnull' },
];

const outputs: Record<string, object> = {
  'dc1-network': list([
    ...internalOutputs,
    { id: 'splunk_prod', type: 'splunk_lb', onBackpressure: 'queue', indexerDiscovery: false, hosts: [{ host: 'idx1.acme.local', port: 9997 }] },
    { id: 'sentinel_soc', type: 'sentinel', onBackpressure: 'queue' },
  ]),
  'dc1-endpoint': list([
    ...internalOutputs,
    { id: 'splunk_prod', type: 'splunk_lb', onBackpressure: 'queue' },
    { id: 'lake_archive', type: 'cribl_lake', onBackpressure: 'block' },
  ]),
  'cloud-collectors': list([
    ...internalOutputs,
    { id: 's3_archive', type: 's3', bucket: 'acme-security-archive', onBackpressure: 'block' },
    { id: 'sentinel_soc', type: 'sentinel', onBackpressure: 'queue' },
    { id: 'lake_archive', type: 'cribl_lake', onBackpressure: 'block' },
  ]),
};

/** 30 daily records averaging ≈ 2.1 TB/day in and ≈ 1.35 TB/day out, with a weekday/weekend rhythm. */
function licenseUsage(now: number) {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const items = Array.from({ length: 30 }, (_, i) => {
    const start = today - (30 - i) * DAY_MS;
    const weekday = new Date(start).getUTCDay();
    const rhythm = weekday === 0 || weekday === 6 ? 0.86 : 1.055;
    const wobble = 1 + 0.03 * Math.sin(i * 1.7);
    const inGB = 2150 * rhythm * wobble;
    return {
      startTime: start,
      endTime: start + DAY_MS,
      inBytes: Math.round(inGB * GB),
      outBytes: Math.round(inGB * 0.64 * GB),
      inEvents: Math.round(inGB * 2_200_000),
      outEvents: Math.round(inGB * 1_500_000),
      droppedBytes: Math.round(inGB * 0.36 * GB),
      exemptedLicenseInBytes: 0,
    };
  });
  return list(items);
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

/** Serves the sample fixtures for the same paths the live import calls. */
export const sampleGet: Getter = async (path, signal) => {
  await sleep(120 + Math.random() * 180, signal);
  const clone = <T>(v: T): T => structuredClone(v);
  if (path === '/master/groups') return clone(groups);
  if (path === '/master/workers') return clone(workers);
  if (path === '/system/licenses/usage') return licenseUsage(Date.now());
  const m = /^\/m\/([^/]+)\/system\/(inputs|outputs)$/.exec(path);
  if (m) {
    const gid = decodeURIComponent(m[1]);
    const table = m[2] === 'inputs' ? inputs : outputs;
    if (table[gid]) return clone(table[gid]);
  }
  throw new ApiError(404, `404 Not Found for ${path}`);
};
