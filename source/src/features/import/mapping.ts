/**
 * Pure mapping from raw Cribl REST responses to the designer's model.
 *
 * Everything here is side-effect free (apart from id generation in `buildImport`) so it can be
 * unit-tested with fixtures. Cribl response shapes vary by version and deployment type, so every
 * reader tolerates missing, extra and wrongly-typed fields.
 */
import { DESTINATION_TYPES, SOURCE_TYPES } from '../../model/catalog';
import { makeDestination, makeSource } from '../../model/factory';
import type { Backpressure, Design, Destination, ImportSnapshot, SourceGroup, SourcePQMode } from '../../model/types';

// ── Loose readers ────────────────────────────────────────────────────────────

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : null);

/** Cribl list endpoints return `{ count, items }`; tolerate a bare array or a single object too. */
export function listItems(res: unknown): Rec[] {
  if (Array.isArray(res)) return res.filter(isRec);
  if (isRec(res)) {
    if (Array.isArray(res.items)) return res.items.filter(isRec);
    if (res.id !== undefined) return [res];
  }
  return [];
}

const GB = 1024 ** 3;
const DAY_MS = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

// ── Type mapping ─────────────────────────────────────────────────────────────

const SOURCE_VALUES = new Set(SOURCE_TYPES.map((s) => s.value));
const DEST_VALUES = new Set(DESTINATION_TYPES.map((d) => d.value));

/** Lower-cased alphanumeric tokens of the given strings: "PAN_fw-01 (Palo Alto)" → pan, fw, 01, palo, alto. */
const tokens = (...parts: string[]) =>
  parts
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const FIREWALL_TOKEN = /^(fw\d*|ngfw|firewall|firewalls|pan|panos|asa\d*|srx\d*|palo|paloalto|fortinet|fortigate|forti|checkpoint|sonicwall|zscaler)$/;
const hasFirewallHint = (t: string[]) => t.some((x) => FIREWALL_TOKEN.test(x) || x.startsWith('paloalto') || x.startsWith('fortigate') || x.startsWith('firewall'));
const hasWindowsHint = (t: string[]) => t.some((x) => x === 'win' || x.startsWith('windows') || /^win\d*$/.test(x) || x === 'wec' || x === 'wef');
const hasKubeHint = (t: string[]) => t.some((x) => x === 'k8s' || x.startsWith('kube') || x === 'eks' || x === 'aks' || x === 'gke' || x === 'openshift');
const hasRouterHint = (t: string[]) => t.some((x) => x === 'router' || x === 'routers' || x === 'rtr');
const hasSwitchHint = (t: string[]) => t.some((x) => x === 'switch' || x === 'switches' || x === 'sw');

const CLOUD_INPUTS = new Set([
  's3', 's3_inventory', 'sqs', 'azure_blob', 'azure_event_hub', 'azure_vnet_flow_log', 'eventhub', 'eventhub_amqp', 'google_pubsub',
  'google_cloud_storage', 'kinesis', 'firehose', 'crowdstrike', 'confluent_cloud', 'msk', 'security_lake', 'bedrock_s3', 'cloudwatch',
]);
const SAAS_INPUTS = new Set([
  'rest', 'okta', 'http', 'splunk_hec', 'http_raw', 'wiz', 'wiz_webhook', 'microsoft_graph', 'microsoft_copilot', 'servicenow_table',
  'proofpoint_pod', 'ping_identity_pingone', 'openai', 'openai_compliance_logs', 'anthropic_compliance', 'anthropic_enterprise_analytics',
  'trend_micro_vision_one', 'extrahop_revealx_360', 'hashicorp_hcp_vault_dedicated', 'grafana',
]);
const APP_INPUTS = new Set(['datadog_agent', 'elastic', 'splunk', 'splunk_search', 'loki', 'open_telemetry', 'prometheus', 'prometheus_rw', 'metrics', 'kafka']);
const NETWORK_INPUTS = new Set(['netflow', 'snmp', 'raw_udp', 'f5_big_ip', 'model_driven_telemetry']);
const EDGE_FORWARD_INPUTS = new Set(['cribl_tcp', 'cribl_http', 'tcpjson']);

