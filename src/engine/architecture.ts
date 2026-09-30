import {
  CATEGORY_LABELS,
  PORTS,
  SIZING_RULES,
  WORKER_GROUP_NAMES,
  categoryOf,
  complexityFactor,
  destinationLabel,
  getDestinationType,
  nodeProfile,
} from '../model/catalog';
import type {
  ArchitectureResult,
  Decision,
  Design,
  Insight,
  NodeProfile,
  PortSpec,
  SourceCategory,
  SourceGroup,
  SourceThroughputRow,
  Warning,
  WorkerGroupResult,
} from '../model/types';

const CATEGORY_ORDER: SourceCategory[] = ['endpoint', 'network', 'cloud'];
const ceilPos = (n: number) => Math.max(1, Math.ceil(n - 1e-9));

export const sourceCategory = (s: SourceGroup): SourceCategory => categoryOf(s.type, s.locationType);

export function perSourceThroughput(design: Design): SourceThroughputRow[] {
  const { filteringDropPercent, peakFactor, applyComplexityHeadroom } = design.drivers;
  const dropFactor = 1 - filteringDropPercent / 100;
  return design.sources.map((s) => {
    const inGB = s.volumeGBPerDay || 0;
    const destinations = s.destinationIds.length;
    const outGB = inGB * destinations * dropFactor;
    const throughputGB = inGB + outGB;
    const cf = applyComplexityHeadroom ? complexityFactor(s.complexity) : 1;
    const weightedGB = throughputGB * cf;
    return { sourceId: s.id, type: s.type, inGB, destinations, outGB, throughputGB, complexityFactor: cf, weightedGB, peakGB: weightedGB * peakFactor };
  });
}

function pqDiskForSources(design: Design, sources: SourceGroup[]): number {
  const dropFactor = 1 - design.drivers.filteringDropPercent / 100;
  const hours = design.drivers.pqOutageHours;
  let gb = 0;
  for (const s of sources) {
    const hourly = (s.volumeGBPerDay || 0) / 24;
    if (s.pq !== 'off') gb += hourly * hours;
    for (const destId of s.destinationIds) {
      const dest = design.destinations.find((d) => d.id === destId);
      if (dest?.backpressure === 'pq') gb += hourly * dropFactor * hours;
    }
  }
  return gb;
}

const niceDisk = (gb: number) => [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000].find((v) => v >= gb) ?? Math.ceil(gb / 500) * 500;

function ingressPortsFor(categories: Set<SourceCategory>): PortSpec[] {
  const ports: PortSpec[] = [];
  if (categories.has('endpoint')) ports.push({ port: PORTS.CRIBL_TCP, protocol: 'TCP', purpose: 'Cribl TCP from Edge Fleets', direction: 'Inbound' });
  if (categories.has('network')) ports.push({ port: PORTS.SYSLOG, protocol: 'TCP/UDP', purpose: 'Syslog from network appliances', direction: 'Inbound' });
  if (categories.has('cloud')) ports.push({ port: 443, protocol: 'HTTPS', purpose: 'Pull from cloud APIs / queues', direction: 'Outbound' });
  return ports;
}

