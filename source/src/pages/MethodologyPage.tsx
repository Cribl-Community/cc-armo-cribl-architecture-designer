import { Pill, Text } from '@capra/core';
import { CheckOutlined, Cloud, Gauge, HardDrive, NodesOutlined, SecurityScan, Sliders, SwapOutlined, TableOutlined, WorkersOutlined } from '@capra/icons';
import { COMPLEXITY_OPTIONS, NODE_SIZES, PORTS, SIZING_RULES, nodeProfile } from '../model/catalog';
import type { CpuArch } from '../model/types';
import { PageHeader, Section, StatTile, fmtNum } from '../ui/layout';
import { DocLinks } from './methodology/DocLinks';
import { Topology } from './methodology/Topology';
import './methodology/methodology.css';

const ARCHS: CpuArch[] = ['x86', 'arm'];
const X86 = SIZING_RULES.x86;
const ARM = SIZING_RULES.arm;
const HA_PCT = SIZING_RULES.haSurvivableNodeLossPct * 100;
const MIN_NODES = SIZING_RULES.minProductionNodesPerGroup;

/** A live worked example, computed with the same rules the engine uses. */
function workedExample() {
  const inGB = 1000;
  const destinations = 2;
  const filter = 0.3;
  const complexity = COMPLEXITY_OPTIONS.find((o) => o.value === 'medium')!;
  const peakFactor = 1.5;
  const profile = nodeProfile('medium', 'x86');
  const outGB = inGB * destinations * (1 - filter);
  const throughput = inGB + outGB;
  const weighted = throughput * complexity.factor;
  const peak = weighted * peakFactor;
  const forCapacity = Math.ceil(peak / profile.capacityGBPerDay - 1e-9);
  const spares = Math.max(1, Math.ceil(forCapacity * SIZING_RULES.haSurvivableNodeLossPct - 1e-9));
  const nodes = Math.max(MIN_NODES, forCapacity + spares);
  return { inGB, destinations, filter, complexity, peakFactor, profile, outGB, throughput, weighted, peak, forCapacity, spares, nodes };
}

function pqExample() {
  const dailyGB = 1200;
  const hours = 4;
  const surviving = 4;
  const hourly = dailyGB / 24;
  const total = hourly * hours;
  return { dailyGB, hours, surviving, hourly, total, perNode: Math.ceil(total / surviving) };
}

const CORRECTIONS: { topic: string; before: string; after: string }[] = [
  { topic: 'Sizing unit', before: 'Throughput per physical core', after: `Per vCPU, as Cribl specifies: ${X86.gbPerDayPerVcpu} GB/day per hyperthreaded x86 vCPU, ${ARM.gbPerDayPerVcpu} GB/day per ARM (Graviton) vCPU, in + out` },
  { topic: 'Reserved cores', before: 'Every core counted as processing capacity', after: `${X86.reservedVcpus} vCPUs reserved per x86 node, ${ARM.reservedVcpus} per ARM node, for the OS and API (Worker Process count −${X86.reservedVcpus} / −${ARM.reservedVcpus})` },
  { topic: 'High availability', before: 'A fixed N+1 spare node', after: `Size for peak with ${HA_PCT}% of nodes down. Identical to N+1 up to 5 nodes, safer beyond; at least ${MIN_NODES} Worker Nodes per production group` },
  { topic: 'Per-group sizing', before: 'One global node count split across Worker Groups', after: 'Each Worker Group sized from its own traffic and held to its own HA minimum' },
  { topic: 'Processing complexity', before: 'Shown as a warning only', after: 'Applied per Source as a capacity headroom multiplier (can be switched off in Architecture Drivers)' },
  { topic: 'Topology', before: '"Stream Instances"', after: 'Real Cribl topology: Leader → Worker Groups → Worker Nodes → Worker Processes, plus Edge Fleets and Subfleets' },
  { topic: 'Edge → Stream port', before: '10090', after: `Cribl TCP ${PORTS.CRIBL_TCP} (Cribl HTTP ${PORTS.CRIBL_HTTP} as the alternative)` },
  { topic: 'Load balancer health check', before: `Port ${PORTS.WORKER_TO_LEADER}`, after: `HTTP GET ${PORTS.HEALTH_PATH} on port ${PORTS.UI_API}. Port ${PORTS.WORKER_TO_LEADER} is Worker Node → Leader traffic only` },
  { topic: 'Cloud pull traffic', before: 'Drawn through the load balancer', after: 'Pulled directly by the Worker Group. Load balancers only front push traffic (Edge, syslog)' },
  { topic: 'Fully Cloud deployment plans', before: 'Tasks silently dropped', after: 'A complete plan, with Cribl-managed Worker Group tasks in place of infrastructure tasks' },
  { topic: 'Decision badges', before: 'Inconsistent badge types', after: 'Recommended, Best practice, Optional and Required applied consistently' },
];