/** Map a Cribl Source (input) type to one of our SOURCE_TYPES values. */
export function mapInputType(criblType: string, id = '', description = ''): string {
  const type = criblType.toLowerCase();
  const t = tokens(id, description);
  let mapped: string;
  if (type === 'syslog') {
    mapped = hasFirewallHint(t) ? 'Firewall' : hasRouterHint(t) ? 'Router' : hasSwitchHint(t) ? 'Switch' : 'Network Device';
  } else if (type.startsWith('kube_') || type.startsWith('edge_kube') || type === 'k8s') {
    mapped = 'Kubernetes';
  } else if (EDGE_FORWARD_INPUTS.has(type) || type.startsWith('edge_')) {
    mapped = hasWindowsHint(t) ? 'Windows' : hasKubeHint(t) ? 'Kubernetes' : 'Linux';
  } else if (type === 'win_event_logs' || type === 'wef' || type === 'windows_metrics') {
    mapped = 'Windows';
  } else if (type === 'file' || type === 'filesystem' || type === 'journal_files' || type === 'exec' || type === 'script') {
    mapped = 'Linux';
  } else if (CLOUD_INPUTS.has(type)) {
    mapped = 'Cloud (AWS/Azure/GCP)';
  } else if (SAAS_INPUTS.has(type) || type.startsWith('office365_') || type.endsWith('_hec')) {
    mapped = 'SaaS Application';
  } else if (APP_INPUTS.has(type)) {
    mapped = 'Application Logs';
  } else if (NETWORK_INPUTS.has(type)) {
    mapped = 'Network Device';
  } else if (type === 'database') {
    mapped = 'Database';
  } else {
    mapped = 'Custom / Other';
  }
  return SOURCE_VALUES.has(mapped) ? mapped : 'Custom / Other';
}

const OTHER_SIEM_OUTPUTS = new Set(['qradar', 'exabeam', 'xsiam', 'crowdstrike_next_gen_siem', 'sentinel_one_ai_siem', 'azure_data_explorer']);

/** Map a Cribl Destination (output) type to one of our DESTINATION_TYPES values. */
export function mapOutputType(criblType: string): string {
  const type = criblType.toLowerCase();
  let mapped: string;
  if (type.startsWith('splunk')) mapped = 'Splunk';
  else if (type === 'sentinel' || type === 'azure_logs') mapped = 'Microsoft Sentinel';
  else if (type === 's3' || type === 'security_lake' || type === 'dl_s3') mapped = 'S3';
  else if (type === 'cribl_lake') mapped = 'Cribl Lake';
  else if (type.startsWith('elastic')) mapped = 'Elasticsearch';
  else if (type === 'datadog') mapped = 'Datadog';
  else if (type.startsWith('newrelic')) mapped = 'New Relic';
  else if (type === 'google_chronicle' || type === 'google_secops' || type === 'chronicle') mapped = 'Chronicle';
  else if (OTHER_SIEM_OUTPUTS.has(type) || type.includes('siem') || type.startsWith('sumo')) mapped = 'Other SIEM';
  else mapped = 'Other';
  return DEST_VALUES.has(mapped) ? mapped : 'Other';
}

/** Cribl-internal or synthetic Sources that don't represent customer data. */
const INTERNAL_INPUT_TYPES = new Set(['cribl', 'criblmetrics', 'cribl_metrics', 'appscope', 'datagen', 'system_metrics', 'system_state', 'health_check']);
/** Cribl-internal or meta Destinations (output router, devnull, the "default" pointer, internal search storage). */
const INTERNAL_OUTPUT_TYPES = new Set(['default', 'devnull', 'router', 'local_search_storage', 'customer_metrics_storage', 'cribl_search_engine']);

export const isInternalInput = (type: string, id: string) => INTERNAL_INPUT_TYPES.has(type.toLowerCase()) || /^cribl(logs|metrics)?$/i.test(id);
export const isInternalOutput = (type: string, id: string) => INTERNAL_OUTPUT_TYPES.has(type.toLowerCase()) || id === 'devnull' || id === 'default';

// ── Normalized workspace ─────────────────────────────────────────────────────

export interface WorkspaceGroup {
  id: string;
  name: string;
  kind: 'stream' | 'fleet';
  onPrem: boolean;
  workerCount: number;
  totalVcpus: number;
  /** vCPUs were extrapolated because fewer nodes were returned than the group reports. */
  vcpusEstimated: boolean;
}

export interface ImportedInput {
  key: string;
  groupId: string;
  inputId: string;
  criblType: string;
  description: string;
  mappedType: string;
  pq: SourcePQMode;
  ports: string[];
}

export interface ImportedOutput {
  key: string;
  outputId: string;
  criblType: string;
  mappedType: string;
  groupIds: string[];
  backpressure: Backpressure | null;
}

export interface LicenseSummary {
  dailyInGB: number;
  dailyOutGB: number;
  days: number;
}

