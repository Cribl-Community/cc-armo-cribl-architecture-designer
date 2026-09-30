/**
 * Cribl Config Preview — pure helpers that turn a sized design into the Cribl REST
 * payloads an engineer would send to build it. Preview only: nothing here performs I/O.
 */
import { describeDestination, sourceCategory } from '../../../engine/architecture';
import { PORTS, SIZING_RULES, complexityFactor, getDestinationType } from '../../../model/catalog';
import type { ArchitectureResult, Backpressure, Design, SourceGroup, SourcePQMode, WorkerGroupResult } from '../../../model/types';

export const PLACEHOLDER = '<set-in-cribl>';
export const DEFAULT_CLOUD_REGION = 'us-west-2';

export type HttpMethod = 'POST' | 'PATCH';
export type RequestKind = 'group' | 'settings' | 'pipeline' | 'output' | 'input' | 'collector' | 'routes' | 'fleet' | 'fleetPipeline' | 'fleetOutput';

export interface ConfigRequest {
  key: string;
  method: HttpMethod;
  path: string;
  title: string;
  kind: RequestKind;
  body: Record<string, unknown>;
  notes: string[];
}

export interface GroupConfigPreview {
  groupId: string;
  group: WorkerGroupResult;
  requests: ConfigRequest[];
  counts: { sources: number; destinations: number; routes: number; pipelines: number };
  notes: string[];
}

export interface FleetConfigPreview {
  fleetId: string;
  name: string;
  type: string;
  nodes: number;
  targetGroupId: string | null;
  targetGroupName: string | null;
  targetAddress: string;
  requests: ConfigRequest[];
}

export interface ConfigPreview {
  groups: GroupConfigPreview[];
  fleets: FleetConfigPreview[];
  totals: { groups: number; sources: number; destinations: number; routes: number; fleets: number; requests: number };
}

// ── Identifiers ────────────────────────────────────────────────────────────

/** Cribl object IDs allow letters, digits, `_` and `-`. */
export function slugId(text: string, sep: '_' | '-' = '_'): string {
  const s = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, sep)
    .replace(new RegExp(`^\\${sep}+|\\${sep}+$`, 'g'), '');
  return s || 'item';
}