function sizeGroup(
  design: Design,
  rows: SourceThroughputRow[],
  base: { id: string; letter: string; name: string; category: SourceCategory | 'all'; sources: SourceGroup[] },
  profile: NodeProfile,
): WorkerGroupResult {
  const isProd = design.mode === 'production';
  const managedBy = design.drivers.deploymentModel === 'cloud' ? 'cribl' : 'customer';
  const ids = new Set(base.sources.map((s) => s.id));
  const mine = rows.filter((r) => ids.has(r.sourceId));
  const sum = (k: keyof SourceThroughputRow) => mine.reduce((a, r) => a + (r[k] as number), 0);
  const inboundGB = sum('inGB');
  const outboundGB = sum('outGB');
  const throughputGB = sum('throughputGB');
  const weightedThroughputGB = sum('weightedGB');
  const peakGB = sum('peakGB');

  const nodesForCapacity = ceilPos(peakGB / profile.capacityGBPerDay);
  const haSpareNodes = isProd ? ceilPos(nodesForCapacity * SIZING_RULES.haSurvivableNodeLossPct) : 0;
  const minNodes = isProd ? SIZING_RULES.minProductionNodesPerGroup : 1;
  const nodes = Math.max(minNodes, nodesForCapacity + haSpareNodes);
  const capacityGB = nodes * profile.capacityGBPerDay;
  const survivingNodes = Math.max(1, nodes - haSpareNodes);
  const pqTotal = managedBy === 'customer' ? pqDiskForSources(design, base.sources) : 0;
  const pqDiskPerNodeGB = Math.ceil(pqTotal / survivingNodes);

  const categories = new Set(base.sources.map(sourceCategory));
  const hasPush = categories.has('endpoint') || categories.has('network');
  const destinationIds = [...new Set(base.sources.flatMap((s) => s.destinationIds))];

  return {
    ...base,
    managedBy,
    destinationIds,
    inboundGB,
    outboundGB,
    throughputGB,
    weightedThroughputGB,
    peakGB,
    profile,
    nodesForCapacity,
    haSpareNodes,
    haFloorApplied: nodes > nodesForCapacity + haSpareNodes,
    nodes,
    totalVcpus: nodes * profile.vcpus,
    totalWorkerProcesses: nodes * profile.workerProcesses,
    capacityGB,
    capacityWithSpareDownGB: survivingNodes * profile.capacityGBPerDay,
    peakUtilizationPct: capacityGB > 0 ? (peakGB / capacityGB) * 100 : 0,
    pqDiskPerNodeGB,
    recommendedDiskPerNodeGB: niceDisk(SIZING_RULES.minFreeDiskGB + 20 + pqDiskPerNodeGB),
    usesLoadBalancer: managedBy === 'customer' && hasPush && nodes > 1,
    ingressPorts: ingressPortsFor(categories),
    cloudTierTBPerDay: managedBy === 'cribl' ? ceilPos(peakGB / 3 / 1024) : null,
  };
}