export interface Workspace {
  streamGroups: WorkspaceGroup[];
  fleets: WorkspaceGroup[];
  inputs: ImportedInput[];
  outputs: ImportedOutput[];
  license: LicenseSummary | null;
  skipped: { disabled: number; internal: number };
}

export interface RawWorkspace {
  groups: unknown;
  workers: unknown;
  license: unknown;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

const EXCLUDED_GROUP_TYPES = new Set(['search', 'local_search', 'lake_access', 'outpost']);

function groupKind(g: Rec): WorkspaceGroup['kind'] | null {
  const type = str(g.type).toLowerCase();
  if (bool(g.isFleet) === true || type === 'edge') return 'fleet';
  if (bool(g.isSearch) === true || EXCLUDED_GROUP_TYPES.has(type)) return null;
  return 'stream';
}

interface NodeStats {
  nodes: number;
  vcpus: number;
  saas: boolean;
  edge: boolean;
}

/** Aggregate `/master/workers` entries per group (connected nodes only). */
export function summarizeWorkers(raw: unknown): Map<string, NodeStats> {
  const out = new Map<string, NodeStats>();
  for (const w of listItems(raw)) {
    if (bool(w.disconnected) === true) continue;
    const info = isRec(w.info) ? w.info : {};
    const cribl = isRec(info.cribl) ? info.cribl : {};
    const group = str(w.group) || str(cribl.group);
    if (!group) continue;
    const s = out.get(group) ?? { nodes: 0, vcpus: 0, saas: false, edge: false };
    s.nodes += 1;
    s.vcpus += num(info.cpus) ?? 0;
    if (bool(info.isSaasWorker) === true) s.saas = true;
    if (str(cribl.distMode).includes('edge')) s.edge = true;
    out.set(group, s);
  }
  return out;
}

/**
 * Worker Groups and Fleets. When `/master/groups` couldn't be read, fall back to the group ids seen
 * on Worker Nodes so the rest of the import still works.
 */
export function normalizeGroups(rawGroups: unknown, rawWorkers: unknown): WorkspaceGroup[] {
  const stats = summarizeWorkers(rawWorkers);
  const items = listItems(rawGroups);
  const result: WorkspaceGroup[] = [];

  const build = (id: string, name: string, kind: WorkspaceGroup['kind'], onPrem: boolean, reported: number | null): WorkspaceGroup => {
    const s = stats.get(id);
    const seen = s?.nodes ?? 0;
    const workerCount = Math.max(reported ?? 0, seen);
    let totalVcpus = s?.vcpus ?? 0;
    let vcpusEstimated = false;
    // Extrapolate only for Stream groups (paginated node lists); Edge Node CPUs aren't Stream capacity.
    if (kind === 'stream' && seen > 0 && workerCount > seen) {
      totalVcpus = Math.round((totalVcpus / seen) * workerCount);
      vcpusEstimated = true;
    }
    return { id, name: name || id, kind, onPrem, workerCount, totalVcpus, vcpusEstimated };
  };

  if (items.length > 0) {
    const seenIds = new Set<string>();
    for (const g of items) {
      const id = str(g.id);
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      const kind = groupKind(g);
      if (!kind) continue;
      const explicit = bool(g.onPrem);
      const hasCloud = isRec(g.cloud) && !!str(g.cloud.provider);
      const onPrem = explicit ?? (stats.get(id)?.saas ? false : !hasCloud);
      result.push(build(id, str(g.name), kind, onPrem, num(g.workerCount)));
    }
  } else {
    for (const [id, s] of stats) {
      // Without group metadata, tell Fleets apart by the nodes' distMode ("managed-edge").
      result.push(build(id, '', s.edge ? 'fleet' : 'stream', !s.saas, null));
    }
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

/** Stream Worker Group ids whose Sources/Destinations should be read. */
export const streamGroupIds = (raw: Pick<RawWorkspace, 'groups' | 'workers'>) =>
  normalizeGroups(raw.groups, raw.workers)
    .filter((g) => g.kind === 'stream')
    .map((g) => g.id);

/**
 * Average daily inbound/outbound volume from `/system/licenses/usage` (daily aggregates, up to 90 days).
 * Uses the most recent 30 records and each record's real duration, so a partial "today" doesn't skew it.
 */
export function normalizeLicense(raw: unknown, now = Date.now()): LicenseSummary | null {
  const rows = listItems(raw)
    .map((r) => ({ start: num(r.startTime), end: num(r.endTime), inB: num(r.inBytes), outB: num(r.outBytes) }))
    .filter((r) => r.inB !== null || r.outB !== null)
    .sort((a, b) => (b.start ?? 0) - (a.start ?? 0))
    .slice(0, 30);
  if (rows.length === 0) return null;

  let inB = 0;
  let outB = 0;
  let spanMs = 0;
  for (const r of rows) {
    inB += r.inB ?? 0;
    outB += r.outB ?? 0;
    const start = r.start !== null ? (r.start < 1e11 ? r.start * 1000 : r.start) : null; // tolerate seconds
    const endRaw = r.end !== null ? (r.end < 1e11 ? r.end * 1000 : r.end) : null;
    const end = endRaw !== null ? Math.min(endRaw, now) : null;
    const dur = start !== null && end !== null && end > start ? end - start : DAY_MS;
    spanMs += Math.min(dur, DAY_MS * 1.5);
  }
  const days = Math.max(spanMs / DAY_MS, 1 / 24);
  return { dailyInGB: round1(inB / GB / days), dailyOutGB: round1(outB / GB / days), days: Math.round(days) };
}

function pqMode(i: Rec): SourcePQMode {
  if (bool(i.pqEnabled) !== true) return 'off';
  const mode = isRec(i.pq) ? str(i.pq.mode) : '';
  return mode === 'always' ? 'always' : 'smart';
}

function inputPorts(i: Rec): string[] {
  const ports: string[] = [];
  const tcp = num(i.tcpPort);
  const udp = num(i.udpPort);
  const port = num(i.port);
  if (tcp !== null) ports.push(`${tcp}/tcp`);
  if (udp !== null) ports.push(`${udp}/udp`);
  if (port !== null && port !== tcp && port !== udp) ports.push(String(port));
  return ports;
}

const BACKPRESSURE: Record<string, Backpressure> = { queue: 'pq', drop: 'drop', block: 'block' };

export function normalizeWorkspace(raw: RawWorkspace, now = Date.now()): Workspace {
  const groups = normalizeGroups(raw.groups, raw.workers);
  const streamGroups = groups.filter((g) => g.kind === 'stream');
  const fleets = groups.filter((g) => g.kind === 'fleet');
  const skipped = { disabled: 0, internal: 0 };

  const inputs: ImportedInput[] = [];
  for (const g of streamGroups) {
    const seen = new Set<string>();
    for (const i of listItems(raw.inputs[g.id])) {
      const inputId = str(i.id);
      const criblType = str(i.type);
      if (!inputId || seen.has(inputId)) continue;
      seen.add(inputId);
      if (bool(i.disabled) === true) {
        skipped.disabled += 1;
        continue;
      }
      if (isInternalInput(criblType, inputId)) {
        skipped.internal += 1;
        continue;
      }
      const description = str(i.description);
      inputs.push({
        key: `${g.id}/${inputId}`,
        groupId: g.id,
        inputId,
        criblType: criblType || 'unknown',
        description,
        mappedType: mapInputType(criblType, inputId, description),
        pq: pqMode(i),
        ports: inputPorts(i),
      });
    }
  }

  const outputs = new Map<string, ImportedOutput>();
  for (const g of streamGroups) {
    const seen = new Set<string>();
    for (const o of listItems(raw.outputs[g.id])) {
      const outputId = str(o.id);
      const criblType = str(o.type);
      if (!outputId || seen.has(outputId)) continue;
      seen.add(outputId);
      if (bool(o.disabled) === true) {
        skipped.disabled += 1;
        continue;
      }
      if (isInternalOutput(criblType, outputId)) {
        skipped.internal += 1;
        continue;
      }
      const mappedType = mapOutputType(criblType);
      const key = `${mappedType}|${outputId}`;
      const existing = outputs.get(key);
      if (existing) {
        if (!existing.groupIds.includes(g.id)) existing.groupIds.push(g.id);
        continue;
      }
      outputs.set(key, {
        key,
        outputId,
        criblType: criblType || 'unknown',
        mappedType,
        groupIds: [g.id],
        backpressure: BACKPRESSURE[str(o.onBackpressure)] ?? null,
      });
    }
  }

  return {
    streamGroups,
    fleets,
    inputs: inputs.sort((a, b) => a.key.localeCompare(b.key)),
    outputs: [...outputs.values()].sort((a, b) => a.outputId.localeCompare(b.outputId)),
    license: normalizeLicense(raw.license, now),
    skipped,
  };
}

// ── Volume split ─────────────────────────────────────────────────────────────

export interface VolumeRow {
  selected: boolean;
  volumeOverride: number | null;
}

/**
 * Per-row GB/day: selected rows with a manual override keep it; the remaining total is split evenly
 * across the other selected rows. Unselected rows get 0. With no total, un-overridden rows get 0.
 */
export function splitVolume(totalGB: number | null, rows: VolumeRow[]): number[] {
  const selected = rows.filter((r) => r.selected);
  const overridden = selected.reduce((a, r) => a + (r.volumeOverride ?? 0), 0);
  const free = selected.filter((r) => r.volumeOverride === null).length;
  const share = totalGB !== null && free > 0 ? Math.max(0, totalGB - overridden) / free : 0;
  return rows.map((r) => (!r.selected ? 0 : r.volumeOverride !== null ? r.volumeOverride : round1(share)));
}

// ── Apply to design ──────────────────────────────────────────────────────────

export interface SourceSelection {
  input: ImportedInput;
  type: string;
  count: number;
  volumeGBPerDay: number;
}

export interface DestinationSelection {
  output: ImportedOutput;
  type: string;
}

export interface ImportResult {
  patch: Pick<Design, 'sources' | 'destinations' | 'importSnapshot'>;
  stats: { sourcesAdded: number; destinationsAdded: number; destinationsReused: number; routes: number };
}

export const importedSourceLabel = (i: Pick<ImportedInput, 'groupId' | 'inputId'>) => `${i.groupId}/${i.inputId}`;

/** An imported Destination already in the design with the same type and label (so re-imports don't duplicate). */
export const findExistingDestination = (design: Pick<Design, 'destinations'>, type: string, outputId: string): Destination | undefined =>
  design.destinations.find((d) => d.type === type && d.label === outputId);

export const hasExistingSource = (design: Pick<Design, 'sources'>, input: Pick<ImportedInput, 'groupId' | 'inputId'>) =>
  design.sources.some((s) => s.origin === 'imported' && s.label === importedSourceLabel(input));

export function buildSnapshot(ws: Workspace, workspaceLabel: string, sample: boolean, now = new Date()): ImportSnapshot {
  return {
    importedAt: now.toISOString(),
    workspaceLabel,
    groups: [...ws.streamGroups, ...ws.fleets].map((g) => ({
      id: g.id,
      name: g.name,
      onPrem: g.onPrem,
      isFleet: g.kind === 'fleet',
      workerCount: g.workerCount,
      totalVcpus: g.totalVcpus,
    })),
    dailyInGB: ws.license?.dailyInGB ?? null,
    dailyOutGB: ws.license?.dailyOutGB ?? null,
    sample,
  };
}

/**
 * Build the design patch: new Sources and Destinations (origin 'imported'), optional routes from each
 * imported Source to every imported Destination in the same Worker Group, and the workspace snapshot.
 */
export function buildImport(
  design: Pick<Design, 'sources' | 'destinations'>,
  sources: SourceSelection[],
  destinations: DestinationSelection[],
  opts: { connectRoutes: boolean; snapshot: ImportSnapshot },
): ImportResult {
  const newDests: Destination[] = [];
  const idByKey = new Map<string, string>();
  const destIdsByGroup = new Map<string, Set<string>>();
  let reused = 0;

  for (const sel of destinations) {
    const key = `${sel.type}|${sel.output.outputId}`;
    let id = idByKey.get(key);
    if (!id) {
      const existing = findExistingDestination(design, sel.type, sel.output.outputId);
      if (existing) {
        id = existing.id;
        reused += 1;
      } else {
        const d = makeDestination({
          type: sel.type,
          origin: 'imported',
          label: sel.output.outputId,
          ...(sel.output.backpressure ? { backpressure: sel.output.backpressure } : {}),
        });
        newDests.push(d);
        id = d.id;
      }
      idByKey.set(key, id);
    }
    for (const g of sel.output.groupIds) {
      const set = destIdsByGroup.get(g) ?? new Set<string>();
      set.add(id);
      destIdsByGroup.set(g, set);
    }
  }

  let routes = 0;
  const newSources: SourceGroup[] = sources.map((sel) => {
    const destinationIds = opts.connectRoutes ? [...(destIdsByGroup.get(sel.input.groupId) ?? [])] : [];
    routes += destinationIds.length;
    return makeSource({
      type: sel.type,
      count: Math.max(1, Math.round(sel.count) || 1),
      volumeGBPerDay: Math.max(0, sel.volumeGBPerDay || 0),
      complexity: 'unknown',
      pq: sel.input.pq,
      origin: 'imported',
      label: importedSourceLabel(sel.input),
      destinationIds,
    });
  });

  return {
    patch: {
      sources: [...design.sources, ...newSources],
      destinations: [...design.destinations, ...newDests],
      importSnapshot: opts.snapshot,
    },
    stats: { sourcesAdded: newSources.length, destinationsAdded: newDests.length, destinationsReused: reused, routes },
  };
}
