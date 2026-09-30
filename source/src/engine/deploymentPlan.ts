import { PORTS, SIZING_RULES, destinationLabel } from '../model/catalog';
import type { ArchitectureResult, Design, PlanState, PortSpec, StepEffort } from '../model/types';

export type Phase = 'PREP' | 'DEPLOY' | 'CONFIGURE' | 'VALIDATE' | 'GOLIVE';
export const PHASE_ORDER: Phase[] = ['PREP', 'DEPLOY', 'CONFIGURE', 'VALIDATE', 'GOLIVE'];
export const PHASE_LABELS: Record<Phase, string> = { PREP: 'Preparation', DEPLOY: 'Deployment', CONFIGURE: 'Configuration', VALIDATE: 'Validation', GOLIVE: 'Go-Live' };

export interface PlanStep {
  id: string;
  title: string;
  detail: string;
  technical: string;
  owner: string;
}

export interface PlanCategory {
  categoryId: string;
  phase: Phase;
  title: string;
  summary: string;
  estimatedDays: { min: number; max: number };
  dependencies: string[];
  steps: PlanStep[];
  /** Present once any step has effort entered; estimatedDays is then derived from it. */
  effort?: { hours: number; days: number; stepsWithEffort: number; defaultDays: { min: number; max: number } };
}

