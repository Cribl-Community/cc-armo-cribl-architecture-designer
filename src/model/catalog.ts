import type { Complexity, CpuArch, DeploymentModel, LocationType, Mode, NodeProfile, NodeSize, SourceCategory } from './types';

export interface SourceTypeDef {
  value: string;
  label: string;
  description: string;
  /** Fixed category, or null when it depends on the user's location answer. */
  category: SourceCategory | null;
  defaultLocation: LocationType | null;
  collectionMethod: string;
  routing: string;
  explanation: string;
  criblInputHint: string;
}

const ENDPOINT = {
  category: 'endpoint' as const,
  defaultLocation: 'distributed' as const,
  collectionMethod: 'Cribl Edge',
  routing: 'Edge Fleet → Cribl TCP (10300) → Load Balancer → Worker Group',
  explanation:
    'These are distributed systems where logs are generated across many hosts. Cribl Edge is installed locally for efficient collection and preprocessing.',
};
const NETWORK = {
  category: 'network' as const,
  defaultLocation: 'centralized' as const,
  collectionMethod: 'Syslog Source',
  routing: 'Syslog (9514 TCP/UDP) → Load Balancer → Worker Group',
  explanation:
    'Network devices cannot have agents installed. They forward logs via syslog to a Cribl Stream Syslog Source on the Worker Group.',
};
const CLOUD = {
  category: 'cloud' as const,
  defaultLocation: 'centralized' as const,
  collectionMethod: 'Cloud Collector / API',
  routing: 'Cloud API / queue ← pulled by Worker Group (no load balancer)',
  explanation:
    'Cloud platforms provide native APIs and queues for log collection. Cribl Stream Worker Groups pull the data directly, without agents or load balancers.',
};

export const SOURCE_TYPES: SourceTypeDef[] = [
  { value: 'Windows', label: 'Windows', description: 'Windows servers and endpoints. Requires Cribl Edge for distributed collection.', ...ENDPOINT, criblInputHint: 'Edge: Windows Event Logs' },
  { value: 'Linux', label: 'Linux', description: 'Linux servers and hosts. Requires Cribl Edge for distributed collection.', ...ENDPOINT, criblInputHint: 'Edge: File Monitor / Journal Files' },
  { value: 'Kubernetes', label: 'Kubernetes', description: 'Container orchestration platform. Requires Cribl Edge for pod-level collection.', ...ENDPOINT, criblInputHint: 'Edge: Kubernetes Logs / Metrics' },
  { value: 'Firewall', label: 'Firewall', description: 'Network security devices. Uses syslog forwarding (no agent installation).', ...NETWORK, criblInputHint: 'Syslog' },
  { value: 'Router', label: 'Router', description: 'Network routing devices. Uses syslog forwarding (no agent installation).', ...NETWORK, criblInputHint: 'Syslog' },
  { value: 'Switch', label: 'Switch', description: 'Network switching devices. Uses syslog forwarding (no agent installation).', ...NETWORK, criblInputHint: 'Syslog' },
  { value: 'Network Device', label: 'Network Device', description: 'Other network appliances. Uses syslog forwarding (no agent installation).', ...NETWORK, criblInputHint: 'Syslog / NetFlow & IPFIX' },
  { value: 'Cloud (AWS/Azure/GCP)', label: 'Cloud (AWS/Azure/GCP)', description: 'Cloud platform logs. Uses native API collectors (no agent required).', ...CLOUD, criblInputHint: 'Amazon S3 (SQS) / Azure Event Hubs / Google Cloud Pub/Sub' },
  { value: 'SaaS Application', label: 'SaaS Application', description: 'Cloud-based applications. Uses API-based collection.', ...CLOUD, criblInputHint: 'REST Collector' },
  { value: 'Application Logs', label: 'Application Logs', description: 'Custom application logs. Collection method depends on deployment.', ...ENDPOINT, criblInputHint: 'Edge: File Monitor' },
  {
    value: 'Database',
    label: 'Database',
    description: 'Database logs and audit trails. Typically centralized collection.',
    category: null,
    defaultLocation: 'centralized',
    collectionMethod: 'To be determined',
    routing: 'Depends on collection method',
    explanation: 'Database audit logs are usually forwarded centrally (syslog/API) but can also be read by Edge on the DB host.',
    criblInputHint: 'Syslog / Database Collector / Edge File Monitor',
  },
  {
    value: 'Custom / Other',
    label: 'Custom / Other',
    description: 'Other log sources. You will be asked to specify collection method.',
    category: null,
    defaultLocation: null,
    collectionMethod: 'To be determined',
    routing: 'Depends on collection method',
    explanation: 'Custom source type requires manual configuration.',
    criblInputHint: 'Depends on source',
  },
];