export function calculateArchitecture(design: Design): ArchitectureResult {
  const { mode, sources, destinations, drivers, features, lakeRetentionDays } = design;
  const { deploymentModel, workerGroupStrategy, filteringDropPercent } = drivers;
  const isProd = mode === 'production';
  const isCloud = deploymentModel === 'cloud';
  const profile = nodeProfile(drivers.nodeSize, drivers.cpuArch);
  const rule = SIZING_RULES[drivers.cpuArch];

  const decisions: Decision[] = [];
  const warnings: Warning[] = [];
  const insights: Insight[] = [];

  const perSource = perSourceThroughput(design);
  const sumRows = (k: keyof SourceThroughputRow) => perSource.reduce((a, r) => a + (r[k] as number), 0);
  const totalInboundGB = sumRows('inGB');
  const routedInboundGB = perSource.filter((r) => r.destinations > 0).reduce((a, r) => a + r.inGB, 0);
  const totalOutboundBeforeDropGB = perSource.reduce((a, r) => a + r.inGB * r.destinations, 0);
  const dropFactor = 1 - filteringDropPercent / 100;
  const totalOutboundGB = totalOutboundBeforeDropGB * dropFactor;
  const totalThroughputGB = totalInboundGB + totalOutboundGB;
  const weightedThroughputGB = sumRows('weightedGB');
  const peakThroughputGB = sumRows('peakGB');
  const effectiveFanout = routedInboundGB > 0 ? totalOutboundBeforeDropGB / routedInboundGB : 1;

  const categorizedSources: Record<SourceCategory, SourceGroup[]> = { endpoint: [], network: [], cloud: [] };
  for (const s of sources) categorizedSources[sourceCategory(s)].push(s);
  const useEdge = categorizedSources.endpoint.length > 0;

  // ── Worker Groups ───────────────────────────────────────────────
  const workerGroups: WorkerGroupResult[] = [];
  if (workerGroupStrategy === 'multiple') {
    CATEGORY_ORDER.filter((c) => categorizedSources[c].length > 0).forEach((c, idx) => {
      workerGroups.push(
        sizeGroup(design, perSource, { id: `wg-${c}`, letter: String.fromCharCode(65 + idx), name: WORKER_GROUP_NAMES[c], category: c, sources: categorizedSources[c] }, profile),
      );
    });
  }
  if (workerGroups.length === 0) {
    workerGroups.push(sizeGroup(design, perSource, { id: 'wg-all', letter: 'A', name: WORKER_GROUP_NAMES.all, category: 'all', sources }, profile));
  }

  const totalNodes = workerGroups.reduce((a, g) => a + g.nodes, 0);
  const nodesForCapacity = workerGroups.reduce((a, g) => a + g.nodesForCapacity, 0);
  const totalVcpus = workerGroups.reduce((a, g) => a + g.totalVcpus, 0);
  const totalWorkerProcesses = workerGroups.reduce((a, g) => a + g.totalWorkerProcesses, 0);
  const vcpusRequired = Math.ceil(peakThroughputGB / rule.gbPerDayPerVcpu - 1e-9);
  const useDistributed = isProd || totalNodes > 1;
  const useLB = workerGroups.some((g) => g.usesLoadBalancer);

  decisions.push(
    isProd
      ? { decision: 'Deployment Architecture', outcome: 'Distributed deployment with high availability', reason: 'Production mode requires distributed architecture to ensure reliability and scalability.', type: 'recommended' }
      : { decision: 'Deployment Architecture', outcome: useDistributed ? 'Distributed deployment' : 'Single instance', reason: 'POC mode allows simplified architecture for testing and evaluation.', type: 'optional' },
  );

  decisions.push({
    decision: 'Worker Node Sizing',
    outcome: `${profile.label}: ${profile.workerProcesses} Worker Processes × ${profile.gbPerDayPerVcpu} GB/day = ${profile.capacityGBPerDay.toLocaleString()} GB/day per node`,
    reason: `Cribl sizing guidance: plan ${rule.gbPerDayPerVcpu} GB/day (in + out) per ${drivers.cpuArch === 'arm' ? 'ARM vCPU' : 'hyperthreaded x86 vCPU'}, and reserve ${rule.reservedVcpus} vCPU${rule.reservedVcpus > 1 ? 's' : ''} per node for the OS and API (Worker Process count ${drivers.cpuArch === 'arm' ? '-1' : '-2'}). Each Worker Process uses ~${SIZING_RULES.heapGBPerWorkerProcess} GB heap, so ${profile.ramGB} GB RAM per node.`,
    type: 'recommended',
  });

  for (const g of workerGroups) {
    const isolation = workerGroupStrategy === 'multiple' ? ` Dedicated group isolates ${g.sources.map((s) => s.type).join(', ')} for independent scaling and no noisy neighbours.` : '';
    if (g.managedBy === 'cribl') {
      decisions.push({
        decision: `Worker Group ${g.letter}: ${g.name}`,
        outcome: `Cribl-managed Worker Group, ~${g.cloudTierTBPerDay} TB/day ingest tier`,
        reason: `Peak ${Math.round(g.peakGB).toLocaleString()} GB/day in+out ≈ ${Math.round(g.peakGB / 3).toLocaleString()} GB/day ingest at Cribl.Cloud's 1:2 ingest:egress sizing assumption. Cribl.Cloud provisions, scales, and keeps Cribl-managed Worker Groups highly available.${isolation}`,
        type: 'recommended',
      });
    } else {
      const ha = isProd
        ? ` + ${g.haSpareNodes} spare (survive ${SIZING_RULES.haSurvivableNodeLossPct * 100}% of nodes down for patching/upgrades)${g.haFloorApplied ? `, raised to the production minimum of ${SIZING_RULES.minProductionNodesPerGroup} Worker Nodes per group` : ''}`
        : ' (POC: no redundancy)';
      decisions.push({
        decision: `Worker Group ${g.letter}: ${g.name}`,
        outcome: `${g.nodes} Worker Nodes × ${profile.vcpus} vCPU = ${g.totalWorkerProcesses} Worker Processes`,
        reason: `Peak ${Math.round(g.peakGB).toLocaleString()} GB/day ÷ ${profile.capacityGBPerDay.toLocaleString()} GB/day per node = ${g.nodesForCapacity} node${g.nodesForCapacity > 1 ? 's' : ''} for capacity${ha}.${isolation}`,
        type: isProd ? 'best_practice' : 'optional',
      });
    }
  }

  if (workerGroupStrategy === 'multiple' && workerGroups.length > 1) {
    decisions.push({
      decision: 'Worker Group Strategy',
      outcome: `${workerGroups.length} Worker Groups, sized independently`,
      reason: 'Multiple Worker Groups created by source category (Endpoint, Network, Cloud). Each group is sized from its own traffic and held to its own HA minimum, so a spike or failure in one workload never starves another.',
      type: 'best_practice',
    });
  }

  if (useEdge) {
    const totalEdgeNodes = categorizedSources.endpoint.reduce((a, s) => a + (s.count || 0), 0);
    decisions.push({
      decision: 'Cribl Edge Deployment',
      outcome: `${categorizedSources.endpoint.length} Edge Fleet(s) managing ${totalEdgeNodes.toLocaleString()} Edge Nodes`,
      reason: 'Edge is deployed ONLY on endpoint systems (Windows, Linux, Kubernetes) for local collection and processing, organised into Fleets per platform. Network appliances forward syslog directly to Stream.',
      type: 'recommended',
    });
    for (const s of categorizedSources.endpoint) {
      decisions.push({
        decision: `Edge Routing: ${s.type}`,
        outcome: `${s.type} → Edge Fleet → Cribl TCP ${PORTS.CRIBL_TCP} → Worker Group → Destinations`,
        reason: `${s.type} endpoints use Edge for local collection, reducing network load and pre-processing before forwarding to Stream over the Cribl TCP Destination/Source pair.`,
        type: 'best_practice',
      });
    }
  }

  if (categorizedSources.network.length > 0) {
    decisions.push({
      decision: 'Network Appliance Routing',
      outcome: `Syslog Source on the Worker Group (TCP/UDP ${PORTS.SYSLOG})`,
      reason: `Network appliances forward syslog directly to a Cribl Stream Syslog Source. Cribl's default Syslog port is ${PORTS.SYSLOG}; use ${PORTS.SYSLOG_LEGACY} only for devices that cannot change port. Edge is NOT deployed on network devices.`,
      type: 'recommended',
    });
    for (const s of categorizedSources.network) {
      decisions.push({
        decision: `Syslog Routing: ${s.type}`,
        outcome: `${s.type} → Syslog ${PORTS.SYSLOG} → ${useLB ? 'Load Balancer → ' : ''}Worker Group → Destinations`,
        reason: `${s.type} devices forward syslog to the Worker Group for processing. Prefer TCP (optionally TLS) for reliable delivery.`,
        type: 'best_practice',
      });
    }
  }

  if (categorizedSources.cloud.length > 0) {
    decisions.push({
      decision: 'Cloud Source Routing',
      outcome: 'Pulled directly by the Worker Group (no load balancer)',
      reason: 'Cloud sources (AWS/Azure/GCP/SaaS) are collected with native pull integrations such as S3+SQS, Event Hubs, Pub/Sub, or REST Collectors. Pull traffic does not go through a load balancer.',
      type: 'recommended',
    });
    for (const s of categorizedSources.cloud) {
      decisions.push({
        decision: `Cloud Routing: ${s.type}`,
        outcome: `${s.type} ← Worker Group collector → Destinations`,
        reason: 'Cloud sources use native cloud integrations for direct ingestion into Stream.',
        type: 'best_practice',
      });
    }
  }

  if (useLB) {
    const perGroup = workerGroups.filter((g) => g.usesLoadBalancer).length > 1;
    decisions.push({
      decision: 'Load Balancer Configuration',
      outcome: perGroup ? 'Load balancer per push-ingest Worker Group' : 'Load balancer in front of the push-ingest Worker Nodes',
      reason: `Layer-4 load balancer(s) spread Edge (${PORTS.CRIBL_TCP}) and syslog (${PORTS.SYSLOG}) connections across healthy Worker Nodes. Health check: HTTP GET ${PORTS.HEALTH_PATH} on port ${PORTS.UI_API}. Many connections matter: each connection is handled by a single Worker Process.`,
      type: 'best_practice',
    });
  }

  let leaderHA = false;
  const useManagedLeader = deploymentModel !== 'on-prem';
  if (useManagedLeader) {
    decisions.push({
      decision: 'Leader Configuration',
      outcome: 'Cribl.Cloud Leader (Managed)',
      reason: `${isCloud ? 'Cloud' : 'Hybrid'} deployment uses the Cribl-managed Leader in your Cribl.Cloud Workspace. Cribl.Cloud handles Leader High Availability automatically.`,
      type: 'recommended',
    });
  } else if (isProd) {
    leaderHA = true;
    decisions.push({
      decision: 'Leader High Availability',
      outcome: 'Primary + standby Leader with a shared NFS failover volume',
      reason: 'On-prem production deployments require customer-managed Leader HA so the management plane is not a single point of failure. Worker Nodes keep processing with their last config even if the Leader is down.',
      type: 'best_practice',
    });
  } else {
    decisions.push({ decision: 'Leader Configuration', outcome: 'Single Leader (POC)', reason: 'POC mode allows a single Leader for testing. Not recommended for production.', type: 'optional' });
  }

  const cloudAvailable = deploymentModel !== 'on-prem';
  if (!cloudAvailable) {
    decisions.push({ decision: 'Cloud Features', outcome: 'Cribl Lake and Cribl Search disabled', reason: 'Cribl Lake and Cribl Search run in Cribl.Cloud; the On-Prem deployment model does not include them.', type: 'required' });
  }

  decisions.push({
    decision: 'Cribl Component Hierarchy',
    outcome: `Leader → ${workerGroups.length} Worker Group(s) → ${totalNodes} Worker Nodes → ${totalWorkerProcesses} Worker Processes${useEdge ? ` · ${categorizedSources.endpoint.length} Edge Fleet(s)` : ''}`,
    reason: 'Cribl architecture: the Leader manages Worker Groups (and Edge Fleets). Each Worker Group is a set of Worker Nodes sharing one configuration; each node runs one Worker Process per usable vCPU.',
    type: 'recommended',
  });

  if (drivers.applyComplexityHeadroom && weightedThroughputGB > totalThroughputGB + 0.5) {
    decisions.push({
      decision: 'Processing Complexity Headroom',
      outcome: `+${Math.round((weightedThroughputGB / totalThroughputGB - 1) * 100)}% capacity applied`,
      reason: 'Per-source headroom applied to sizing: Light ×1.0, Medium ×1.25, Heavy ×1.5, Unknown ×1.25. Validate with real CPU usage during detailed design.',
      type: 'best_practice',
    });
  }

  const pqGroups = workerGroups.filter((g) => g.pqDiskPerNodeGB > 0);
  if (pqGroups.length > 0) {
    decisions.push({
      decision: 'Persistent Queue Disk',
      outcome: pqGroups.map((g) => `Group ${g.letter}: ${g.pqDiskPerNodeGB} GB PQ per node`).join(' · '),
      reason: `Sized to absorb a ${drivers.pqOutageHours}-hour downstream outage: hourly volume per PQ-enabled Source/Destination × outage hours, spread across the nodes still running with HA spares down. Keep ≥ ${SIZING_RULES.minFreeDiskGB} GB free disk (Cribl default minimum).`,
      type: 'best_practice',
    });
  }

  // ── Warnings ────────────────────────────────────────────────────
  const hasMedium = sources.some((s) => s.complexity === 'medium');
  const hasHeavy = sources.some((s) => s.complexity === 'heavy');
  if (!drivers.applyComplexityHeadroom && (hasMedium || hasHeavy)) {
    warnings.push({
      title: 'Processing Complexity Headroom',
      message: hasHeavy ? 'Heavy processing detected - suggest +50-100% capacity headroom' : 'Medium processing detected - suggest +25-50% capacity headroom',
      recommendation: 'Validate actual CPU usage during detailed design and adjust node count accordingly. Base sizing assumes light processing. Enable "Apply complexity headroom" in Architecture Drivers to size for it.',
      severity: 'warning',
    });
  }
  if (sources.some((s) => s.complexity === 'unknown')) {
    warnings.push({ title: 'Unknown Processing Complexity', message: 'One or more sources have unknown processing complexity.', recommendation: 'Processing complexity should be validated during detailed design phase to ensure accurate sizing.', severity: 'warning' });
  }
  const lakeDest = destinations.find((d) => d.type === 'Cribl Lake');
  if (lakeDest && (!lakeRetentionDays || lakeRetentionDays.trim().toLowerCase() === 'unknown')) {
    warnings.push({ title: 'Cribl Lake Retention To Be Defined', message: 'Retention period for Cribl Lake to be determined based on compliance and investigation requirements during detailed design. This impacts storage costs.', severity: 'warning' });
  }
  const noPQ = sources.filter((s) => s.pq === 'off');
  if (isProd && noPQ.length > 0) {
    warnings.push({ title: 'Persistent Queue Configuration', message: `${noPQ.length} source(s) without Persistent Queue. Recommended for production deployments to prevent data loss during backpressure or downstream outages.`, severity: 'info' });
  }
  if (effectiveFanout > 3) {
    warnings.push({ title: 'High Fan-out Detected', message: `Fan-out multiplier of ${effectiveFanout.toFixed(2)}x means data is being sent to multiple destinations. This increases egress costs and processing load.`, severity: 'info' });
  }
  for (const g of workerGroups) {
    if (g.managedBy === 'cribl' && (g.cloudTierTBPerDay ?? 0) > SIZING_RULES.cloudGroupMaxTBPerDay) {
      warnings.push({ title: `Worker Group ${g.letter} exceeds a single Cribl-managed group`, message: `~${g.cloudTierTBPerDay} TB/day is above the ${SIZING_RULES.cloudGroupMaxTBPerDay} TB/day largest Cribl-managed tier.`, recommendation: 'Split the workload across multiple Worker Groups or talk to your Cribl account team.', severity: 'warning' });
    }
    if (g.managedBy === 'customer' && g.nodes > 8 && drivers.nodeSize !== 'xlarge') {
      warnings.push({ title: `Worker Group ${g.letter}: ${g.nodes} nodes`, message: `Cribl suggests 4–8 Worker Nodes per group in the 5–20 TB/day range.`, recommendation: 'Consider a larger node size to reduce node count and management overhead.', severity: 'info' });
    }
  }
  const perProcessGB = drivers.cpuArch === 'arm' ? rule.gbPerDayPerVcpu : rule.gbPerDayPerVcpu * 2;
  for (const s of categorizedSources.network) {
    const perDevice = (s.volumeGBPerDay || 0) / Math.max(1, s.count);
    if (perDevice > perProcessGB) {
      warnings.push({
        title: `High-volume syslog senders: ${s.type}`,
        message: `~${Math.round(perDevice)} GB/day per device exceeds what one Worker Process handles (~${perProcessGB} GB/day). Data on a single connection is processed by a single Worker Process.`,
        recommendation: 'Spread each device across multiple TCP connections, or enable the Syslog Source load balancing option.',
        severity: 'warning',
      });
    }
  }
  if (isCloud && categorizedSources.network.length > 0) {
    warnings.push({
      title: 'Syslog to Cribl.Cloud',
      message: 'On-prem network devices would send syslog over the internet to Cribl-managed Worker Groups (UDP only on 514/9514).',
      recommendation: 'Consider a customer-managed (hybrid) Worker Group near the devices, or use TCP+TLS.',
      severity: 'info',
    });
  }

  // ── Insights ────────────────────────────────────────────────────
  insights.push({ title: 'Cribl Value Proposition', content: 'Cribl enables significant log volume reduction, optimized routing, and cost efficiency. Actual results depend on your specific use cases, logging configuration, and transformations applied.' });
  if (filteringDropPercent > 0) {
    insights.push({ title: 'Data Reduction Impact', content: `With ${filteringDropPercent}% filtering, outbound data drops from ${Math.round(totalOutboundBeforeDropGB).toLocaleString()} to ${Math.round(totalOutboundGB).toLocaleString()} GB/day, saving on egress and storage costs.` });
  }
  if (deploymentModel === 'hybrid' && categorizedSources.cloud.length > 0) {
    insights.push({ title: 'Cloud collection in Cribl.Cloud', content: 'In Hybrid, cloud-native sources can be collected by a Cribl-managed Worker Group so that pull traffic never touches your data center.' });
  }
  insights.push({ title: 'Methodology', content: `Sized with Cribl's published guidance (${SIZING_RULES.source}): ${rule.gbPerDayPerVcpu} GB/day per ${drivers.cpuArch === 'arm' ? 'ARM' : 'x86'} vCPU in+out, ${rule.reservedVcpus} vCPU reserved per node, capacity to survive 20% of nodes down, and at least 3 Worker Nodes per production Worker Group.` });

  const lakeRouted = !!lakeDest && sources.some((s) => s.destinationIds.includes(lakeDest.id));
  const availableFeatures = { stream: true as const, edge: useEdge, lake: cloudAvailable, search: cloudAvailable, guard: true };
  const usedFeatures = {
    stream: true as const,
    edge: useEdge,
    lake: cloudAvailable && lakeRouted,
    search: cloudAvailable && features.search,
    guard: features.guard,
  };

  return {
    metrics: {
      totalInboundGB,
      routedInboundGB,
      totalOutboundBeforeDropGB,
      totalOutboundGB,
      totalThroughputGB,
      weightedThroughputGB,
      peakThroughputGB,
      effectiveFanout,
      dropFactor,
      vcpusRequired,
      nodesForCapacity,
      totalNodes,
      totalVcpus,
      totalWorkerProcesses,
      totalEdgeNodes: categorizedSources.endpoint.reduce((a, s) => a + (s.count || 0), 0),
      perSource,
    },
    architecture: {
      mode,
      deploymentModel,
      useDistributed,
      useEdge,
      useLB,
      leaderHA,
      useManagedLeader,
      profile,
      workerGroups,
      categorizedSources,
      edgeFleets: categorizedSources.endpoint.map((s) => ({ name: `${s.type} Fleet`, sourceId: s.id, type: s.type, nodes: s.count })),
      availableFeatures,
      usedFeatures,
      ports: PORTS,
    },
    decisions,
    warnings,
    insights,
  };
}

export const describeDestination = (id: string, design: Design) => {
  const d = design.destinations.find((x) => x.id === id);
  return d ? d.label || destinationLabel(d.type) : 'Unknown';
};

export { CATEGORY_LABELS, getDestinationType };