/** Hands out unique IDs, suffixing `_2`, `_3`… on collisions. */
function idAllocator(sep: '_' | '-' = '_') {
  const used = new Set<string>();
  return (base: string) => {
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}${sep}${n++}`;
    used.add(id);
    return id;
  };
}

// ── Mapping helpers ─────────────────────────────────────────────────────────

const BACKPRESSURE: Record<Backpressure, 'block' | 'drop' | 'queue'> = { block: 'block', drop: 'drop', pq: 'queue' };

const ceilGB = (gb: number) => Math.max(1, Math.ceil(gb - 1e-9));

/** Strongest PQ mode across a set of sources that share one Cribl Source. */
function combinedPQ(sources: SourceGroup[]): SourcePQMode {
  if (sources.some((s) => s.pq === 'always')) return 'always';
  if (sources.some((s) => s.pq === 'smart')) return 'smart';
  return 'off';
}

type CloudProvider = 'aws' | 'azure' | 'gcp';

/** Infer the cloud provider from an imported/free-text label; AWS by default. */
export function inferCloudProvider(s: SourceGroup): CloudProvider {
  const text = `${s.label ?? ''}`.toLowerCase();
  if (/azure|event ?hub|entra|defender|office|m365/.test(text)) return 'azure';
  if (/gcp|google|pub ?sub|stackdriver/.test(text)) return 'gcp';
  return 'aws';
}

interface GroupCtx {
  design: Design;
  group: WorkerGroupResult;
  groupId: string;
  managed: boolean;
  survivingNodes: number;
  workerProcesses: number;
  dropFactor: number;
  hours: number;
}

/** Source-side PQ settings for a Cribl Source fed by `sources`. */
function sourcePQ(ctx: GroupCtx, sources: SourceGroup[]): { fields: Record<string, unknown>; notes: string[] } {
  const mode = combinedPQ(sources);
  const notes: string[] = [];
  if (mode === 'off') return { fields: { pqEnabled: false }, notes };
  if (ctx.managed) {
    if (mode === 'smart') notes.push('Cribl.Cloud-managed Worker Groups support Source PQ in Always On mode only, so Smart was converted to Always On.');
    notes.push('Queue size and disk are managed by Cribl.Cloud.');
    return { fields: { pqEnabled: true, pq: { mode: 'always', compress: 'gzip' } }, notes };
  }
  const hourly = sources.filter((s) => s.pq !== 'off').reduce((a, s) => a + (s.volumeGBPerDay || 0) / 24, 0);
  const perNode = (hourly * ctx.hours) / ctx.survivingNodes;
  const perProcess = ceilGB(perNode / ctx.workerProcesses);
  notes.push(
    `PQ sized for a ${ctx.hours}h outage: ${hourly.toFixed(1)} GB/h × ${ctx.hours}h ÷ ${ctx.survivingNodes} surviving nodes ≈ ${Math.ceil(perNode)} GB per node, i.e. ${perProcess} GB per Worker Process (Cribl applies the limit per Worker Process).`,
  );
  return {
    fields: { pqEnabled: true, pq: { mode, maxSize: `${perProcess}GB`, maxFileSize: '1 MB', path: '$CRIBL_HOME/state/queues', compress: 'gzip' } },
    notes,
  };
}

/** Destination-type specific placeholder fields. Credentials are never generated. */
function outputTypeFields(criblType: string): Record<string, unknown> {
  switch (criblType) {
    case 'splunk_lb':
      return { hosts: [{ host: '<splunk-indexer-1>', port: 9997, tls: 'inherit', weight: 1 }], dnsResolvePeriodSec: 600, authType: 'manual', authToken: PLACEHOLDER, tls: { disabled: false } };
    case 'sentinel':
      return {
        loginUrl: 'https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token',
        client_id: PLACEHOLDER,
        secret: PLACEHOLDER,
        scope: 'https://monitor.azure.com/.default',
        endpointURLConfiguration: 'ID',
        dceEndpoint: 'https://<dce-name>.<region>.ingest.monitor.azure.com',
        dcrID: PLACEHOLDER,
        streamName: 'Custom-CriblStream_CL',
        format: 'ndjson',
      };
    case 's3':
      return { bucket: PLACEHOLDER, region: DEFAULT_CLOUD_REGION, awsAuthenticationMethod: 'auto', destPath: 'cribl', partitionExpr: "C.Time.strftime(_time ? _time : Date.now()/1000, '%Y/%m/%d/%H')", format: 'json', compress: 'gzip' };
    case 'cribl_lake':
      return { dest: 'default_logs', format: 'json', compress: 'gzip' };
    case 'elastic':
      return { url: 'https://<elasticsearch-host>:9200/_bulk', index: 'cribl', auth: { disabled: false, authType: 'manual', username: PLACEHOLDER, password: PLACEHOLDER } };
    case 'datadog':
      return { site: 'us', apiKey: PLACEHOLDER, sendCountersAsCount: false, compress: true };
    case 'newrelic':
      return { region: 'US', logType: 'cribl', apiKey: PLACEHOLDER };
    case 'google_chronicle':
      return { apiVersion: 'v2', authenticationMethod: 'serviceAccount', serviceAccountCredentials: PLACEHOLDER, customerId: PLACEHOLDER, region: 'US', logFormatType: 'unstructured', logType: PLACEHOLDER };
    default:
      return { url: 'https://<receiver-host>/ingest', method: 'POST', format: 'ndjson', authType: 'token', token: PLACEHOLDER };
  }
}

/** Queue share per Worker Process for one Destination in one group. */
function destinationPQ(ctx: GroupCtx, destId: string): { fields: Record<string, unknown>; notes: string[] } {
  if (ctx.managed) {
    return {
      fields: { pqMaxSize: '1GB', pqPath: '$CRIBL_HOME/state/queues', pqMode: 'error', pqCompress: 'gzip', pqOnBackpressure: 'block' },
      notes: ['Cribl.Cloud-managed Worker Groups provide 1 GB of Destination PQ per Worker Process (fixed).'],
    };
  }
  const hourly = ctx.group.sources.filter((s) => s.destinationIds.includes(destId)).reduce((a, s) => a + ((s.volumeGBPerDay || 0) / 24) * ctx.dropFactor, 0);
  const perNode = (hourly * ctx.hours) / ctx.survivingNodes;
  const perProcess = ceilGB(perNode / ctx.workerProcesses);
  return {
    fields: { pqMaxSize: `${perProcess}GB`, pqMaxFileSize: '1 MB', pqPath: '$CRIBL_HOME/state/queues', pqMode: 'error', pqCompress: 'gzip', pqOnBackpressure: 'block' },
    notes: [`PQ sized for a ${ctx.hours}h outage: ${hourly.toFixed(1)} GB/h after filtering × ${ctx.hours}h ÷ ${ctx.survivingNodes} surviving nodes ≈ ${Math.ceil(perNode)} GB per node, ${perProcess} GB per Worker Process.`],
  };
}

function cloudCollector(ctx: GroupCtx, s: SourceGroup, key: string): ConfigRequest {
  const inputBase = { streamtags: ['architecture-designer'], description: `${s.label || s.type} (${s.count} account${s.count === 1 ? '' : 's'}, ~${Math.round(s.volumeGBPerDay)} GB/day)` };
  const pq = sourcePQ(ctx, [s]);

  if (s.type === 'SaaS Application') {
    const id = `saas_${key}`;
    return {
      key: `${ctx.groupId}:collector:${id}`,
      method: 'POST',
      path: `/m/${ctx.groupId}/lib/jobs`,
      title: `REST Collector: ${s.label || s.type}`,
      kind: 'collector',
      body: {
        id,
        type: 'collection',
        ttl: '4h',
        removeFields: [],
        resumeOnBoot: true,
        schedule: { enabled: true, cronSchedule: '*/5 * * * *', maxConcurrentRuns: 1, skippable: true, run: { mode: 'run', timeRangeType: 'relative', earliest: '-5m@m', latest: '@m', stateTracking: { enabled: true } } },
        collector: {
          type: 'rest',
          conf: {
            discovery: { discoverType: 'none' },
            collectMethod: 'get',
            collectUrl: "'https://<saas-api-host>/v1/audit/events'",
            collectRequestParams: [
              { name: 'since', value: '`${C.Time.strftime(earliest, "%Y-%m-%dT%H:%M:%SZ")}`' },
              { name: 'until', value: '`${C.Time.strftime(latest, "%Y-%m-%dT%H:%M:%SZ")}`' },
            ],
            pagination: { type: 'response_header_link', nextRelationAttribute: 'next', maxPages: 50 },
            authentication: 'login',
            loginUrl: "'https://<saas-api-host>/oauth/token'",
            loginBody: "`grant_type=client_credentials&client_id=${username}&client_secret=${password}`",
            username: PLACEHOLDER,
            password: PLACEHOLDER,
            tokenRespAttribute: 'access_token',
            authHeaderExpr: '`Bearer ${token}`',
          },
        },
        input: { type: 'collection', breakerRulesets: [], staleChannelFlushMs: 10000, sendToRoutes: true, ...inputBase },
      },
      notes: ['Collector job (pull). Runs on the Worker Group, no load balancer involved. Replace the URL, pagination, and auth with the SaaS vendor API details.', ...(s.pq !== 'off' ? ['Collector jobs are re-runnable and tracked by state, so Source PQ does not apply here; protect delivery with Destination PQ.'] : [])],
    };
  }

  const provider = inferCloudProvider(s);
  if (provider === 'azure') {
    const id = `in_event_hub_${key}`;
    return {
      key: `${ctx.groupId}:input:${id}`,
      method: 'POST',
      path: `/m/${ctx.groupId}/system/inputs`,
      title: `Azure Event Hubs: ${s.label || s.type}`,
      kind: 'input',
      body: {
        id,
        type: 'azure_event_hub',
        brokers: ['<namespace>.servicebus.windows.net:9093'],
        topics: ['<event-hub-name>'],
        groupId: 'cribl',
        fromBeginning: false,
        sasl: { disabled: false, mechanism: 'plain', username: '$ConnectionString', password: PLACEHOLDER },
        tls: { disabled: false },
        ...pq.fields,
        ...inputBase,
      },
      notes: ['Pull integration (Kafka protocol) on the Worker Group. Provider inferred from the Source label.', ...pq.notes],
    };
  }
  if (provider === 'gcp') {
    const id = `in_pubsub_${key}`;
    return {
      key: `${ctx.groupId}:input:${id}`,
      method: 'POST',
      path: `/m/${ctx.groupId}/system/inputs`,
      title: `Google Cloud Pub/Sub: ${s.label || s.type}`,
      kind: 'input',
      body: { id, type: 'google_pubsub', topicName: '<topic>', subscriptionName: '<subscription>', googleAuthMethod: 'manual', serviceAccountCredentials: PLACEHOLDER, maxBacklog: 1000, ...pq.fields, ...inputBase },
      notes: ['Pull integration on the Worker Group. Provider inferred from the Source label.', ...pq.notes],
    };
  }
  const id = `in_s3_${key}`;
  return {
    key: `${ctx.groupId}:input:${id}`,
    method: 'POST',
    path: `/m/${ctx.groupId}/system/inputs`,
    title: `Amazon S3 (SQS): ${s.label || s.type}`,
    kind: 'input',
    body: {
      id,
      type: 's3',
      queueName: `https://sqs.${DEFAULT_CLOUD_REGION}.amazonaws.com/<account-id>/<s3-notification-queue>`,
      region: DEFAULT_CLOUD_REGION,
      awsAuthenticationMethod: 'auto',
      assumeRoleArn: 'arn:aws:iam::<account-id>:role/<cribl-reader-role>',
      fileFilter: '/.*/',
      numReceivers: 1,
      maxMessages: 1,
      visibilityTimeout: 600,
      ...pq.fields,
      ...inputBase,
    },
    notes: ['S3 + SQS pull integration on the Worker Group: CloudTrail, VPC Flow, ELB and similar logs land in S3 and notify SQS. For Azure use Event Hubs; for GCP use Pub/Sub.', ...pq.notes],
  };
}