export const getSourceType = (type: string): SourceTypeDef =>
  SOURCE_TYPES.find((s) => s.value === type) ?? SOURCE_TYPES[SOURCE_TYPES.length - 1];

/** Category drives Edge vs listener vs pull. For location-dependent types the user's answer decides. */
export const categoryOf = (type: string, locationType: LocationType): SourceCategory => {
  const def = getSourceType(type);
  if (def.category) return def.category;
  return locationType === 'distributed' ? 'endpoint' : 'network';
};

export const CATEGORY_LABELS: Record<SourceCategory, string> = {
  endpoint: 'Endpoint',
  network: 'Network',
  cloud: 'Cloud',
};

export const WORKER_GROUP_NAMES: Record<SourceCategory | 'all', string> = {
  endpoint: 'Endpoint & Edge Ingest',
  network: 'Network & Syslog Ingest',
  cloud: 'Cloud Collection',
  all: 'General Processing',
};

export interface DestinationTypeDef {
  value: string;
  label: string;
  description: string;
  criblOutputType: string;
  isCribl: boolean;
}

export const DESTINATION_TYPES: DestinationTypeDef[] = [
  { value: 'Splunk', label: 'Splunk', description: 'Enterprise log analysis and monitoring platform. Common for IT operations and security.', criblOutputType: 'splunk_lb', isCribl: false },
  { value: 'Microsoft Sentinel', label: 'Microsoft Sentinel', description: 'Cloud-native SIEM for security analytics and threat detection.', criblOutputType: 'sentinel', isCribl: false },
  { value: 'S3', label: 'Amazon S3', description: 'Object storage for long-term log retention and archival. Cost-effective for compliance.', criblOutputType: 's3', isCribl: false },
  { value: 'Cribl Lake', label: 'Cribl Lake', description: 'Cribl-managed storage with built-in search. Optimized for cost and performance. Cribl.Cloud only.', criblOutputType: 'cribl_lake', isCribl: true },
  { value: 'Elasticsearch', label: 'Elasticsearch', description: 'Open-source search and analytics engine. Popular for log aggregation.', criblOutputType: 'elastic', isCribl: false },
  { value: 'Datadog', label: 'Datadog', description: 'Cloud monitoring and observability platform. Used for metrics and logs.', criblOutputType: 'datadog', isCribl: false },
  { value: 'New Relic', label: 'New Relic', description: 'Application performance monitoring (APM) and observability platform.', criblOutputType: 'newrelic', isCribl: false },
  { value: 'Chronicle', label: 'Google SecOps (Chronicle)', description: 'Google Cloud security analytics platform for threat detection.', criblOutputType: 'google_chronicle', isCribl: false },
  { value: 'Other SIEM', label: 'Other SIEM', description: 'Other security information and event management systems.', criblOutputType: 'webhook', isCribl: false },
  { value: 'Other', label: 'Other', description: 'Custom or unlisted destination system.', criblOutputType: 'webhook', isCribl: false },
];

export const getDestinationType = (type: string): DestinationTypeDef =>
  DESTINATION_TYPES.find((d) => d.value === type) ?? DESTINATION_TYPES[DESTINATION_TYPES.length - 1];

export const destinationLabel = (type: string) => getDestinationType(type).label;

export const MODE_OPTIONS: { value: Mode; label: string; description: string; bullets: string[] }[] = [
  {
    value: 'poc',
    label: 'POC (Proof of Concept)',
    description: 'Simplified architecture for testing and evaluation. Allows single-instance deployments and relaxed HA requirements.',
    bullets: ['Single instance allowed', 'Simplified configuration', 'Quick setup for demos', 'Not production-ready'],
  },
  {
    value: 'production',
    label: 'Production',
    description: 'Enterprise-grade architecture with high availability, redundancy, and scalability built-in from the start.',
    bullets: ['Distributed deployment required', 'Minimum 3 Worker Nodes per Worker Group', 'Sized to survive 20% of nodes down', 'Production-ready architecture'],
  },
];

