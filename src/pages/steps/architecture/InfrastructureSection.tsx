import type { ReactNode } from 'react';
import { Text } from '@capra/core';
import { BranchesOutlined, CriblOutlined, FleetOutlined } from '@capra/icons';
import { COMPONENT_DESCRIPTIONS, PORTS } from '../../../model/catalog';
import type { ArchitectureResult, Design } from '../../../model/types';
import { Callout, Section, fmtNum } from '../../../ui/layout';
import { SourceLogo } from '../../../ui/logos';

function Panel({ icon, title, status, children }: { icon: ReactNode; title: string; status: ReactNode; children: ReactNode }) {
  return (
    <div className="arch-panel">
      <div className="arch-panel__head">
        <span className="arch-panel__icon">{icon}</span>
        <Text as="h3" variant="heading-xs">
          {title}
        </Text>
        <span className="arch-panel__status">{status}</span>
      </div>
      <div className="arch-panel__body">{children}</div>
    </div>
  );
}

function EdgePanel({ result }: { result: ArchitectureResult }) {
  const arch = result.architecture;
  const letterOf = new Map<string, string>();
  for (const g of arch.workerGroups) for (const s of g.sources) letterOf.set(s.id, g.letter);
  if (!arch.useEdge) {
    return (
      <Panel icon={<FleetOutlined size="sm" />} title="Edge Nodes" status={<span className="chip">Not needed</span>}>
        <Text as="p" variant="body-sm-normal" color="secondary">
          No endpoint sources in this design. Network appliances forward syslog and cloud sources are pulled by the Worker Group, so no Cribl Edge agents are deployed.
        </Text>
      </Panel>
    );
  }
  return (
    <Panel icon={<FleetOutlined size="sm" />} title="Edge Nodes" status={<span className="chip chip--info">{fmtNum(result.metrics.totalEdgeNodes)} nodes</span>}>
      <Text as="p" variant="body-sm-normal" color="secondary">
        Cribl Edge is deployed 1:1 on endpoint hosts for local collection and pre-processing, organised into one Fleet per platform. Fleets receive configuration from the Leader over port{' '}
        {PORTS.WORKER_TO_LEADER} and send to Cribl Stream over the Cribl TCP Destination/Source pair on port {PORTS.CRIBL_TCP}.
      </Text>
      <table className="data-table arch-compact-table">
        <thead>
          <tr>
            <th>Fleet</th>
            <th className="arch-num">Edge Nodes</th>
            <th>To</th>
          </tr>
        </thead>
        <tbody>
          {arch.edgeFleets.map((f) => (
            <tr key={f.sourceId}>
              <td>
                <span className="row arch-src-cell">
                  <SourceLogo type={f.type} size="xs" />
                  {f.name}
                </span>
              </td>
              <td className="arch-num">{fmtNum(f.nodes)}</td>
              <td>
                Group {letterOf.get(f.sourceId)} · <span className="mono">TCP {PORTS.CRIBL_TCP}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function LoadBalancerPanel({ result }: { result: ArchitectureResult }) {
  const arch = result.architecture;
  const lbGroups = arch.workerGroups.filter((g) => g.usesLoadBalancer);
  const managed = arch.workerGroups.every((g) => g.managedBy === 'cribl');
  const pullOnly = arch.workerGroups.filter((g) => g.managedBy === 'customer' && !g.usesLoadBalancer);

  if (!arch.useLB) {
    const reason = managed
      ? 'Cribl.Cloud provides ingress load balancing for Cribl-managed Worker Groups: push sources send to the Workspace ingress address.'
      : arch.workerGroups.some((g) => g.nodes <= 1)
        ? 'A single Worker Node receives push traffic directly. Add a Layer-4 load balancer as soon as the group grows beyond one node.'
        : 'All sources are pulled by the Worker Groups (cloud APIs and queues). Pull traffic does not go through a load balancer.';
    return (
      <Panel icon={<BranchesOutlined size="sm" />} title="Load Balancer" status={<span className="chip">Not required</span>}>
        <Text as="p" variant="body-sm-normal" color="secondary">
          {reason}
        </Text>
      </Panel>
    );
  }

  return (
    <Panel icon={<BranchesOutlined size="sm" />} title="Load Balancer" status={<span className="chip chip--brand">{lbGroups.length === 1 ? '1 load balancer' : `${lbGroups.length} load balancers`}</span>}>
      <Text as="p" variant="body-sm-normal" color="secondary">
        {COMPONENT_DESCRIPTIONS.LOAD_BALANCER}. A Layer-4 (TCP/UDP) load balancer in front of each push-ingest Worker Group distributes connections and routes around failed nodes. Each connection is handled by one Worker Process,
        so many connections balance better than a few large ones.
      </Text>
      <div className="arch-kv">
        <span className="muted">Health check</span>
        <span className="mono">
          HTTP GET {PORTS.HEALTH_PATH} on port {PORTS.UI_API}
        </span>
      </div>
      <table className="data-table arch-compact-table">
        <thead>
          <tr>
            <th>Worker Group</th>
            <th>Listener ports</th>
            <th className="arch-num">Targets</th>
          </tr>
        </thead>
        <tbody>
          {lbGroups.map((g) => (
            <tr key={g.id}>
              <td>
                {g.letter}: {g.name}
              </td>
              <td>
                <span className="row">
                  {g.ingressPorts
                    .filter((p) => p.direction === 'Inbound')
                    .map((p) => (
                      <span key={String(p.port)} className="chip chip--brand" title={p.purpose}>
                        {p.port} {p.protocol}
                      </span>
                    ))}
                </span>
              </td>
              <td className="arch-num">{g.nodes} nodes</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pullOnly.length > 0 && (
        <Text as="p" variant="body-xs-normal" color="secondary">
          No load balancer for {pullOnly.map((g) => `Group ${g.letter}`).join(', ')}: {pullOnly.length === 1 ? 'it pulls' : 'they pull'} from cloud APIs over outbound HTTPS 443.
        </Text>
      )}
    </Panel>
  );
}

function LeaderPanel({ result }: { result: ArchitectureResult }) {
  const arch = result.architecture;
  const variant = arch.useManagedLeader ? 'managed' : arch.leaderHA ? 'ha' : 'single';
  const title = variant === 'managed' ? 'Cribl.Cloud Leader (managed)' : variant === 'ha' ? 'Leader (Primary) + Leader (Standby)' : 'Single Leader';
  const text =
    variant === 'managed'
      ? 'Using the Cribl.Cloud managed Leader: no Leader infrastructure to run. Cribl manages the control plane (configuration, orchestration, upgrades) and its High Availability for all Worker Groups and Edge Fleets.'
      : variant === 'ha'
        ? 'High-availability Leader with an active Primary and a Standby sharing an NFS failover volume, so the management plane is not a single point of failure. Worker Nodes and Edge Nodes keep processing with their last known configuration even while the Leader is unavailable.'
        : 'A single Leader manages configuration and orchestrates all Worker Groups (POC). Not recommended for production: add a Standby Leader with shared NFS storage.';
  return (
    <Panel
      icon={<CriblOutlined size="sm" />}
      title="Leader"
      status={<span className={`chip ${variant === 'single' ? 'chip--warning' : 'chip--highlight'}`}>{variant === 'managed' ? 'Managed' : variant === 'ha' ? 'HA' : 'Single'}</span>}
    >
      <Text as="div" variant="body-sm-semibold">
        {title}
      </Text>
      <Text as="p" variant="body-sm-normal" color="secondary">
        {text}
      </Text>
      <table className="data-table arch-compact-table">
        <thead>
          <tr>
            <th>Port</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="mono">{PORTS.UI_API} TCP</td>
            <td>UI and REST API{variant === 'managed' ? ' (Cribl.Cloud Workspace)' : ''}</td>
          </tr>
          <tr>
            <td className="mono">{PORTS.WORKER_TO_LEADER} TCP</td>
            <td>Worker Nodes and Edge Nodes → Leader (config, heartbeat, metrics)</td>
          </tr>
        </tbody>
      </table>
    </Panel>
  );
}

export function InfrastructureSection({ design, result }: { design: Design; result: ArchitectureResult }) {
  return (
    <Section title="Edge, load balancing & Leader" icon={<CriblOutlined size="sm" />} description="How data enters the Worker Groups and how the control plane manages them.">
      <div className="grid-3 arch-panels">
        <EdgePanel result={result} />
        <LoadBalancerPanel result={result} />
        <LeaderPanel result={result} />
      </div>
      {design.drivers.deploymentModel === 'hybrid' && (
        <Callout tone="info" title="Hybrid connectivity">
          Customer-managed Worker Nodes and Edge Nodes connect outbound to the Cribl.Cloud Leader on port {PORTS.WORKER_TO_LEADER} (TLS). No inbound firewall rules are needed for the control plane.
        </Callout>
      )}
    </Section>
  );
}