// ── Main builder ────────────────────────────────────────────────────────────

export function buildConfigPreview(design: Design, result: ArchitectureResult): ConfigPreview {
  const arch = result.architecture;
  const groupIds = idAllocator('_');
  const sourceKeys = idAllocator('_');
  const outputIds = idAllocator('_');
  const fleetIds = idAllocator('-');

  // Stable, design-wide IDs so the same Source/Destination is named the same everywhere.
  const sourceKey = new Map<string, string>();
  for (const s of design.sources) sourceKey.set(s.id, sourceKeys(slugId(s.label || s.type)));
  const outputId = new Map<string, string>();
  for (const d of design.destinations) outputId.set(d.id, outputIds(`out_${slugId(d.label || getDestinationType(d.type).label)}`));
  const fleetId = new Map<string, string>();
  for (const f of arch.edgeFleets) fleetId.set(f.sourceId, fleetIds(`${slugId(f.type, '-')}-fleet`));

  const perProcessGB = design.drivers.cpuArch === 'arm' ? SIZING_RULES.arm.gbPerDayPerVcpu : SIZING_RULES.x86.gbPerDayPerVcpu * 2;
  const groupOf = new Map<string, { id: string; g: WorkerGroupResult }>();

  const groups: GroupConfigPreview[] = arch.workerGroups.map((g) => {
    const groupId = groupIds(slugId(g.name));
    for (const s of g.sources) groupOf.set(s.id, { id: groupId, g });
    const managed = g.managedBy === 'cribl';
    const ctx: GroupCtx = {
      design,
      group: g,
      groupId,
      managed,
      survivingNodes: Math.max(1, g.nodes - g.haSpareNodes),
      workerProcesses: Math.max(1, g.profile.workerProcesses),
      dropFactor: 1 - design.drivers.filteringDropPercent / 100,
      hours: design.drivers.pqOutageHours,
    };
    const requests: ConfigRequest[] = [];
    const notes: string[] = [];
    const isArm = g.profile.arch === 'arm';
    const reserve = isArm ? -1 : -2;

    // 1. Worker Group
    requests.push({
      key: `${groupId}:group`,
      method: 'POST',
      path: '/products/stream/groups',
      title: `Worker Group: ${g.name}`,
      kind: 'group',
      body: {
        id: groupId,
        name: g.name,
        description: managed
          ? `Cribl-managed Worker Group (${g.category === 'all' ? 'all Sources' : g.category}) sized at ~${g.cloudTierTBPerDay} TB/day ingest tier. Generated by ArMo - Cribl Architecture Designer.`
          : `${g.nodes} × ${g.profile.vcpus} vCPU ${isArm ? 'ARM' : 'x86'} Worker Nodes (${g.totalWorkerProcesses} Worker Processes). Generated by ArMo - Cribl Architecture Designer.`,
        onPrem: !managed,
        isFleet: false,
        workerRemoteAccess: true,
        tags: 'architecture-designer',
        ...(managed ? { cloud: { provider: 'aws', region: DEFAULT_CLOUD_REGION }, estimatedIngestRate: (g.cloudTierTBPerDay ?? 1) * 1024 } : {}),
      },
      notes: managed
        ? [
            `Cribl-managed: sizing tier ≈ peak in+out ÷ 3 = ~${g.cloudTierTBPerDay} TB/day (estimatedIngestRate ${((g.cloudTierTBPerDay ?? 1) * 1024).toLocaleString()} GB/day). Cribl.Cloud provisions the group in ~30 minutes and keeps it highly available.`,
            `Region ${DEFAULT_CLOUD_REGION} is a placeholder: choose the AWS region closest to your Sources and Destinations.`,
          ]
        : [`Customer-managed: install ${g.nodes} Worker Nodes (${g.profile.vcpus} vCPU, ${g.profile.ramGB} GB RAM, ${g.recommendedDiskPerNodeGB} GB disk each) and point them at the Leader on port ${PORTS.WORKER_TO_LEADER}.`],
    });

    // 2. Worker Process settings (customer-managed only)
    if (!managed) {
      requests.push({
        key: `${groupId}:settings`,
        method: 'PATCH',
        path: `/m/${groupId}/system/settings/conf`,
        title: 'Worker Process settings',
        kind: 'settings',
        body: { workers: { count: reserve, minimum: 2, memory: SIZING_RULES.heapGBPerWorkerProcess * 1024 } },
        notes: [
          `Worker Process count ${reserve}: one Worker Process per vCPU minus ${Math.abs(reserve)} reserved for the OS and API (${isArm ? 'ARM' : 'x86'}), i.e. ${g.profile.workerProcesses} Worker Processes on a ${g.profile.vcpus}-vCPU node, each with ~${SIZING_RULES.heapGBPerWorkerProcess} GB heap.`,
        ],
      });
    } else {
      notes.push('Worker Process count and memory are managed by Cribl.Cloud for Cribl-managed Worker Groups.');
    }

    // 3. Pipelines (one stub per Source so every Route has a real target)
    const pipelines: ConfigRequest[] = g.sources.map((s) => {
      const key = sourceKey.get(s.id)!;
      const id = `${key}_processing`;
      const cf = complexityFactor(s.complexity);
      const drop = design.drivers.filteringDropPercent;
      return {
        key: `${groupId}:pipeline:${id}`,
        method: 'POST',
        path: `/m/${groupId}/pipelines`,
        title: `Pipeline: ${id}`,
        kind: 'pipeline',
        body: {
          id,
          conf: {
            output: 'default',
            streamtags: ['architecture-designer'],
            groups: {},
            asyncFuncTimeout: 1000,
            description: `${s.label || s.type}: ${s.complexity} processing (sized with ×${cf} headroom).`,
            functions: [
              { id: 'comment', filter: 'true', conf: { comment: `Starter pipeline for ${s.label || s.type}. Add parsing, enrichment and reduction for ${s.complexity} complexity.` } },
              ...(drop > 0
                ? [{ id: 'drop', filter: 'false', disabled: true, description: `Target ~${drop}% reduction: replace the filter with an expression matching low-value events, then enable.`, conf: {} }]
                : []),
            ],
          },
        },
        notes: [],
      };
    });

    // 4. Destinations
    const outputs: ConfigRequest[] = g.destinationIds
      .map((destId) => design.destinations.find((d) => d.id === destId))
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map((d) => {
        const def = getDestinationType(d.type);
        const id = outputId.get(d.id)!;
        const onBackpressure = BACKPRESSURE[d.backpressure];
        const pq = onBackpressure === 'queue' ? destinationPQ(ctx, d.id) : { fields: {}, notes: [] as string[] };
        const lakeNotes = def.criblOutputType === 'cribl_lake' && !managed ? ['Cribl Lake is a Cribl.Cloud Destination: available when this group is connected to a Cribl.Cloud Leader (hybrid).'] : [];
        return {
          key: `${groupId}:output:${id}`,
          method: 'POST' as const,
          path: `/m/${groupId}/system/outputs`,
          title: d.label && d.label !== def.label ? `${def.label}: ${d.label}` : def.label,
          kind: 'output' as const,
          body: {
            id,
            type: def.criblOutputType,
            ...outputTypeFields(def.criblOutputType),
            onBackpressure,
            ...pq.fields,
            systemFields: ['cribl_pipe'],
            streamtags: ['architecture-designer'],
            description: `${describeDestination(d.id, design)}. Credentials must be set in Cribl.`,
          },
          notes: [`Backpressure: ${onBackpressure === 'queue' ? 'Persistent Queue' : onBackpressure === 'block' ? 'Block (apply backpressure upstream)' : 'Drop events'}.`, ...pq.notes, ...lakeNotes],
        };
      });

    // 5. Sources
    const inputs: ConfigRequest[] = [];
    const filters = new Map<string, string>();
    const endpoint = g.sources.filter((s) => sourceCategory(s) === 'endpoint');
    const network = g.sources.filter((s) => sourceCategory(s) === 'network');
    const cloud = g.sources.filter((s) => sourceCategory(s) === 'cloud');

    if (endpoint.length > 0) {
      const pq = sourcePQ(ctx, endpoint);
      inputs.push({
        key: `${groupId}:input:in_cribl_tcp`,
        method: 'POST',
        path: `/m/${groupId}/system/inputs`,
        title: `Cribl TCP from Edge Fleets (${PORTS.CRIBL_TCP})`,
        kind: 'input',
        body: {
          id: 'in_cribl_tcp',
          type: 'cribl_tcp',
          host: '0.0.0.0',
          port: PORTS.CRIBL_TCP,
          tls: { disabled: false, certificateName: PLACEHOLDER },
          maxActiveCxn: 1000,
          enableProxyHeader: false,
          ...pq.fields,
          streamtags: ['architecture-designer'],
          description: `Receives ${endpoint.map((s) => s.label || s.type).join(', ')} from Edge Fleets${g.usesLoadBalancer ? ' through the load balancer' : ''}.`,
        },
        notes: [`Edge Fleets send to this Source over Cribl TCP ${PORTS.CRIBL_TCP}.${g.usesLoadBalancer ? ` Load balancer health check: HTTP GET ${PORTS.HEALTH_PATH} on port ${PORTS.UI_API}.` : ''}`, ...pq.notes],
      });
      for (const s of endpoint) filters.set(s.id, `__inputId.startsWith('cribl_tcp:in_cribl_tcp') && fleet=='${fleetId.get(s.id) ?? slugId(s.type, '-') + '-fleet'}'`);
    }

    if (network.length > 0) {
      const pq = sourcePQ(ctx, network);
      const hot = network.filter((s) => (s.volumeGBPerDay || 0) / Math.max(1, s.count) > perProcessGB);
      inputs.push({
        key: `${groupId}:input:in_syslog`,
        method: 'POST',
        path: `/m/${groupId}/system/inputs`,
        title: `Syslog (${PORTS.SYSLOG} TCP + UDP)`,
        kind: 'input',
        body: {
          id: 'in_syslog',
          type: 'syslog',
          host: '0.0.0.0',
          tcpPort: PORTS.SYSLOG,
          udpPort: PORTS.SYSLOG,
          tls: { disabled: true },
          enableLoadBalancing: hot.length > 0,
          singleMsgUdpPackets: false,
          keepFieldsList: [],
          octetCounting: false,
          inferFraming: true,
          timestampTimezone: 'local',
          ...pq.fields,
          streamtags: ['architecture-designer'],
          description: `Syslog from ${network.map((s) => `${s.label || s.type} (${s.count})`).join(', ')}.`,
        },
        notes: [
          `Cribl's default Syslog port is ${PORTS.SYSLOG}; use ${PORTS.SYSLOG_LEGACY} only for devices that cannot change port. Prefer TCP (optionally TLS) for reliable delivery.`,
          ...(hot.length > 0 ? [`TCP load balancing enabled: ${hot.map((s) => s.type).join(', ')} send more than one Worker Process can handle (~${perProcessGB} GB/day) per connection.`] : []),
          ...pq.notes,
        ],
      });
      for (const s of network) {
        filters.set(
          s.id,
          network.length === 1 ? `__inputId.startsWith('syslog:in_syslog')` : `__inputId.startsWith('syslog:in_syslog') && C.Net.cidrMatch('<${slugId(s.label || s.type, '-')}-sender-cidrs>', __srcIpPort.split(':')[0])`,
        );
      }
    }

    for (const s of cloud) {
      const req = cloudCollector(ctx, s, sourceKey.get(s.id)!);
      inputs.push(req);
      const id = String(req.body.id);
      filters.set(s.id, req.kind === 'collector' ? `__inputId=='collection:${id}'` : `__inputId=='${String(req.body.type)}:${id}'`);
    }

    // 6. Routes — one per Source → Destination; all but the last per Source are non-final (clone and continue).
    const routes: Record<string, unknown>[] = [];
    for (const s of g.sources) {
      const dests = s.destinationIds.filter((id) => outputId.has(id));
      if (dests.length === 0) {
        notes.push(`${s.label || s.type} has no Destinations, so no Route was generated for it (the catch-all drops it).`);
        continue;
      }
      const key = sourceKey.get(s.id)!;
      dests.forEach((destId, i) => {
        const out = outputId.get(destId)!;
        routes.push({
          id: `route_${key}_to_${out.replace(/^out_/, '')}`,
          name: `${s.label || s.type} → ${describeDestination(destId, design)}`,
          filter: filters.get(s.id) ?? 'false',
          pipeline: `${key}_processing`,
          output: out,
          final: i === dests.length - 1,
          disabled: false,
          enableOutputExpression: false,
          description: dests.length > 1 && i < dests.length - 1 ? 'Non-final: a copy continues to the next Route for fan-out.' : 'Final Route for this Source.',
        });
      });
    }
    const routeCount = routes.length;
    routes.push({ id: 'catch_all', name: 'Catch-all (unrouted data)', filter: 'true', pipeline: 'passthru', output: 'devnull', final: true, disabled: false, description: 'Drops anything not matched above. Point this at a default Destination if you prefer to keep unrouted data.' });

    requests.push(...pipelines, ...outputs, ...inputs);
    requests.push({
      key: `${groupId}:routes`,
      method: 'PATCH',
      path: `/m/${groupId}/routes/default`,
      title: `Routing table (${routeCount} Route${routeCount === 1 ? '' : 's'} + catch-all)`,
      kind: 'routes',
      body: { id: 'default', groups: {}, comments: [], routes },
      notes: ['Replaces the group routing table, so review it against any existing Routes before applying. Fan-out uses non-final Routes: each non-final Route sends a copy and lets the event continue.'],
    });

    return {
      groupId,
      group: g,
      requests,
      counts: { sources: inputs.length, destinations: outputs.length, routes: routeCount, pipelines: pipelines.length },
      notes,
    };
  });

  // 7. Edge Fleets
  const fleets: FleetConfigPreview[] = arch.edgeFleets.map((f) => {
    const id = fleetId.get(f.sourceId)!;
    const target = groupOf.get(f.sourceId) ?? null;
    const tg = target?.g;
    const address = !tg
      ? '<worker-group-address>'
      : tg.managedBy === 'cribl'
        ? `${target!.id.replace(/_/g, '-')}.<workspace>.<organization-id>.cribl.cloud`
        : tg.usesLoadBalancer
          ? `<${target!.id.replace(/_/g, '-')}-lb.your-domain>`
          : '<worker-node-address>';
    const src = design.sources.find((s) => s.id === f.sourceId);
    const tagPipeline = 'tag_fleet';
    const outId = target ? `out_stream_${target.id}` : 'out_stream';
    return {
      fleetId: id,
      name: f.name,
      type: f.type,
      nodes: f.nodes,
      targetGroupId: target?.id ?? null,
      targetGroupName: tg?.name ?? null,
      targetAddress: address,
      requests: [
        {
          key: `${id}:fleet`,
          method: 'POST',
          path: '/products/edge/groups',
          title: `Edge Fleet: ${f.name}`,
          kind: 'fleet',
          body: { id, name: f.name, description: `${f.nodes.toLocaleString()} ${f.type} Edge Nodes. Forwards to ${tg ? `Worker Group ${tg.name}` : 'Stream'}. Generated by ArMo - Cribl Architecture Designer.`, isFleet: true, onPrem: true, tags: 'architecture-designer' },
          notes: [`Install Cribl Edge on the ${f.nodes.toLocaleString()} ${f.type} hosts and enroll them in this Fleet. Split into Subfleets (e.g. by site or role) as needed.`],
        },
        {
          key: `${id}:pipeline`,
          method: 'POST',
          path: `/m/${id}/pipelines`,
          title: `Pipeline: ${tagPipeline}`,
          kind: 'fleetPipeline',
          body: { id: tagPipeline, conf: { output: 'default', groups: {}, asyncFuncTimeout: 1000, description: 'Tags events with their Fleet so Stream Routes can select them.', functions: [{ id: 'eval', filter: 'true', conf: { add: [{ name: 'fleet', value: `'${id}'` }] } }] } },
          notes: ['Used as the post-processing Pipeline on the Stream Destination below; the Worker Group Routes filter on the fleet field.'],
        },
        {
          key: `${id}:output`,
          method: 'POST',
          path: `/m/${id}/system/outputs`,
          title: `Cribl TCP → ${tg?.name ?? 'Worker Group'} (${PORTS.CRIBL_TCP})`,
          kind: 'fleetOutput',
          body: {
            id: outId,
            type: 'cribl_tcp',
            loadBalanced: false,
            host: address,
            port: PORTS.CRIBL_TCP,
            tls: { disabled: false },
            compression: 'gzip',
            pipeline: tagPipeline,
            onBackpressure: src && src.pq !== 'off' ? 'queue' : 'block',
            ...(src && src.pq !== 'off' ? { pqMaxSize: '5GB', pqPath: '$CRIBL_HOME/state/queues', pqMode: 'error', pqOnBackpressure: 'block' } : {}),
            streamtags: ['architecture-designer'],
            description: `Edge → Stream over Cribl TCP ${PORTS.CRIBL_TCP}.`,
          },
          notes: [
            tg?.managedBy === 'cribl'
              ? 'Target is the Cribl-managed Worker Group ingest address (TLS on).'
              : tg?.usesLoadBalancer
                ? `Target is the load balancer VIP in front of the Worker Nodes. Health check: HTTP GET ${PORTS.HEALTH_PATH} on port ${PORTS.UI_API}.`
                : 'Target is the Worker Node address.',
            'Set it as the Fleet default Destination (or add a Route to it).',
          ],
        },
      ],
    };
  });

  const totals = {
    groups: groups.length,
    sources: groups.reduce((a, g) => a + g.counts.sources, 0),
    destinations: groups.reduce((a, g) => a + g.counts.destinations, 0),
    routes: groups.reduce((a, g) => a + g.counts.routes, 0),
    fleets: fleets.length,
    requests: groups.reduce((a, g) => a + g.requests.length, 0) + fleets.reduce((a, f) => a + f.requests.length, 0),
  };
  return { groups, fleets, totals };
}