export const DEPLOYMENT_MODEL_OPTIONS: { value: DeploymentModel; label: string; description: string }[] = [
  { value: 'on-prem', label: 'On-Premises', description: 'Self-hosted in your data center. Full control over infrastructure. Requires managing Leader HA.' },
  { value: 'hybrid', label: 'Hybrid (Cloud Leader)', description: 'Cribl.Cloud manages the Leader. Worker Nodes run on your infrastructure (customer-managed Worker Groups).' },
  { value: 'cloud', label: 'Fully Cloud', description: 'Cribl.Cloud manages the Leader and the Worker Groups. Fastest deployment, minimal infrastructure management.' },
];

export const COMPLEXITY_OPTIONS: { value: Complexity; label: string; description: string; factor: number }[] = [
  { value: 'light', label: 'Light Processing', description: 'Basic filtering and routing. Minimal transformations. Lower CPU requirements.', factor: 1.0 },
  { value: 'medium', label: 'Medium Processing', description: 'Moderate parsing, enrichment, and transformations. Standard use case.', factor: 1.25 },
  { value: 'heavy', label: 'Heavy Processing', description: 'Complex parsing, lookups, aggregations, and heavy transformations. Higher CPU needs.', factor: 1.5 },
  { value: 'unknown', label: 'Unknown / To Be Decided', description: 'Processing complexity should be validated during detailed design phase.', factor: 1.25 },
];

export const complexityFactor = (c: Complexity) => COMPLEXITY_OPTIONS.find((o) => o.value === c)?.factor ?? 1;

export const WORKER_GROUP_STRATEGY_OPTIONS = [
  {
    value: 'single' as const,
    label: 'Single Worker Group',
    description: 'All sources processed by one group. Simpler setup, suitable for smaller deployments or when all sources have similar processing requirements.',
  },
  {
    value: 'multiple' as const,
    label: 'Multiple Worker Groups (by Source Category)',
    description:
      'Separate groups for Endpoint, Network, and Cloud sources. Provides workload isolation, prevents noisy neighbor issues, and allows independent scaling per category. Recommended for production with diverse source types.',
  },
];

/** Cribl sizing guidance: docs.cribl.io/stream/scaling */
export const SIZING_RULES = {
  x86: { gbPerDayPerVcpu: 200, reservedVcpus: 2, label: 'x86 (Intel/AMD, hyperthreaded)' },
  arm: { gbPerDayPerVcpu: 480, reservedVcpus: 1, label: 'ARM64 (AWS Graviton)' },
  heapGBPerWorkerProcess: 2,
  osRamGB: 4,
  minFreeDiskGB: 5,
  haSurvivableNodeLossPct: 0.2,
  minProductionNodesPerGroup: 3,
  cloudGroupMaxTBPerDay: 15,
  pqQueueFileMB: 10,
  source: 'https://docs.cribl.io/stream/scaling/',
};

const VCPUS: Record<CpuArch, Record<NodeSize, number>> = {
  x86: { small: 8, medium: 16, large: 32, xlarge: 48 },
  arm: { small: 4, medium: 8, large: 16, xlarge: 32 },
};