const PORT_ROWS: { port: string; protocol: string; purpose: string; direction: string }[] = [
  { port: String(PORTS.UI_API), protocol: 'HTTPS', purpose: `Leader UI and REST API; load balancer health check GET ${PORTS.HEALTH_PATH}`, direction: 'Inbound to Leader / Worker Nodes' },
  { port: String(PORTS.WORKER_TO_LEADER), protocol: 'TCP', purpose: 'Worker Node and Edge Node communication with the Leader (config, heartbeat, metrics)', direction: 'Node → Leader' },
  { port: String(PORTS.CRIBL_TCP), protocol: 'TCP (TLS)', purpose: 'Cribl TCP: Edge Fleets and Stream-to-Stream', direction: 'Inbound to Worker Group' },
  { port: String(PORTS.CRIBL_HTTP), protocol: 'HTTPS', purpose: 'Cribl HTTP: alternative to Cribl TCP where only HTTP is allowed', direction: 'Inbound to Worker Group' },
  { port: `${PORTS.SYSLOG} (${PORTS.SYSLOG_LEGACY} legacy)`, protocol: 'TCP / UDP', purpose: `Syslog from network appliances. ${PORTS.SYSLOG_LEGACY} only for devices that cannot change port`, direction: 'Inbound to Worker Group' },
  { port: '443', protocol: 'HTTPS', purpose: 'Cribl.Cloud Leader and managed services; cloud API / queue collection', direction: 'Outbound' },
];