/** Everything in apply order, for the "Download all as JSON" bundle. */
export function buildBundle(design: Design, preview: ConfigPreview, generatedAt = new Date().toISOString()) {
  const order: RequestKind[] = ['group', 'settings', 'pipeline', 'output', 'input', 'collector', 'routes'];
  const groupRequests = order.flatMap((kind) => preview.groups.flatMap((g) => g.requests.filter((r) => r.kind === kind)));
  const fleetRequests = (['fleet', 'fleetPipeline', 'fleetOutput'] as RequestKind[]).flatMap((kind) => preview.fleets.flatMap((f) => f.requests.filter((r) => r.kind === kind)));
  return {
    generator: 'ArMo - Cribl Architecture Designer',
    previewOnly: true,
    note: 'Nothing in this file has been applied to any workspace. Replace every <set-in-cribl> and <...> placeholder, then commit and deploy each group after applying.',
    generatedAt,
    design: { id: design.id, name: design.name, customer: design.customer, mode: design.mode, deploymentModel: design.drivers.deploymentModel },
    totals: preview.totals,
    requests: [...groupRequests, ...fleetRequests].map((r, i) => ({ step: i + 1, method: r.method, path: r.path, title: r.title, body: r.body, notes: r.notes })),
  };
}

export const bundleFileName = (design: Design) => `${slugId(design.name, '-')}-cribl-config-preview.json`;