const SIZE_TEXT: Record<NodeSize, Pick<NodeProfile, 'description' | 'useCases' | 'pros' | 'cons' | 'recommended'> & { name: string }> = {
  small: {
    name: 'Small',
    description: 'More nodes with fewer cores. Better for granular scaling and fault isolation. This is Cribl\'s minimum recommended node size.',
    useCases: ['Small to medium deployments', 'Need fine-grained scaling', 'Lower per-node resource requirements'],
    pros: ['Easier to scale incrementally', 'Better fault isolation', 'Lower memory per node'],
    cons: ['More nodes to manage', 'Reserved OS cores are a larger share of capacity', 'More connections to balance'],
    recommended: false,
  },
  medium: {
    name: 'Medium',
    description: 'Balanced approach. Good for most production deployments.',
    useCases: ['General production use', 'Balanced performance and manageability', '1–5 TB/day per Worker Group'],
    pros: ['Good balance of performance and manageability', 'Recommended starting point for most cases', 'Efficient resource utilization'],
    cons: ['Less granular scaling than small nodes', 'Higher per-node resource needs than small'],
    recommended: true,
  },
  large: {
    name: 'Large',
    description: 'Fewer nodes with more cores. Better for high-throughput scenarios.',
    useCases: ['High-throughput deployments', 'Minimize node count', '5–20 TB/day per Worker Group (Cribl suggests 4–8 nodes per group)'],
    pros: ['Fewer nodes to manage', 'Higher throughput per node', 'Lower routing complexity'],
    cons: ['Larger blast radius on failure', 'Higher resource requirements', 'Less flexible scaling'],
    recommended: false,
  },
  xlarge: {
    name: 'X-Large',
    description: 'Very large nodes for extreme throughput. Cribl recommends no more than 48 vCPUs per node. Use with caution.',
    useCases: ['Extreme high-throughput', 'Massive data volumes', '20+ TB/day'],
    pros: ['Maximum throughput per node', 'Minimal node count', 'Simplified architecture'],
    cons: ['Very large blast radius', 'Expensive per node', 'Limited scaling flexibility', 'Heavier disk I/O when PQ engages'],
    recommended: false,
  },
};

const niceRam = (gb: number) => [8, 16, 32, 48, 64, 96, 128].find((v) => v >= gb) ?? Math.ceil(gb / 32) * 32;

export const nodeProfile = (size: NodeSize, arch: CpuArch): NodeProfile => {
  const rule = SIZING_RULES[arch];
  const vcpus = VCPUS[arch][size];
  const workerProcesses = Math.max(1, vcpus - rule.reservedVcpus);
  const text = SIZE_TEXT[size];
  return {
    size,
    arch,
    label: `${text.name} — ${vcpus} vCPU ${arch === 'arm' ? 'ARM' : 'x86'}`,
    vcpus,
    reservedVcpus: rule.reservedVcpus,
    workerProcesses,
    gbPerDayPerVcpu: rule.gbPerDayPerVcpu,
    capacityGBPerDay: workerProcesses * rule.gbPerDayPerVcpu,
    ramGB: niceRam(workerProcesses * SIZING_RULES.heapGBPerWorkerProcess + SIZING_RULES.osRamGB),
    baseDiskGB: 50,
    description: text.description,
    useCases: text.useCases,
    pros: text.pros,
    cons: text.cons,
    recommended: text.recommended,
  };
};

export const NODE_SIZES: NodeSize[] = ['small', 'medium', 'large', 'xlarge'];

export const PORTS = {
  UI_API: 9000,
  WORKER_TO_LEADER: 4200,
  CRIBL_TCP: 10300,
  CRIBL_HTTP: 10200,
  SYSLOG: 9514,
  SYSLOG_LEGACY: 514,
  HEALTH_PATH: '/api/v1/health',
};

export const COMPONENT_DESCRIPTIONS = {
  EDGE: 'Cribl Edge: lightweight agent on endpoints for local collection and preprocessing, managed in Fleets',
  WORKER_GROUP: 'Worker Group: a set of Worker Nodes sharing one configuration (Sources, Pipelines, Routes, Destinations)',
  WORKER_NODE: 'Worker Node: a host running Cribl Stream; each spawns Worker Processes (one per usable vCPU)',
  LEADER: 'Leader: control plane that manages configuration and orchestrates all Worker Groups and Fleets',
  CRIBL_LAKE: 'Cribl Lake: Cribl-managed storage for log retention and analysis (Cribl.Cloud only)',
  LOAD_BALANCER: 'Load balancer: spreads push traffic (Edge, syslog) across healthy Worker Nodes',
  SYSLOG: 'Syslog Source on the Worker Group, receiving from network appliances',
  CLOUD_COLLECTOR: 'Collectors on the Worker Group that pull from cloud APIs and queues',
};

export const GUARD_DESCRIPTION =
  'Cribl Guard (Enterprise): automatically scans data streams for sensitive information such as PII and secrets using Cribl AI detection, and masks it before it reaches Destinations.';