export default function MethodologyPage() {
  const ex = workedExample();
  const pq = pqExample();

  return (
    <div className="page page--narrow methodology">
      <PageHeader
        eyebrow={<span className="chip chip--brand">Grounded in Cribl documentation</span>}
        title="Sizing methodology"
        description="How the Architecture Designer turns volumes into Worker Groups, Worker Nodes, disk and ports. Every rule below is the same code that sizes your designs, and links to the Cribl documentation it comes from."
      />

      <div className="stat-grid">
        <StatTile label="x86 vCPU" value={`${X86.gbPerDayPerVcpu} GB/day`} sub="Hyperthreaded, in + out" tone="accent" />
        <StatTile label="ARM vCPU" value={`${ARM.gbPerDayPerVcpu} GB/day`} sub="AWS Graviton, in + out" tone="accent" />
        <StatTile label="HA target" value={`${HA_PCT}% down`} sub="Survive peak with nodes offline" />
        <StatTile label="Production floor" value={`${MIN_NODES} nodes`} sub="Per Worker Group" />
      </div>

      <Section title="How sizing works" description="Throughput-based sizing per Worker Group, following Cribl's scaling guidance." icon={<Gauge />}>
        <div className="grid-2">
          <ul className="method-list">
            <li>
              <strong>{`${X86.gbPerDayPerVcpu} GB/day per vCPU on x86`}</strong> (Intel/AMD with hyperthreading) and <strong>{`${ARM.gbPerDayPerVcpu} GB/day per vCPU on ARM`}</strong> (AWS Graviton). The budget covers
              data <em>in plus out</em>, so fan-out to several Destinations costs capacity.
            </li>
            <li>
              <strong>Reserve vCPUs for the OS and API:</strong> {`${X86.reservedVcpus} per x86 node, ${ARM.reservedVcpus} per ARM node. In Cribl this is the Worker Process count setting of −${X86.reservedVcpus} / −${ARM.reservedVcpus}.`}
            </li>
            <li>
              <strong>{`~${SIZING_RULES.heapGBPerWorkerProcess} GB heap per Worker Process`}</strong>
              {`, plus ~${SIZING_RULES.osRamGB} GB for the OS, rounded up to a standard instance size.`}
            </li>
            <li>
              <strong>8 to 48 vCPUs per Worker Node.</strong> Cribl recommends staying in this range: smaller nodes waste a larger share on reserved vCPUs, larger nodes widen the blast radius.
            </li>
          </ul>
          <div className="formula" aria-label="Sizing formula">
            <div className="formula__row">
              <span>Out</span>
              <code className="mono">In × Destinations × (1 − filtering %)</code>
            </div>
            <div className="formula__row">
              <span>Throughput</span>
              <code className="mono">In + Out</code>
            </div>
            <div className="formula__row">
              <span>Weighted</span>
              <code className="mono">Throughput × complexity factor</code>
            </div>
            <div className="formula__row">
              <span>Peak</span>
              <code className="mono">Weighted × peak factor</code>
            </div>
            <div className="formula__row">
              <span>Node capacity</span>
              <code className="mono">(vCPU − reserved) × GB/day per vCPU</code>
            </div>
            <div className="formula__row">
              <span>Worker Nodes</span>
              <code className="mono">{`max(${MIN_NODES}, ⌈Peak ÷ capacity⌉ + ⌈${HA_PCT}% spares⌉)`}</code>
            </div>
          </div>
        </div>

        <div className="example">
          <Text as="h3" variant="body-md-semibold">
            Worked example
          </Text>
          <Text as="p" variant="body-sm-normal" color="secondary">
            {`${fmtNum(ex.inGB)} GB/day in, ${ex.destinations} Destinations, ${ex.filter * 100}% filtered, ${ex.complexity.label.toLowerCase()}, peak factor ${ex.peakFactor}, on ${ex.profile.label} nodes:`}
          </Text>
          <ol className="example__steps">
            <li>
              <span>Out</span>
              <code className="mono">{`${fmtNum(ex.inGB)} × ${ex.destinations} × ${1 - ex.filter} = ${fmtNum(ex.outGB)} GB/day`}</code>
            </li>
            <li>
              <span>Throughput</span>
              <code className="mono">{`${fmtNum(ex.inGB)} + ${fmtNum(ex.outGB)} = ${fmtNum(ex.throughput)} GB/day`}</code>
            </li>
            <li>
              <span>Weighted</span>
              <code className="mono">{`${fmtNum(ex.throughput)} × ${ex.complexity.factor} = ${fmtNum(ex.weighted)} GB/day`}</code>
            </li>
            <li>
              <span>Peak</span>
              <code className="mono">{`${fmtNum(ex.weighted)} × ${ex.peakFactor} = ${fmtNum(ex.peak)} GB/day`}</code>
            </li>
            <li>
              <span>Capacity</span>
              <code className="mono">{`(${ex.profile.vcpus} − ${ex.profile.reservedVcpus}) × ${ex.profile.gbPerDayPerVcpu} = ${fmtNum(ex.profile.capacityGBPerDay)} GB/day per node`}</code>
            </li>
            <li>
              <span>Worker Nodes</span>
              <code className="mono">{`⌈${fmtNum(ex.peak)} ÷ ${fmtNum(ex.profile.capacityGBPerDay)}⌉ = ${ex.forCapacity}, + ${ex.spares} spare = ${ex.nodes} nodes`}</code>
            </li>
          </ol>
        </div>

        <div className="stack stack--sm">
          <Text as="h3" variant="body-md-semibold">
            Node profiles
          </Text>
          <Text as="p" variant="body-sm-normal" color="secondary">
            Computed live from the same rules. Medium x86 is the recommended starting point for most production Worker Groups.
          </Text>
          <div className="table-scroll">
            <table className="data-table method-table">
              <thead>
                <tr>
                  <th scope="col">Size</th>
                  <th scope="col">Architecture</th>
                  <th scope="col" className="num">
                    vCPU
                  </th>
                  <th scope="col" className="num">
                    Reserved
                  </th>
                  <th scope="col" className="num">
                    Worker Processes
                  </th>
                  <th scope="col" className="num">
                    GB/day per node
                  </th>
                  <th scope="col" className="num">
                    RAM
                  </th>
                </tr>
              </thead>
              <tbody>
                {ARCHS.flatMap((arch) =>
                  NODE_SIZES.map((size) => {
                    const p = nodeProfile(size, arch);
                    return (
                      <tr key={`${arch}-${size}`} className={p.recommended && arch === 'x86' ? 'is-recommended' : undefined}>
                        <th scope="row" className="row-head">
                          <span className="row">
                            {p.label.split(' — ')[0]}
                            {p.recommended && arch === 'x86' && (
                              <Pill appearance="success" variant="muted" inline>
                                Recommended
                              </Pill>
                            )}
                          </span>
                        </th>
                        <td>{arch === 'x86' ? 'x86 (hyperthreaded)' : 'ARM (Graviton)'}</td>
                        <td className="num mono">{p.vcpus}</td>
                        <td className="num mono">{p.reservedVcpus}</td>
                        <td className="num mono">{p.workerProcesses}</td>
                        <td className="num mono">{fmtNum(p.capacityGBPerDay)}</td>
                        <td className="num mono">{`${p.ramGB} GB`}</td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        </div>
        <DocLinks keys={['scaling']} />
      </Section>

      <Section title="High availability" description="Capacity that survives maintenance and failures." icon={<SecurityScan />}>
        <ul className="method-list">
          <li>
            <strong>{`Size for peak with ${HA_PCT}% of Worker Nodes down.`}</strong> Patching, upgrades and failures take nodes out; the remaining nodes must still carry peak. For groups up to 5 nodes this is
            exactly N+1; larger groups get proportionally more spares.
          </li>
          <li>
            <strong>{`At least ${MIN_NODES} Worker Nodes per production Worker Group,`}</strong> so a single node loss never halves capacity. POC designs may run a single instance.
          </li>
          <li>
            <strong>4 to 8 Worker Nodes per group in the 5 to 20 TB/day range.</strong> Beyond 8 nodes, a larger node size usually reduces management overhead; the designer flags this.
          </li>
          <li>
            <strong>Load balancers front push traffic only</strong>
            {` (Edge on ${PORTS.CRIBL_TCP}, syslog on ${PORTS.SYSLOG}) and health-check HTTP GET ${PORTS.HEALTH_PATH} on port ${PORTS.UI_API}. Each connection is pinned to one Worker Process, so many connections balance better than a few large ones.`}
          </li>
        </ul>
        <DocLinks keys={['scaling', 'architecture']} />
      </Section>

      <Section title="Processing complexity headroom" description="Parsing, lookups and aggregation cost CPU; headroom is applied per Source." icon={<Sliders />}>
        <div className="table-scroll">
          <table className="data-table method-table">
            <thead>
              <tr>
                <th scope="col">Complexity</th>
                <th scope="col">Typical processing</th>
                <th scope="col" className="num">
                  Factor
                </th>
                <th scope="col" className="num">
                  Headroom
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPLEXITY_OPTIONS.map((o) => (
                <tr key={o.value}>
                  <th scope="row" className="row-head">
                    {o.label}
                  </th>
                  <td>{o.description}</td>
                  <td className="num mono">{`× ${o.factor.toFixed(2)}`}</td>
                  <td className="num mono">{o.factor === 1 ? '--' : `+${Math.round((o.factor - 1) * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Text as="p" variant="body-sm-normal" color="secondary">
          The factor multiplies each Source's in + out throughput before peak and node counts are computed. Validate against real CPU usage during detailed design.
        </Text>
        <DocLinks keys={['scaling']} />
      </Section>

      <Section title="Persistent Queue disk" description="Disk to ride out a downstream outage without losing data." icon={<HardDrive />}>
        <div className="grid-2">
          <ul className="method-list">
            <li>
              <strong>Per PQ-enabled Source or Destination:</strong> hourly volume × outage hours. Destination queues use volume after filtering.
            </li>
            <li>
              <strong>Spread across the surviving nodes</strong> (HA spares down), then add the Cribl default {`${SIZING_RULES.minFreeDiskGB} GB`} minimum free disk and working space.
            </li>
            <li>
              <strong>Cribl.Cloud-managed Worker Groups:</strong> Destination PQ is 1 GB per Destination per Worker Process, and Source PQ runs in Always On mode only. Cribl manages the disk.
            </li>
          </ul>
          <div className="example">
            <Text as="h3" variant="body-md-semibold">
              Example
            </Text>
            <ol className="example__steps">
              <li>
                <span>Hourly</span>
                <code className="mono">{`${fmtNum(pq.dailyGB)} GB/day ÷ 24 = ${fmtNum(pq.hourly)} GB/h`}</code>
              </li>
              <li>
                <span>Outage</span>
                <code className="mono">{`${fmtNum(pq.hourly)} × ${pq.hours} h = ${fmtNum(pq.total)} GB`}</code>
              </li>
              <li>
                <span>Per node</span>
                <code className="mono">{`${fmtNum(pq.total)} ÷ ${pq.surviving} surviving nodes = ${pq.perNode} GB`}</code>
              </li>
            </ol>
          </div>
        </div>
        <DocLinks keys={['pq']} />
      </Section>

      <Section title="Cribl-managed Worker Groups" description="When Cribl.Cloud runs the Worker Nodes for you." icon={<Cloud />}>
        <ul className="method-list">
          <li>
            <strong>Sizing tier ≈ peak in + out ÷ 3.</strong> Cribl.Cloud tiers are expressed as ingest and assume a 1:2 ingest:egress ratio, so one third of the combined throughput is the ingest tier.
          </li>
          <li>
            <strong>{`Up to ${SIZING_RULES.cloudGroupMaxTBPerDay} TB/day per group.`}</strong> Larger workloads are split across Worker Groups; the designer warns when a group exceeds this.
          </li>
          <li>
            <strong>About 30 minutes to provision.</strong> Cribl.Cloud provisions, scales and keeps Cribl-managed groups highly available, so no node counts or HA spares are planned for them.
          </li>
        </ul>
        <DocLinks keys={['cloudWorkers']} />
      </Section>

      <Section title="Topology" description="Cribl's control plane and data plane, as the designer draws them." icon={<NodesOutlined />}>
        <Topology />
        <div className="grid-2">
          <div className="topo-note">
            <Text as="h3" variant="body-md-semibold">
              Leader high availability, on-premises
            </Text>
            <Text as="p" variant="body-sm-normal" color="secondary">
              A primary and a standby Leader share a failover volume on NFS. Worker Nodes keep processing with their last configuration if the Leader is unavailable.
            </Text>
          </div>
          <div className="topo-note">
            <Text as="h3" variant="body-md-semibold">
              Leader high availability, Cribl.Cloud
            </Text>
            <Text as="p" variant="body-sm-normal" color="secondary">
              Hybrid and fully Cloud designs use the Cribl-managed Leader in your Cribl.Cloud workspace; its high availability is automatic.
            </Text>
          </div>
        </div>
        <DocLinks keys={['architecture', 'fleets', 'secondLeader']} />
      </Section>

      <Section title="Ports" description="What to open between Sources, load balancers, Worker Nodes and the Leader." icon={<TableOutlined />}>
        <div className="table-scroll">
          <table className="data-table method-table">
            <thead>
              <tr>
                <th scope="col">Port</th>
                <th scope="col">Protocol</th>
                <th scope="col">Purpose</th>
                <th scope="col">Direction</th>
              </tr>
            </thead>
            <tbody>
              {PORT_ROWS.map((p) => (
                <tr key={p.port}>
                  <th scope="row" className="row-head mono">
                    {p.port}
                  </th>
                  <td>{p.protocol}</td>
                  <td>{p.purpose}</td>
                  <td>{p.direction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DocLinks keys={['ports']} />
      </Section>

      <Section title="What we corrected vs. the original designer" description="Changes made while porting the pre-sales wizard into a Cribl App." icon={<SwapOutlined />} tone="accent">
        <ul className="corrections">
          {CORRECTIONS.map((c) => (
            <li key={c.topic} className="correction">
              <span className="correction__icon" aria-hidden>
                <CheckOutlined size="sm" />
              </span>
              <div className="correction__body">
                <Text as="h3" variant="body-sm-semibold">
                  {c.topic}
                </Text>
                <div className="correction__diff">
                  <span className="correction__before">
                    <Text variant="body-xs-semibold" color="secondary">
                      WAS
                    </Text>
                    <span className="correction__was">
                      <Text variant="body-sm-normal">{c.before}</Text>
                    </span>
                  </span>
                  <span className="correction__after">
                    <Text variant="body-xs-semibold" color="success">
                      NOW
                    </Text>
                    <Text variant="body-sm-normal">{c.after}</Text>
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <DocLinks keys={['scaling', 'architecture', 'ports']} />
      </Section>

      <div className="method-footer">
        <WorkersOutlined size="sm" aria-hidden />
        <Text variant="body-xs-normal" color="secondary">
          Sizing is a planning estimate. Validate with a proof of concept and real CPU metrics before committing hardware.
        </Text>
      </div>
    </div>
  );
}