export interface DeploymentPlan {
  categories: PlanCategory[];
  totalEstimatedDays: { min: number; max: number };
  totalSteps: number;
  projectSummary: {
    mode: string;
    deploymentModel: string;
    totalInboundGB: number;
    totalOutboundGB: number;
    nodesForCapacity: number;
    totalNodes: number;
    workerGroups: number;
    sourceCount: number;
    destinationCount: number;
    totalEdgeNodes: number;
  };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export function generateDeploymentPlan(result: ArchitectureResult, design: Design): DeploymentPlan {
  const { mode, sources, destinations, drivers, lakeRetentionDays } = design;
  const arch = result.architecture;
  const metrics = result.metrics;
  const profile = arch.profile;
  const categories: PlanCategory[] = [];
  const isProduction = mode === 'production';
  const isOnPrem = drivers.deploymentModel === 'on-prem';
  const isHybrid = drivers.deploymentModel === 'hybrid';
  const isCloud = drivers.deploymentModel === 'cloud';
  const customerGroups = arch.workerGroups.filter((g) => g.managedBy === 'customer');
  const criblGroups = arch.workerGroups.filter((g) => g.managedBy === 'cribl');
  const customerNodes = customerGroups.reduce((a, g) => a + g.nodes, 0);
  const lbGroups = arch.workerGroups.filter((g) => g.usesLoadBalancer);
  const hasNetwork = arch.categorizedSources.network.length > 0;
  const processCount = drivers.cpuArch === 'arm' ? '-1' : '-2';
  const destName = (id: string) => {
    const d = destinations.find((x) => x.id === id);
    return d ? d.label || destinationLabel(d.type) : 'Unknown';
  };

  // ─── CATEGORY 1: PREREQUISITES & LICENSING ─────────────────────────
  const prereqSteps: PlanStep[] = [];
  if (isOnPrem) {
    prereqSteps.push({
      id: 'prereq-license',
      title: 'Acquire Cribl Enterprise License',
      detail: `Contact Cribl Sales team to obtain ${isProduction ? 'Enterprise' : 'Sales Trial / Evaluation'} license for on-premises deployment.`,
      technical: `License type: ${isProduction ? 'Enterprise (production)' : 'Evaluation / Sales Trial (POC)'}. License is installed on the Leader node and propagated to all Workers.`,
      owner: 'Project Manager / Procurement',
    });
  } else {
    prereqSteps.push({
      id: 'prereq-cloud-org',
      title: 'Confirm Cribl.Cloud Organization & Workspace',
      detail: `You are already in a Cribl.Cloud Organization (this App runs inside it). Confirm the target Workspace, region, and plan. ${isHybrid ? 'Worker Nodes will run on your infrastructure; the Leader is Cribl-managed.' : 'Leader and Worker Groups will be Cribl-managed.'}`,
      technical: `1. Confirm the Workspace that will host production (each Workspace has its own Leader)\n2. Confirm region closest to your data sources\n3. Confirm plan entitlements (Enterprise for Cribl Guard, SSO, and ${isHybrid ? 'customer-managed Worker Groups' : 'Cribl-managed Worker Group sizing'})\n4. Invite project members and assign Workspace roles`,
      owner: 'Platform Team / Cribl Admin',
    });
  }

  const portsNeeded: PortSpec[] = [];
  if (!isCloud) {
    portsNeeded.push({ port: PORTS.UI_API, protocol: 'TCP', purpose: `Leader UI & API, bootstrap, and LB health check (${PORTS.HEALTH_PATH})`, direction: 'Inbound' });
    portsNeeded.push({ port: PORTS.WORKER_TO_LEADER, protocol: 'TCP', purpose: 'Worker/Edge Node → Leader heartbeat, metrics and config bundles', direction: isHybrid ? 'Outbound to Cribl.Cloud' : 'Inbound/Outbound' });
  }
  if (arch.useEdge) portsNeeded.push({ port: PORTS.CRIBL_TCP, protocol: 'TCP', purpose: 'Edge → Stream data (Cribl TCP)', direction: 'Inbound' });
  if (hasNetwork) portsNeeded.push({ port: PORTS.SYSLOG, protocol: 'TCP/UDP', purpose: `Syslog Source for network appliances (${PORTS.SYSLOG_LEGACY} only if devices cannot change port)`, direction: 'Inbound' });
  if (isCloud) portsNeeded.push({ port: 443, protocol: 'TCP', purpose: 'Edge Nodes and devices → Cribl.Cloud (HTTPS / TLS)', direction: 'Outbound' });
  const portList = portsNeeded.map((p) => `Port ${p.port} (${p.protocol}) - ${p.purpose} [${p.direction}]`).join('\n');

  prereqSteps.push({
    id: 'prereq-network',
    title: 'Configure Network & Firewall Rules',
    detail: `Open ${portsNeeded.length} port rule(s) across firewalls and security groups for Cribl component communication.`,
    technical: `Required ports:\n${portList}\n\nIMPORTANT: Exclude all Cribl data streams from Deep Packet Inspection (DPI) and Intrusion Prevention Systems (IPS) to prevent connection instability and high resource utilization.`,
    owner: 'Network / Security Team',
  });

  if (isOnPrem || isHybrid) {
    prereqSteps.push({
      id: 'prereq-dns',
      title: 'Configure DNS Entries',
      detail: `Create DNS records for ${isOnPrem ? 'Leader, ' : ''}Load Balancer, and Worker Nodes for consistent access.`,
      technical: `Recommended DNS entries:\n${isOnPrem ? '- cribl-leader.<domain> → Leader node IP\n' : ''}${arch.useLB ? '- cribl-lb.<domain> → Load Balancer IP/VIP\n' : ''}- cribl-worker-[n].<domain> → Worker Node IPs\nOptional: Configure TLS certificates for HTTPS access and encrypted data transport.`,
      owner: 'Network / DNS Team',
    });
  }
  if (isOnPrem) {
    prereqSteps.push({
      id: 'prereq-git',
      title: 'Install Git on Leader Node',
      detail: 'Git is required on the Leader node for configuration version control.',
      technical: 'Install git: `yum install git` (RHEL/CentOS) or `apt-get install git` (Debian/Ubuntu). Cribl uses git internally for configuration management and version control.',
      owner: 'Infrastructure Team',
    });
  }
  if (!isCloud) {
    prereqSteps.push({
      id: 'prereq-os',
      title: 'Verify OS & System Requirements',
      detail: 'Ensure all target servers meet Cribl minimum OS and hardware requirements.',
      technical: `Supported OS: RHEL/CentOS 7+, Ubuntu 18.04+, Amazon Linux 2, Windows Server 2016+ (Edge only).\nPer Worker Node (${profile.label}): ${profile.vcpus} vCPU, ${profile.ramGB} GB RAM, ${Math.max(...customerGroups.map((g) => g.recommendedDiskPerNodeGB), profile.baseDiskGB)} GB disk.\nCribl recommends ≥ 8 x86 vCPUs (or ≥ 4 ARM vCPUs) and ≤ 48 vCPUs per node.`,
      owner: 'Infrastructure Team',
    });
  }
  categories.push({
    categoryId: 'prerequisites',
    phase: 'PREP',
    title: 'Prerequisites & Licensing',
    summary: `${isOnPrem ? 'Obtain Cribl Enterprise license' : 'Confirm Cribl.Cloud Workspace'}, configure firewall rules for ${portsNeeded.length} port rule(s)${isOnPrem || isHybrid ? ', set up DNS, and verify OS requirements' : ''}.`,
    estimatedDays: { min: 1, max: 3 },
    dependencies: [],
    steps: prereqSteps,
  });

  // ─── CATEGORY 2: INFRASTRUCTURE PROVISIONING ──────────────────────
  const infraSteps: PlanStep[] = [];
  if (isOnPrem) {
    infraSteps.push({
      id: 'infra-leader-vm',
      title: 'Provision Leader Node VM',
      detail: 'Deploy a VM for the Cribl Stream Leader node with HA-ready specifications.',
      technical: `Specs: 8 vCPU, 16 GB RAM, 100 GB SSD.\nThe Leader node manages all configuration, worker orchestration, and the UI. Deploy on stable, highly available infrastructure.\n${isProduction ? 'For HA: Provision a standby Leader VM with identical specs and a shared NFS failover volume.' : 'POC: Single Leader is sufficient.'}`,
      owner: 'Infrastructure Team',
    });
  }
  if (customerGroups.length > 0) {
    infraSteps.push({
      id: 'infra-worker-vms',
      title: `Provision ${customerNodes} Worker Node VMs`,
      detail: `Deploy ${customerNodes} VMs across ${customerGroups.length} Worker Group(s), each ${profile.vcpus} vCPU, ${profile.ramGB} GB RAM.`,
      technical: `Worker Node Specifications (${profile.label}):\n- vCPU: ${profile.vcpus} (${profile.workerProcesses} Worker Processes, ${profile.reservedVcpus} reserved)\n- RAM: ${profile.ramGB} GB (~${SIZING_RULES.heapGBPerWorkerProcess} GB heap per Worker Process)\n- Capacity: ${profile.capacityGBPerDay.toLocaleString()} GB/day in+out per node\n\nWorker Groups breakdown:\n${customerGroups.map((g) => `  Worker Group ${g.letter} (${g.name}): ${g.nodes} nodes, ${g.recommendedDiskPerNodeGB} GB disk each${g.pqDiskPerNodeGB ? ` (incl. ${g.pqDiskPerNodeGB} GB PQ)` : ''}`).join('\n')}`,
      owner: 'Infrastructure Team',
    });
  }
  if (lbGroups.length > 0) {
    infraSteps.push({
      id: 'infra-lb',
      title: 'Provision Load Balancer',
      detail: 'Deploy a Layer-4 Network Load Balancer to distribute push traffic across Worker Nodes with health checks.',
      technical: `Load Balancer Type: Network Load Balancer (Layer 4)\nRequired for: Edge (Cribl TCP) and syslog traffic distribution\nHealth Check: HTTP GET ${PORTS.HEALTH_PATH} on port ${PORTS.UI_API}\nListeners:\n${arch.useEdge ? `- Port ${PORTS.CRIBL_TCP} → Worker Nodes (Edge data)\n` : ''}${hasNetwork ? `- Port ${PORTS.SYSLOG} TCP/UDP → Worker Nodes (Syslog)\n` : ''}\nSupported LBs: AWS NLB, Azure LB, F5, HAProxy, NGINX Plus`,
      owner: 'Infrastructure / Network Team',
    });
  }
  if (infraSteps.length > 0) {
    categories.push({
      categoryId: 'infrastructure',
      phase: 'PREP',
      title: 'Infrastructure Provisioning',
      summary: `Provision ${isOnPrem ? 'Leader VM, ' : ''}${customerNodes} Worker Node VMs${lbGroups.length ? ', and Load Balancer' : ''} with required specifications.`,
      estimatedDays: { min: 2, max: 5 },
      dependencies: ['prerequisites'],
      steps: infraSteps,
    });
  }
  const hasInfra = infraSteps.length > 0;

  // ─── CATEGORY 3: LEADER / CRIBL CLOUD SETUP ───────────────────────
  const leaderSteps: PlanStep[] = [];
  if (arch.useManagedLeader) {
    leaderSteps.push({
      id: 'leader-cloud-config',
      title: 'Configure Cribl.Cloud Workspace',
      detail: 'Set up access, RBAC and SSO in the Workspace, and prepare for Worker and Edge connections.',
      technical: `1. In Cribl.Cloud → Organization → configure SSO/SAML if required\n2. Set up Workspace roles (Admin, Editor, Read-only) and Teams\n3. ${isHybrid ? 'Note the Leader address and generate the bootstrap token for customer-managed Worker Nodes (Add/Update Worker Node)' : 'Review Cribl-managed Worker Group regions'}\n4. ${arch.useEdge ? 'Note the Edge bootstrap command for each Fleet' : 'Review Workspace settings'}`,
      owner: 'Cribl Admin / Platform Team',
    });
  } else {
    leaderSteps.push(
      {
        id: 'leader-install',
        title: 'Install Cribl Stream on Leader Node',
        detail: 'Download, install, and launch Cribl Stream on the Leader VM.',
        technical: `1. Download Cribl Stream: curl -Lso - $(curl https://cdn.cribl.io/dl/latest) | tar zxv\n2. Navigate to cribl directory: cd cribl\n3. Start Cribl: ./bin/cribl start\n4. Access UI at https://<leader-ip>:${PORTS.UI_API}\n5. Default credentials: admin / admin (change immediately)`,
        owner: 'Platform Team',
      },
      {
        id: 'leader-configure',
        title: 'Configure as Leader Node',
        detail: 'Switch the Cribl instance to Leader mode and configure distributed deployment settings.',
        technical: `1. Navigate to Settings → Global → Distributed Settings\n2. Select "Leader" mode (Worker Nodes connect on ${PORTS.WORKER_TO_LEADER})\n3. Restart Cribl: ./bin/cribl restart\n4. Verify Leader is running: ./bin/cribl status`,
        owner: 'Platform Team',
      },
      {
        id: 'leader-license',
        title: 'Install License',
        detail: 'Apply the Cribl Enterprise license to the Leader node.',
        technical: '1. Navigate to Settings → Licensing\n2. Enter license key provided by Cribl Sales\n3. Verify license is active and shows correct entitlements\n4. License propagates automatically to all connected Workers',
        owner: 'Cribl Admin',
      },
      {
        id: 'leader-boot',
        title: 'Enable Start at Boot',
        detail: 'Configure Cribl Stream to automatically start on system boot.',
        technical: 'For systemd (RHEL/CentOS 7+, Ubuntu 16+):\n  ./bin/cribl boot-start enable\n  systemctl enable cribl\n  systemctl start cribl\n\nVerify: systemctl status cribl',
        owner: 'Platform Team',
      },
    );
    if (arch.leaderHA && isProduction) {
      leaderSteps.push({
        id: 'leader-ha',
        title: 'Configure Leader High Availability',
        detail: 'Set up a standby Leader with a shared NFS failover volume for production failover.',
        technical: '1. Provision standby Leader VM with identical specifications\n2. Mount a shared NFS failover volume on both Leaders\n3. Install Cribl on the standby node\n4. Configure Settings → Global → Distributed Settings → Leader Settings → Resiliency: Failover\n5. Put both Leaders behind a VIP/DNS name (optional Active-Active proxy mode on 9000)\n6. Test failover by stopping the primary Leader and verifying the standby takes over',
        owner: 'Platform Team / Infrastructure',
      });
    }
  }
  categories.push({
    categoryId: 'leader',
    phase: 'DEPLOY',
    title: arch.useManagedLeader ? 'Cribl.Cloud Leader Setup' : 'On-Premises Leader Setup',
    summary: arch.useManagedLeader
      ? `Configure the Cribl.Cloud Workspace, RBAC and SSO${isHybrid ? ', and prepare bootstrap for customer-managed Worker Nodes' : ''}.`
      : `Install and configure Cribl Stream Leader on-premises${arch.leaderHA ? ' with failover HA' : ''}.`,
    estimatedDays: arch.useManagedLeader ? { min: 1, max: 1 } : { min: 1, max: 2 },
    dependencies: hasInfra ? ['infrastructure'] : ['prerequisites'],
    steps: leaderSteps,
  });

  // ─── CATEGORY 4: LOAD BALANCER SETUP ──────────────────────────────
  if (lbGroups.length > 0) {
    categories.push({
      categoryId: 'loadbalancer',
      phase: 'DEPLOY',
      title: 'Load Balancer Configuration',
      summary: `Configure Network Load Balancer listeners for push traffic and health checks on ${PORTS.HEALTH_PATH} (port ${PORTS.UI_API}).`,
      estimatedDays: { min: 1, max: 2 },
      dependencies: ['infrastructure'],
      steps: [
        {
          id: 'lb-configure',
          title: 'Configure Load Balancer Listeners & Health Checks',
          detail: `Set up NLB listeners for data traffic and HTTP health checks against each Worker Node's ${PORTS.HEALTH_PATH}.`,
          technical: `Health Check Configuration:\n- Protocol: HTTP(S)\n- Port: ${PORTS.UI_API}, path ${PORTS.HEALTH_PATH}\n- Interval: 10-30 seconds\n- Healthy threshold: 2 consecutive checks\n- Unhealthy threshold: 3 consecutive failures\n\nListener Rules:\n${arch.useEdge ? `- Port ${PORTS.CRIBL_TCP} → Target Group (Endpoint Worker Nodes)\n` : ''}${hasNetwork ? `- Port ${PORTS.SYSLOG} TCP/UDP → Target Group (Syslog Worker Nodes)\n` : ''}\nTarget Groups: ${lbGroups.map((g) => `Group ${g.letter} (${g.nodes} nodes)`).join(', ')}\nStickiness: Disabled (stateless processing)`,
          owner: 'Network / Infrastructure Team',
        },
        {
          id: 'lb-test',
          title: 'Test Load Balancer Connectivity',
          detail: 'Verify LB routes traffic correctly and health checks detect worker status.',
          technical: '1. Verify all Workers appear healthy in LB target group\n2. Send test traffic through LB to Workers\n3. Stop one Worker and verify LB removes it from rotation\n4. Restart Worker and verify LB adds it back\n5. Confirm even connection distribution across Workers',
          owner: 'Network Team',
        },
      ],
    });
  }

  // ─── CATEGORY 5: WORKER GROUPS ────────────────────────────────────
  let workerDep = 'leader';
  if (customerGroups.length > 0) {
    const workerSteps: PlanStep[] = [];
    customerGroups.forEach((wg) => {
      const sourceTypes = wg.sources.map((s) => s.type).join(', ') || 'no sources';
      workerSteps.push({
        id: `workers-group-${wg.id}`,
        title: `Create Worker Group ${wg.letter} (${wg.name}) on Leader`,
        detail: `Create the Worker Group "${wg.name}" and set Worker Processes to ${processCount}.`,
        technical: `On Leader UI:\n1. Navigate to Worker Groups → Add Group: "${slug(wg.name)}"\n2. Group Settings → Worker Processes → Process count: ${processCount}\n3. Add a Mapping Rule: cribl.tags.includes('${slug(wg.name)}')\n4. Commit & Deploy the initial configuration`,
        owner: 'Cribl Admin',
      });
      workerSteps.push({
        id: `workers-install-${wg.id}`,
        title: `Bootstrap ${wg.nodes} Worker Nodes into Group ${wg.letter}`,
        detail: `Install Cribl Stream on ${wg.nodes} VMs and connect them to the ${wg.name} group handling ${sourceTypes}.`,
        technical: `For each of the ${wg.nodes} Worker VMs:\n1. On the Leader: Worker Groups → ${slug(wg.name)} → Add/Update Worker Node → copy the bootstrap script\n2. Run it on the VM (downloads Cribl, sets the Leader address ${arch.useManagedLeader ? '<workspace>.cribl.cloud' : 'cribl-leader.<domain>'}:${PORTS.WORKER_TO_LEADER} and tag '${slug(wg.name)}')\n3. Enable boot: ./bin/cribl boot-start enable\n4. Verify the node shows as connected in the Worker Group`,
        owner: 'Platform Team',
      });
    });
    if (isProduction && metrics.totalThroughputGB > 500) {
      workerSteps.push({
        id: 'workers-os-tuning',
        title: 'Apply OS Tuning for High Throughput',
        detail: 'Apply OS-level tuning on Worker Nodes for optimal performance at high data volumes.',
        technical: `For high-throughput deployments (${Math.round(metrics.totalThroughputGB).toLocaleString()} GB/day):\n1. Increase file descriptor limits: ulimit -n 65535\n2. Tune network buffers:\n   sysctl -w net.core.rmem_max=16777216\n   sysctl -w net.core.wmem_max=16777216\n3. Increase TCP backlog: sysctl -w net.core.somaxconn=65535\n4. Disable THP: echo never > /sys/kernel/mm/transparent_hugepage/enabled\n5. Persist settings in /etc/sysctl.conf and /etc/security/limits.conf`,
        owner: 'Platform Team',
      });
    }
    categories.push({
      categoryId: 'workers',
      phase: 'DEPLOY',
      title: 'Worker Nodes & Worker Groups',
      summary: `Create ${customerGroups.length} Worker Group(s) and bootstrap ${customerNodes} Worker Nodes with Worker Process count ${processCount}.`,
      estimatedDays: { min: 2, max: 5 },
      dependencies: ['leader', ...(lbGroups.length ? ['loadbalancer'] : [])],
      steps: workerSteps,
    });
    workerDep = 'workers';
  }
  if (criblGroups.length > 0) {
    categories.push({
      categoryId: 'cloud-groups',
      phase: 'DEPLOY',
      title: 'Cribl-managed Worker Groups',
      summary: `Provision ${criblGroups.length} Cribl-managed Worker Group(s) in Cribl.Cloud (~30 minutes each).`,
      estimatedDays: { min: 1, max: 1 },
      dependencies: ['leader'],
      steps: criblGroups.map((g) => ({
        id: `cloud-group-${g.id}`,
        title: `Provision Worker Group ${g.letter} (${g.name}) — ~${g.cloudTierTBPerDay} TB/day`,
        detail: `Create a Cribl-managed Worker Group sized for ~${g.cloudTierTBPerDay} TB/day ingest in the region closest to its sources.`,
        technical: `1. Worker Groups → Add Group → Cribl-managed\n2. Choose provider (AWS/Azure) and region\n3. Use the built-in Sizing Calculator: inbound ≈ ${Math.round(g.inboundGB).toLocaleString()} GB/day, outbound ≈ ${Math.round(g.outboundGB).toLocaleString()} GB/day, processing load ${g.weightedThroughputGB > g.throughputGB * 1.3 ? 'High' : g.weightedThroughputGB > g.throughputGB * 1.05 ? 'Medium' : 'Low'}\n4. Wait for provisioning (~30 minutes), then note the ingest endpoint address\n5. Cribl manages HA and Persistent Queue storage (1 GB per Destination per Worker Process)`,
        owner: 'Cribl Admin',
      })),
    });
    workerDep = 'cloud-groups';
  }

  // ─── CATEGORY 6: SOURCE - CRIBL EDGE DEPLOYMENT ───────────────────
  if (arch.useEdge) {
    const endpointSources = arch.categorizedSources.endpoint;
    const totalEdgeNodes = metrics.totalEdgeNodes;
    const edgeTarget = isCloud ? '<group ingest address>' : arch.useLB ? 'cribl-lb.<domain>' : 'cribl-worker.<domain>';
    const edgeSteps: PlanStep[] = [
      {
        id: 'edge-fleet-create',
        title: 'Create Edge Fleet(s) on Leader',
        detail: `Create ${endpointSources.length} Edge Fleet(s) to manage ${totalEdgeNodes.toLocaleString()} Edge Nodes.`,
        technical: `On Leader UI:\n1. Navigate to Edge → Fleets\n2. Create a Fleet per platform:\n${endpointSources.map((s) => `   - Fleet "${slug(s.type)}-fleet": ${s.count} ${s.type} endpoints`).join('\n')}\n3. Use Subfleets (max 2 levels) for site or role differences\n4. In each Fleet: add a Cribl TCP Destination → ${edgeTarget}:${PORTS.CRIBL_TCP}\n5. Generate the bootstrap script for each Fleet`,
        owner: 'Cribl Admin',
      },
    ];
    endpointSources.forEach((source) => {
      let install: string;
      if (source.type === 'Windows') {
        install = `Windows Installation (${source.count} endpoints):\n1. Download the Edge MSI from Leader UI → Edge → Add/Update Edge Node\n2. Deploy via GPO, SCCM, or Intune with the Fleet bootstrap parameters\n3. Enable Windows Event Logs collection in the Fleet\n4. Configure file monitoring for key log paths\n5. Verify Edge check-in on Leader`;
      } else if (source.type === 'Linux') {
        install = `Linux Installation (${source.count} endpoints):\n1. Copy the Fleet bootstrap script from Leader UI → Edge → Add/Update Edge Node\n2. Deploy via Ansible/Puppet/Chef\n3. Configure Journal Files / File Monitor sources in the Fleet\n4. Enable boot: ./bin/cribl boot-start enable\n5. Verify Edge check-in on Leader`;
      } else if (source.type === 'Kubernetes') {
        install = `Kubernetes Installation (${source.count} clusters):\n1. Add Cribl Helm repo: helm repo add cribl https://criblio.github.io/helm-charts/\n2. Install as DaemonSet:\n   helm install cribl-edge cribl/edge \\\n     --set cribl.leader=<leader-url> \\\n     --set cribl.group=${slug(source.type)}-fleet\n3. Enable Kubernetes Logs / Metrics sources\n4. Verify pod-level collection on Leader`;
      } else {
        install = `${source.type} Installation (${source.count} endpoints):\n1. Copy the Fleet bootstrap script from Leader UI\n2. Deploy to endpoints\n3. Configure appropriate log collection sources\n4. Verify Edge check-in on Leader`;
      }
      edgeSteps.push({
        id: `edge-install-${slug(source.type)}`,
        title: `Deploy Edge on ${source.count} ${source.type} Endpoints`,
        detail: `Install Cribl Edge on ${source.count} ${source.type} endpoints, forwarding to Stream over Cribl TCP ${PORTS.CRIBL_TCP}.`,
        technical: install,
        owner: 'Endpoint / Platform Team',
      });
    });
    edgeSteps.push({
      id: 'edge-verify',
      title: 'Verify Edge Fleet Health',
      detail: `Confirm all ${totalEdgeNodes.toLocaleString()} Edge Nodes are connected, collecting data, and forwarding to Stream.`,
      technical: '1. On Leader UI → Edge → Fleets → verify all nodes show "Connected"\n2. Check Edge metrics: data collected, events/sec, errors\n3. Verify data is arriving at the Stream Worker Group (Cribl TCP Source)\n4. Check for any collection gaps or missed endpoints\n5. Monitor Edge resource usage on endpoints',
      owner: 'Cribl Admin',
    });
    categories.push({
      categoryId: 'source-edge',
      phase: 'CONFIGURE',
      title: 'Source: Cribl Edge Deployment',
      summary: `Deploy Cribl Edge on ${totalEdgeNodes.toLocaleString()} endpoints (${endpointSources.map((s) => `${s.count} ${s.type}`).join(', ')}), create Fleet(s), and verify collection.`,
      estimatedDays: { min: 3, max: 7 },
      dependencies: [workerDep],
      steps: edgeSteps,
    });
  }

  // ─── CATEGORY 7: SOURCE - SYSLOG ──────────────────────────────────
  if (hasNetwork) {
    const networkSources = arch.categorizedSources.network;
    const target = isCloud ? '<group ingest address>' : arch.useLB ? 'cribl-lb.<domain>' : 'cribl-worker.<domain>';
    const syslogSteps: PlanStep[] = [
      {
        id: 'syslog-source-config',
        title: 'Configure Syslog Source on Stream',
        detail: `Set up the Syslog Source on the Worker Group to receive data on port ${PORTS.SYSLOG} (TCP/UDP).`,
        technical: `On Leader UI → select the Worker Group:\n1. Navigate to Data → Sources → Syslog\n2. Enable the Syslog Source (default port ${PORTS.SYSLOG}) or create new:\n   - TCP and UDP on ${PORTS.SYSLOG}\n   - TLS: Configure if required\n3. Enable TCP load balancing for high-volume senders\n4. Commit & Deploy`,
        owner: 'Cribl Admin',
      },
    ];
    networkSources.forEach((source) => {
      syslogSteps.push({
        id: `syslog-device-${slug(source.type)}`,
        title: `Configure ${source.type} Syslog Forwarding (${source.volumeGBPerDay} GB/day)`,
        detail: `Configure ${source.type} devices to forward syslog to ${target} on port ${PORTS.SYSLOG}.`,
        technical: `On each ${source.type} device:\n1. Set syslog destination: ${target}:${PORTS.SYSLOG}\n2. Protocol: TCP (recommended for reliability) or UDP\n3. Format: RFC 5424 or RFC 3164 (depending on device)\n4. ${source.type === 'Firewall' ? 'Configure threat/traffic/url log forwarding' : source.type === 'Router' ? 'Configure system/interface log forwarding' : 'Configure appropriate log categories'}\n5. Consider Cribl Packs for ${source.type} parsing (Cribl Packs Dispensary)\n6. Verify logs arrive in Cribl Stream monitoring`,
        owner: 'Network Team',
      });
    });
    categories.push({
      categoryId: 'source-syslog',
      phase: 'CONFIGURE',
      title: 'Source: Syslog Configuration',
      summary: `Configure the Syslog Source (port ${PORTS.SYSLOG}) and point ${networkSources.length} network device type(s) to it.`,
      estimatedDays: { min: 2, max: 4 },
      dependencies: [workerDep],
      steps: syslogSteps,
    });
  }

  // ─── CATEGORY 8: SOURCE - CLOUD COLLECTORS ────────────────────────
  if (arch.categorizedSources.cloud.length > 0) {
    const cloudSources = arch.categorizedSources.cloud;
    categories.push({
      categoryId: 'source-cloud',
      phase: 'CONFIGURE',
      title: 'Source: Cloud Collectors',
      summary: `Configure ${cloudSources.length} cloud source collector(s) (${cloudSources.map((s) => s.type).join(', ')}) with pull integrations.`,
      estimatedDays: { min: 2, max: 5 },
      dependencies: [workerDep],
      steps: cloudSources.map((source) => {
        const isSaaS = source.type.includes('SaaS');
        const technical = isSaaS
          ? 'SaaS API Source Setup:\n1. Generate API credentials in the SaaS application\n2. In Cribl: Configure a REST Collector\n   - API endpoint URL, authentication, polling schedule\n3. Configure pagination and rate limiting\n4. Test connectivity and verify data ingestion'
          : 'Cloud Source Setup (choose per provider):\n- AWS: IAM role for Cribl; Amazon S3 Source with SQS notifications for CloudTrail / VPC Flow Logs; CloudWatch via Kinesis/Firehose\n- Azure: Diagnostic settings → Event Hub; Cribl Azure Event Hubs Source (connection string, consumer group)\n- GCP: Cloud Logging sink → Pub/Sub; Cribl Google Cloud Pub/Sub Source (project, subscription, service account)\n\nThen: test connectivity, verify ingestion, and apply Cribl Packs for parsing.';
        return {
          id: `cloud-source-${slug(source.type)}`,
          title: `Configure ${source.type} Collector (${source.volumeGBPerDay} GB/day)`,
          detail: `Set up pull collection for ${source.type} in Cribl Stream to ingest ${source.volumeGBPerDay} GB/day.`,
          technical,
          owner: 'Cloud / Platform Team',
        };
      }),
    });
  }

  // ─── CATEGORY 9: DESTINATION CONFIGURATION ────────────────────────
  const destSteps: PlanStep[] = destinations.map((dest) => {
    const isPQ = dest.backpressure === 'pq';
    const pqNote = isPQ ? `\n\nBackpressure behavior: Persistent Queue - data is buffered to disk during downstream outages (sized for ${drivers.pqOutageHours}h).` : dest.backpressure === 'drop' ? '\n\nBackpressure behavior: Drop Events.' : '\n\nBackpressure behavior: Block.';
    let technical: string;
    switch (dest.type) {
      case 'Cribl Lake':
        technical = `Cribl Lake Setup:\n1. In Cribl.Cloud → Lake → create Dataset(s) for each log category\n2. Configure retention: ${lakeRetentionDays ? `${lakeRetentionDays} days` : 'TBD - define during implementation'}\n3. Select storage location (Cribl-managed or your own storage)\n4. Configure the Cribl Lake Destination in Stream (Dataset ID)\n5. Optional: query Lake data with Cribl Search`;
        break;
      case 'Splunk':
        technical = 'Splunk Destination Setup:\n1. On Splunk side:\n   - Create HEC token (Settings → Data Inputs → HTTP Event Collector)\n   - Or enable S2S receiving on indexers\n   - Note indexer endpoints and ports\n2. In Cribl Stream:\n   - Create Splunk Load Balanced (S2S) or Splunk HEC Destination\n   - Configure indexer list and load balancing\n3. Test: Send sample events and verify in Splunk Search';
        break;
      case 'Microsoft Sentinel':
        technical = 'Microsoft Sentinel Setup:\n1. Azure prerequisites:\n   - Log Analytics Workspace with Microsoft Sentinel enabled\n   - Data Collection Endpoint (DCE) and Data Collection Rules (DCRs)\n   - Entra ID App Registration for authentication\n2. In Cribl Stream:\n   - Create Microsoft Sentinel Destination\n   - Configure Tenant ID, Client ID, Client Secret, DCE URL, DCR ID\n   - Map tables (e.g., CommonSecurityLog, Syslog)\n3. Test: Send sample events and verify in Sentinel Logs';
        break;
      case 'S3':
        technical = 'Amazon S3 Destination Setup:\n1. AWS prerequisites:\n   - S3 bucket with lifecycle policies and encryption (SSE-S3 or SSE-KMS)\n   - IAM role with s3:PutObject permissions\n2. In Cribl Stream:\n   - Create Amazon S3 Destination (bucket, region, partitioning expression)\n   - Format: JSON or Parquet, compression gzip\n3. Test: Verify objects appear in S3 bucket';
        break;
      case 'Elasticsearch':
        technical = 'Elasticsearch Destination Setup:\n1. Create index/data stream, index template and ILM policy\n2. Create an API key\n3. In Cribl Stream: Create Elasticsearch Destination (bulk API URL, index)\n4. Test: Verify documents in Kibana';
        break;
      case 'Datadog':
        technical = 'Datadog Destination Setup:\n1. Obtain Datadog API key\n2. In Cribl Stream: Create Datadog Destination (API key, site)\n3. Set source and service tags\n4. Test: Verify logs appear in Datadog Log Explorer';
        break;
      case 'New Relic':
        technical = 'New Relic Destination Setup:\n1. Obtain New Relic License / Ingest Key\n2. In Cribl Stream: Create New Relic Logs & Metrics Destination\n3. Test: Verify logs in New Relic Logs UI';
        break;
      case 'Chronicle':
        technical = 'Google SecOps (Chronicle) Setup:\n1. Obtain SecOps ingestion credentials (service account)\n2. In Cribl Stream: Create Google SecOps Destination (customer ID, region, log type)\n3. Map log types to UDM\n4. Test: Verify events in Google SecOps';
        break;
      default:
        technical = `${destinationLabel(dest.type)} Destination Setup:\n1. Obtain connection credentials from the target platform\n2. In Cribl Stream: create the matching Destination (Webhook, Syslog, Kafka…)\n3. Configure endpoint, authentication, format\n4. Test: Verify data arrives at destination`;
    }
    return {
      id: `dest-${dest.id}`,
      title: `Configure ${dest.label || destinationLabel(dest.type)} Destination`,
      detail: `Set up ${dest.label || destinationLabel(dest.type)} as a Destination in Cribl Stream${isPQ ? ' with Persistent Queue enabled' : ''}.`,
      technical: technical + pqNote,
      owner: dest.type === 'Cribl Lake' ? 'Cribl Admin' : `${destinationLabel(dest.type)} Admin / Platform Team`,
    };
  });
  categories.push({
    categoryId: 'destinations',
    phase: 'CONFIGURE',
    title: 'Destination Configuration',
    summary: `Configure ${destinations.length} destination(s): ${destinations.map((d) => d.label || destinationLabel(d.type)).join(', ')}.`,
    estimatedDays: { min: 2, max: 4 },
    dependencies: [workerDep],
    steps: destSteps,
  });

  // ─── CATEGORY 10: PIPELINES & ROUTES ──────────────────────────────
  const pipelineSteps: PlanStep[] = [];
  arch.workerGroups.forEach((wg) => {
    const sourceTypes = wg.sources.map((s) => s.type).join(', ');
    pipelineSteps.push({
      id: `pipeline-routes-${wg.id}`,
      title: `Create Routes for Worker Group ${wg.letter} (${wg.name})`,
      detail: `Set up Routes to direct ${sourceTypes} data to ${wg.destinationIds.map(destName).join(', ') || 'its destinations'}.`,
      technical: `On Leader UI → Worker Group ${wg.letter} (${wg.name}) → Routing → Data Routes:\n${wg.sources
        .map((s) => {
          const dests = s.destinationIds.map(destName).join(', ') || 'none';
          return `   - Route: "${s.type} → ${dests}"\n     Filter: __inputId.startsWith('${slug(s.type)}')\n     Pipeline: ${slug(s.type)}_processing\n     Output: ${dests}${s.destinationIds.length > 1 ? '\n     Final: off (so the event also continues to the next route)' : ''}`;
        })
        .join('\n')}\n3. Order routes most-specific first\n4. Keep a default/fallback route to a low-cost Destination`,
      owner: 'Cribl Admin',
    });
    pipelineSteps.push({
      id: `pipeline-create-${wg.id}`,
      title: `Create Pipelines for Worker Group ${wg.letter}`,
      detail: `Build data processing pipelines for ${sourceTypes} with appropriate functions.`,
      technical: `Create pipelines:\n${wg.sources.map((s) => `- Pipeline: "${slug(s.type)}_processing" (${s.complexity} processing)\n  Functions: Parser, Eval, Lookup, Drop, Mask (as needed)`).join('\n')}\n\nConsider installing Cribl Packs from the Dispensary for pre-built pipelines.`,
      owner: 'Cribl Admin / Data Engineering',
    });
  });
  if (drivers.filteringDropPercent > 0) {
    pipelineSteps.push({
      id: 'pipeline-filtering',
      title: `Configure Data Filtering (${drivers.filteringDropPercent}% Drop)`,
      detail: `Set up filtering rules to reduce outbound data volume by ${drivers.filteringDropPercent}%.`,
      technical: `Target: Reduce outbound data by ${drivers.filteringDropPercent}% (${Math.round(metrics.totalOutboundBeforeDropGB).toLocaleString()} GB → ${Math.round(metrics.totalOutboundGB).toLocaleString()} GB/day)\n\nImplement in pipelines:\n1. Drop function to eliminate low-value events\n2. Suppress function to deduplicate repetitive events\n3. Sampling / Dynamic Sampling for high-volume noisy sources\n4. Eval function to remove unnecessary fields\n5. Monitor actual reduction in Stream monitoring`,
      owner: 'Cribl Admin / Data Engineering',
    });
  }
  const sourcesWithPQ = sources.filter((s) => s.pq !== 'off');
  if (sourcesWithPQ.length > 0 || destinations.some((d) => d.backpressure === 'pq')) {
    pipelineSteps.push({
      id: 'pipeline-pq',
      title: 'Configure Persistent Queues',
      detail: `Enable PQ on ${sourcesWithPQ.length} Source(s) and ${destinations.filter((d) => d.backpressure === 'pq').length} Destination(s).`,
      technical: `Sources:\n${sourcesWithPQ.map((s) => `- ${s.type}: Persistent Queue mode ${s.pq === 'always' ? 'Always On' : 'Smart'}`).join('\n') || '- none'}\n\nDestinations: Backpressure behavior → Persistent Queue\n- Queue size limit per Worker Process sized for a ${drivers.pqOutageHours}-hour outage\n- Queue file size: ${SIZING_RULES.pqQueueFileMB} MB (default), compression gzip\n- Keep ≥ ${SIZING_RULES.minFreeDiskGB} GB free disk; dedicate a disk/partition for PQ\n${arch.workerGroups.filter((g) => g.pqDiskPerNodeGB > 0).map((g) => `- Group ${g.letter}: ~${g.pqDiskPerNodeGB} GB PQ disk per node`).join('\n')}${isCloud ? '\n\nCribl-managed groups: PQ storage is managed by Cribl (1 GB per Destination per Worker Process); Source PQ is Always On only.' : ''}`,
      owner: 'Cribl Admin',
    });
  }
  categories.push({
    categoryId: 'pipelines',
    phase: 'CONFIGURE',
    title: 'Pipelines & Routes',
    summary: `Create Routes and Pipelines for ${arch.workerGroups.length} Worker Group(s) mapping ${sources.length} source(s) to ${destinations.length} destination(s)${drivers.filteringDropPercent > 0 ? ` with ${drivers.filteringDropPercent}% data filtering` : ''}.`,
    estimatedDays: { min: 3, max: 7 },
    dependencies: [
      ...(arch.useEdge ? ['source-edge'] : []),
      ...(hasNetwork ? ['source-syslog'] : []),
      ...(arch.categorizedSources.cloud.length > 0 ? ['source-cloud'] : []),
      'destinations',
    ],
    steps: pipelineSteps,
  });

  // ─── CATEGORY 11: TESTING & VALIDATION ────────────────────────────
  const testSteps: PlanStep[] = [
    {
      id: 'test-connectivity',
      title: 'Validate End-to-End Connectivity',
      detail: 'Verify data flows from every source through Stream to every destination.',
      technical: `For each data path:\n${sources.map((s) => `- ${s.type} → Stream → ${s.destinationIds.map(destName).join(', ') || 'none'}: Send test events, verify arrival`).join('\n')}\n\nUse Cribl Stream's Live Data capture to inspect data at each stage.`,
      owner: 'QA / Platform Team',
    },
    {
      id: 'test-throughput',
      title: 'Performance Baseline Test',
      detail: `Verify the architecture handles the expected ${Math.round(metrics.totalThroughputGB).toLocaleString()} GB/day throughput.`,
      technical: `1. Run load test at expected volume: ${Math.round(metrics.totalInboundGB).toLocaleString()} GB/day inbound\n2. Monitor Worker Process CPU utilization (should be < 70% sustained)\n3. Monitor memory usage per Worker Process\n4. Check for backpressure indicators\n5. Verify peak handling: ${Math.round(metrics.peakThroughputGB).toLocaleString()} GB/day (${drivers.peakFactor}x peak factor)\n6. Compare actual vs expected GB/day per vCPU (${profile.gbPerDayPerVcpu} planned)`,
      owner: 'Performance / Platform Team',
    },
  ];
  if (isProduction && customerGroups.length > 0) {
    testSteps.push({
      id: 'test-failover',
      title: 'HA Failover Test',
      detail: 'Verify each Worker Group keeps up with peak load while its HA spare nodes are down.',
      technical: `1. Record baseline throughput and latency\n2. Per Worker Group, stop the HA spare count of nodes:\n${customerGroups.map((g) => `   - Group ${g.letter}: stop ${g.haSpareNodes} of ${g.nodes} nodes`).join('\n')}\n3. Verify:\n   - LB detects failure via ${PORTS.HEALTH_PATH}\n   - Connections redistribute to remaining nodes\n   - No data loss (check PQ if enabled)\n4. Restart stopped nodes and verify they rejoin\n${arch.leaderHA ? '5. Test Leader failover: stop primary Leader, verify standby takes over' : ''}`,
      owner: 'QA / Platform Team',
    });
  }
  if (sourcesWithPQ.length > 0 || destinations.some((d) => d.backpressure === 'pq')) {
    testSteps.push({
      id: 'test-pq',
      title: 'Persistent Queue Failover Test',
      detail: 'Verify PQ buffers data correctly during downstream outages.',
      technical: '1. Send steady data flow to Stream\n2. Simulate downstream outage (stop destination)\n3. Verify PQ starts buffering (check PQ metrics in monitoring)\n4. Let PQ accumulate for 5-10 minutes\n5. Restore destination\n6. Verify PQ drains completely and all events are delivered\n7. Confirm no data loss by comparing event counts',
      owner: 'QA / Platform Team',
    });
  }
  categories.push({
    categoryId: 'testing',
    phase: 'VALIDATE',
    title: 'Testing & Validation',
    summary: `Validate end-to-end data flow across ${sources.length} source(s) and ${destinations.length} destination(s), performance baseline at ${Math.round(metrics.totalThroughputGB).toLocaleString()} GB/day${isProduction ? ', and HA failover' : ''}.`,
    estimatedDays: { min: 3, max: 5 },
    dependencies: ['pipelines'],
    steps: testSteps,
  });

  // ─── CATEGORY 12: GO-LIVE & MONITORING ────────────────────────────
  categories.push({
    categoryId: 'golive',
    phase: 'GOLIVE',
    title: 'Go-Live & Monitoring',
    summary: `Execute ${isProduction ? 'phased' : 'POC'} cutover, set up monitoring and alerting, and create the operational runbook.`,
    estimatedDays: { min: 2, max: 3 },
    dependencies: ['testing'],
    steps: [
      {
        id: 'golive-cutover',
        title: 'Execute Cutover Plan',
        detail: isProduction ? 'Execute phased cutover, migrating sources one at a time to minimize risk.' : 'Switch all sources to Cribl for POC evaluation.',
        technical: isProduction
          ? 'Phased Cutover Plan:\n1. Phase 1: Migrate lowest-risk source type first\n2. Monitor for 24-48 hours\n3. Phase 2: Migrate next source type\n4. Repeat until all sources are migrated\n5. Keep legacy paths active during transition\n6. Decommission legacy paths after 1 week of stable operation'
          : 'POC Cutover:\n1. Point all selected sources to Cribl\n2. Verify data flow in all destinations\n3. Monitor for 24 hours for any issues',
        owner: 'Project Manager / Cribl Admin',
      },
      {
        id: 'golive-monitoring',
        title: 'Set Up Monitoring & Alerting',
        detail: 'Configure dashboards and alerts for ongoing operational monitoring.',
        technical: 'Cribl Monitoring:\n1. Use Monitoring → System / Data in the Leader UI\n2. Forward Cribl internal logs and metrics (Cribl Internal Source) to your monitoring platform\n\nKey Metrics to Monitor:\n- Worker Process CPU (alert > 80%)\n- Memory usage (alert > 85%)\n- Events in/out per second\n- PQ usage (alert > 50% capacity)\n- Dropped events (alert > 0)\n- Worker Node connectivity\n- Edge Fleet health\n\nAlso configure Cribl Notifications for Destination backpressure.',
        owner: 'Operations / Platform Team',
      },
      {
        id: 'golive-runbook',
        title: 'Create Operational Runbook',
        detail: 'Document operational procedures, troubleshooting guides, and escalation paths.',
        technical: 'Runbook sections:\n1. Architecture overview (reference generated diagram)\n2. Component inventory (Leader, Worker Groups, Worker Nodes, LB, Edge Fleets)\n3. Monitoring and alerting thresholds\n4. Common troubleshooting steps\n5. Scaling procedures (add Worker Nodes, resize)\n6. Upgrade procedures (rolling, 20% of nodes at a time)\n7. Backup and recovery (git remote for Leader config)\n8. Escalation contacts (Cribl Support, internal teams)\n9. Rollback procedure',
        owner: 'Operations / Platform Team',
      },
      {
        id: 'golive-rollback',
        title: 'Document Rollback Procedure',
        detail: 'Prepare rollback steps in case of issues after go-live.',
        technical: 'Rollback Plan:\n1. Revert source configurations to pre-Cribl state\n2. Re-enable legacy log forwarding paths\n3. Verify data flows through legacy paths\n4. Investigate and resolve Cribl issues\n5. Re-attempt cutover after fixes\n\nEnsure legacy paths remain functional during initial go-live period.',
        owner: 'Project Manager / Platform Team',
      },
    ],
  });

  const ids = new Set(categories.map((c) => c.categoryId));
  for (const c of categories) c.dependencies = c.dependencies.filter((d) => ids.has(d));

  const totalEstimatedDays = categories.reduce((acc, c) => ({ min: acc.min + c.estimatedDays.min, max: acc.max + c.estimatedDays.max }), { min: 0, max: 0 });
  return {
    categories,
    totalEstimatedDays,
    totalSteps: categories.reduce((a, c) => a + c.steps.length, 0),
    projectSummary: {
      mode: isProduction ? 'Production' : 'Proof of Concept',
      deploymentModel: isOnPrem ? 'On-Premises' : isHybrid ? 'Hybrid (Cloud Leader)' : 'Fully Cloud',
      totalInboundGB: metrics.totalInboundGB,
      totalOutboundGB: metrics.totalOutboundGB,
      nodesForCapacity: metrics.nodesForCapacity,
      totalNodes: metrics.totalNodes,
      workerGroups: arch.workerGroups.length,
      sourceCount: sources.length,
      destinationCount: destinations.length,
      totalEdgeNodes: metrics.totalEdgeNodes,
    },
  };
}

export const DEFAULT_HOURS_PER_DAY = 8;

export const effortHours = (e?: StepEffort) => (!e || !(e.value > 0) ? 0 : e.unit === 'min' ? e.value / 60 : e.value);

/**
 * Replaces a category's default day estimate with one derived from the effort entered on its steps
 * (steps run one after another; days are whole working days). Categories without entered effort
 * keep their default estimate, so a partly estimated plan still schedules end to end.
 */
export function applyStepEffort(plan: DeploymentPlan, state: Pick<PlanState, 'stepEffort' | 'hoursPerDay'>): DeploymentPlan {
  const efforts = state.stepEffort ?? {};
  const hpd = state.hoursPerDay && state.hoursPerDay > 0 ? state.hoursPerDay : DEFAULT_HOURS_PER_DAY;
  const categories = plan.categories.map((c) => {
    const withEffort = c.steps.filter((s) => effortHours(efforts[s.id]) > 0);
    if (withEffort.length === 0) return c;
    const hours = withEffort.reduce((a, s) => a + effortHours(efforts[s.id]), 0);
    const days = Math.max(1, Math.ceil(hours / hpd - 1e-9));
    return { ...c, estimatedDays: { min: days, max: days }, effort: { hours, days, stepsWithEffort: withEffort.length, defaultDays: c.estimatedDays } };
  });
  const totalEstimatedDays = categories.reduce((acc, c) => ({ min: acc.min + c.estimatedDays.min, max: acc.max + c.estimatedDays.max }), { min: 0, max: 0 });
  return { ...plan, categories, totalEstimatedDays };
}

export interface ScheduledCategory extends PlanCategory {
  startDay: number;
  endDay: number;
  duration: number;
  startDate: Date;
  endDate: Date;
  critical: boolean;
}

/** Dependency-ordered schedule (parallel where dependencies allow) with the critical path flagged. */
export function scheduleTimeline(plan: DeploymentPlan, startDate: string, optimistic: boolean) {
  const base = new Date(`${startDate}T00:00:00`);
  const byId = new Map<string, ScheduledCategory>();
  const pending = [...plan.categories];
  let guard = pending.length * pending.length + 1;
  while (pending.length && guard-- > 0) {
    for (let i = 0; i < pending.length; i++) {
      const c = pending[i];
      if (!c.dependencies.every((d) => byId.has(d))) continue;
      const startDay = Math.max(0, ...c.dependencies.map((d) => byId.get(d)!.endDay));
      const duration = optimistic ? c.estimatedDays.min : c.estimatedDays.max;
      const s = new Date(base);
      s.setDate(s.getDate() + startDay);
      const e = new Date(base);
      e.setDate(e.getDate() + startDay + duration - 1);
      byId.set(c.categoryId, { ...c, startDay, endDay: startDay + duration, duration, startDate: s, endDate: e, critical: false });
      pending.splice(i, 1);
      i--;
    }
  }
  const scheduled = plan.categories.map((c) => byId.get(c.categoryId)).filter((c): c is ScheduledCategory => !!c);
  const totalDays = Math.max(0, ...scheduled.map((s) => s.endDay));
  // Walk back from the last-finishing category along the dependency that finishes latest.
  let cur = scheduled.find((s) => s.endDay === totalDays);
  while (cur) {
    cur.critical = true;
    const start = cur.startDay;
    cur = cur.dependencies.map((d) => byId.get(d)!).find((d) => d.endDay === start);
  }
  const end = new Date(base);
  end.setDate(end.getDate() + Math.max(0, totalDays - 1));
  return { scheduled, totalDays, start: base, end };
}
