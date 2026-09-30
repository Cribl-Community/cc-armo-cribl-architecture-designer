import { useEffect } from 'react';
import { NumberField, Switch, Text } from '@capra/core';
import {
  CheckOutlined,
  CloudOutlined,
  Gauge,
  HardDrive,
  Lightbulb,
  NodesOutlined,
  PartitionOutlined,
  SwapOutlined,
  TriangleExclamation,
  UsersOutlined,
  WorkersOutlined,
} from '@capra/icons';
import {
  CATEGORY_LABELS,
  COMPLEXITY_OPTIONS,
  DEPLOYMENT_MODEL_OPTIONS,
  NODE_SIZES,
  SIZING_RULES,
  WORKER_GROUP_STRATEGY_OPTIONS,
  complexityFactor,
  nodeProfile,
} from '../../model/catalog';
import type { ArchitectureResult, CpuArch, DeploymentModel, Design, NodeProfile, SourceCategory } from '../../model/types';
import { useDesign } from '../../state/DesignStore';
import { Callout, InfoTip, PageHeader, Section, WizardFooter, fmtGB, fmtNum } from '../../ui/layout';
import { useStepNav } from '../../ui/useStepNav';
import { clampNum } from './inputs/num';
import { ChoiceTile, TipField } from './inputs/shared';
import './inputs/inputs.css';

const DEPLOY_ICONS: Record<DeploymentModel, typeof HardDrive> = { 'on-prem': HardDrive, hybrid: SwapOutlined, cloud: CloudOutlined };
const CATEGORY_ORDER: SourceCategory[] = ['endpoint', 'network', 'cloud'];
const sizeName = (p: NodeProfile) => p.label.split(' — ')[0];

export default function Step3Drivers() {
  const { design, result, setDrivers } = useDesign();
  const { next, back } = useStepNav(3);
  const { drivers } = design;

  // Cribl Lake is cloud-only: On-Prem is not a valid deployment model when it is a destination.
  const hasCriblLake = design.destinations.some((d) => d.type === 'Cribl Lake');
  useEffect(() => {
    if (hasCriblLake && drivers.deploymentModel === 'on-prem') setDrivers({ deploymentModel: 'hybrid' });
  }, [hasCriblLake, drivers.deploymentModel, setDrivers]);

  const profiles = NODE_SIZES.map((size) => nodeProfile(size, drivers.cpuArch));
  const selected = profiles.find((p) => p.size === drivers.nodeSize) ?? profiles[1];
  const presentCategories = CATEGORY_ORDER.filter((c) => result.architecture.categorizedSources[c].length > 0);
  const deploymentDef = DEPLOYMENT_MODEL_OPTIONS.find((o) => o.value === drivers.deploymentModel);

  // Headroom the complexity factors add (or would add) for this design's sources.
  const baseThroughput = result.metrics.totalThroughputGB;
  const headroomThroughput = result.metrics.perSource.reduce((a, r) => {
    const src = design.sources.find((s) => s.id === r.sourceId);
    return a + r.throughputGB * (src ? complexityFactor(src.complexity) : 1);
  }, 0);
  const headroomPct = baseThroughput > 0 ? Math.round((headroomThroughput / baseThroughput - 1) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow={<span className="chip chip--brand">Step 3 of 7</span>}
        title="Step 3: Architecture Drivers"
        description="Define key factors that influence architecture sizing and design"
      />

      <div className="in-drivers">
        <div className="in-drivers__main">
          {/* ── Worker Group strategy ─────────────────────────── */}
          <Section
            icon={<UsersOutlined size="sm" />}
            title={
              <span className="in-inline-heading">
                Worker Group Strategy
                <InfoTip text="Single Group: all Worker Nodes handle all workloads (simple, good for POC). Multiple Groups: Worker Groups are separated by source category - Endpoint, Network, Cloud (recommended for production isolation)." />
              </span>
            }
            description="These settings determine resource requirements and available features"
          >
            <div className="grid-2" role="group" aria-label="Worker Group Strategy">
              {WORKER_GROUP_STRATEGY_OPTIONS.map((opt) => (
                <ChoiceTile
                  key={opt.value}
                  selected={drivers.workerGroupStrategy === opt.value}
                  onSelect={() => setDrivers({ workerGroupStrategy: opt.value })}
                  icon={opt.value === 'single' ? <WorkersOutlined size="md" /> : <PartitionOutlined size="md" />}
                  compactIcon
                  title={opt.label}
                  description={opt.description}
                >
                  <span className="in-tile__footer">
                    {opt.value === 'single' ? (
                      <span className="chip">1 Worker Group</span>
                    ) : presentCategories.length > 0 ? (
                      <span className="chip chip--brand">
                        {presentCategories.length} group{presentCategories.length > 1 ? 's' : ''}: {presentCategories.map((c) => CATEGORY_LABELS[c]).join(', ')}
                      </span>
                    ) : (
                      <span className="chip">One group per source category</span>
                    )}
                    {opt.value === 'multiple' && design.mode === 'production' && <span className="chip chip--success">Recommended for production</span>}
                  </span>
                </ChoiceTile>
              ))}
            </div>
          </Section>

          {/* ── Worker Node sizing ────────────────────────────── */}
          <Section
            icon={<NodesOutlined size="sm" />}
            title={
              <span className="in-inline-heading">
                Worker Node Sizing
                <InfoTip text="Determines how many CPU cores each Worker Node has. Affects the number of Worker Nodes needed and manageability." />
              </span>
            }
            description="Choose the CPU architecture and the size of each Worker Node. Capacity follows Cribl's published per-vCPU guidance."
          >
            <div className="stack stack--sm">
              <Text variant="body-sm-semibold">CPU architecture</Text>
              <div className="in-arch-grid" role="group" aria-label="CPU architecture">
                {(['x86', 'arm'] as CpuArch[]).map((arch) => {
                  const rule = SIZING_RULES[arch];
                  return (
                    <ChoiceTile
                      key={arch}
                      selected={drivers.cpuArch === arch}
                      onSelect={() => setDrivers({ cpuArch: arch })}
                      icon={<Text variant="body-xs-semibold">{arch === 'x86' ? 'x86' : 'ARM'}</Text>}
                      compactIcon
                      title={rule.label}
                      description={`${rule.gbPerDayPerVcpu} GB/day per vCPU (in + out) · ${rule.reservedVcpus} vCPU${rule.reservedVcpus > 1 ? 's' : ''} reserved per node for the OS and API`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="stack stack--sm">
              <Text variant="body-sm-semibold">Worker Node size</Text>
              <div className="in-size-grid" role="group" aria-label="Worker Node size">
                {profiles.map((p) => (
                  <button key={p.size} type="button" className="choice-tile in-tile in-size-tile" aria-pressed={drivers.nodeSize === p.size} onClick={() => setDrivers({ nodeSize: p.size })}>
                    <span className="in-size-tile__top">
                      <Text variant="body-sm-semibold">{sizeName(p)}</Text>
                      {p.recommended && <span className="chip chip--success">Recommended</span>}
                    </span>
                    <Text variant="metric-sm">{p.vcpus} vCPU</Text>
                    <span className="in-size-tile__specs">
                      <span className="in-spec">
                        <Text variant="body-xs-normal" color="secondary">
                          Worker Processes
                        </Text>
                        <Text variant="body-xs-semibold">{p.workerProcesses}</Text>
                      </span>
                      <span className="in-spec">
                        <Text variant="body-xs-normal" color="secondary">
                          Capacity / node
                        </Text>
                        <Text variant="body-xs-semibold">{fmtNum(p.capacityGBPerDay)} GB/day</Text>
                      </span>
                      <span className="in-spec">
                        <Text variant="body-xs-normal" color="secondary">
                          RAM
                        </Text>
                        <Text variant="body-xs-semibold">{p.ramGB} GB</Text>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="in-detail" aria-live="polite">
              <div className="stack stack--sm">
                <Text variant="body-md-semibold">{selected.label}</Text>
                <Text variant="body-sm-normal">{selected.description}</Text>
              </div>
              <div className="stack stack--sm">
                <Text variant="body-xs-semibold" color="secondary">
                  <span className="in-metric__label">Minimum requirements per Worker Node</span>
                </Text>
                <div className="in-reqs">
                  <div className="in-req">
                    <Text variant="body-xs-normal" color="secondary">
                      CPU
                    </Text>
                    <Text variant="body-sm-semibold">{selected.vcpus} vCPU</Text>
                    <Text variant="body-xs-normal" color="secondary">
                      {selected.reservedVcpus} reserved · {selected.workerProcesses} Worker Processes
                    </Text>
                  </div>
                  <div className="in-req">
                    <Text variant="body-xs-normal" color="secondary">
                      RAM
                    </Text>
                    <Text variant="body-sm-semibold">{selected.ramGB} GB</Text>
                    <Text variant="body-xs-normal" color="secondary">
                      ~{SIZING_RULES.heapGBPerWorkerProcess} GB heap per Worker Process + {SIZING_RULES.osRamGB} GB OS
                    </Text>
                  </div>
                  <div className="in-req">
                    <Text variant="body-xs-normal" color="secondary">
                      Disk
                    </Text>
                    <Text variant="body-sm-semibold">{selected.baseDiskGB} GB + PQ</Text>
                    <Text variant="body-xs-normal" color="secondary">
                      PQ disk is sized in the next step
                    </Text>
                  </div>
                  <div className="in-req">
                    <Text variant="body-xs-normal" color="secondary">
                      Max throughput
                    </Text>
                    <Text variant="body-sm-semibold">{fmtNum(selected.capacityGBPerDay)} GB/day</Text>
                    <Text variant="body-xs-normal" color="secondary">
                      {selected.workerProcesses} × {selected.gbPerDayPerVcpu} GB/day
                    </Text>
                  </div>
                </div>
                <div className="in-hint">
                  <Lightbulb size="xs" />
                  <Text variant="body-xs-normal">PQ (Persistent Queue) requires additional disk space for buffering.</Text>
                </div>
              </div>
              <div className="in-pcu">
                <div className="in-pcu__col">
                  <span className="in-pcu__title in-pcu__title--pro">
                    <CheckOutlined size="xs" />
                    <Text variant="body-xs-semibold">Pros</Text>
                  </span>
                  <ul>
                    {selected.pros.map((x) => (
                      <li key={x}>
                        <Text variant="body-xs-normal">{x}</Text>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="in-pcu__col">
                  <span className="in-pcu__title in-pcu__title--con">
                    <TriangleExclamation size="xs" />
                    <Text variant="body-xs-semibold">Cons</Text>
                  </span>
                  <ul>
                    {selected.cons.map((x) => (
                      <li key={x}>
                        <Text variant="body-xs-normal">{x}</Text>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="in-pcu__col">
                  <span className="in-pcu__title in-pcu__title--use">
                    <Gauge size="xs" />
                    <Text variant="body-xs-semibold">Use cases</Text>
                  </span>
                  <ul>
                    {selected.useCases.map((x) => (
                      <li key={x}>
                        <Text variant="body-xs-normal">{x}</Text>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {selected.recommended && (
                <Callout tone="success">
                  <strong>Cribl Recommended:</strong> This is the most balanced approach for production deployments.
                </Callout>
              )}
            </div>
          </Section>

          {/* ── Deployment model ──────────────────────────────── */}
          <Section
            icon={<CloudOutlined size="sm" />}
            title={
              <span className="in-inline-heading">
                Deployment Model
                <InfoTip text="Determines where components run and which features are available. On-Prem disables cloud-managed features." />
              </span>
            }
            description={deploymentDef?.description}
          >
            <div className="in-deploy-grid" role="group" aria-label="Deployment Model">
              {DEPLOYMENT_MODEL_OPTIONS.map((opt) => {
                const Icon = DEPLOY_ICONS[opt.value];
                const blocked = hasCriblLake && opt.value === 'on-prem';
                return (
                  <ChoiceTile
                    key={opt.value}
                    selected={drivers.deploymentModel === opt.value}
                    disabled={blocked}
                    onSelect={() => setDrivers({ deploymentModel: opt.value })}
                    icon={<Icon size="md" />}
                    compactIcon
                    title={opt.label}
                    description={opt.description}
                  >
                    {blocked && (
                      <span className="in-tile__footer">
                        <span className="chip chip--warning">Not available with Cribl Lake</span>
                      </span>
                    )}
                  </ChoiceTile>
                );
              })}
            </div>
            {hasCriblLake && (
              <Callout tone="info" title="Cribl Lake Detected">
                Cribl Lake is a cloud-only service. On-Prem deployment is not available. Your deployment must be Hybrid or Cloud.
              </Callout>
            )}
          </Section>

          {/* ── Traffic profile ───────────────────────────────── */}
          <Section icon={<Gauge size="sm" />} title="Traffic Profile" description="Peaks, data reduction and processing headroom used to size capacity">
            <div className="grid-2">
              <TipField
                label="Peak Factor"
                tip="Multiplier for peak traffic periods (e.g., 2x means traffic can spike to 2x the average). Used to ensure capacity during peak loads."
              >
                <NumberField
                  aria-label="Peak Factor (x average load)"
                  min={1}
                  max={10}
                  step={0.5}
                  value={drivers.peakFactor}
                  onChange={(v) => setDrivers({ peakFactor: clampNum(v, 1, 10, 1) })}
                  helperText={`x average load. Multiplier to account for spikes in log volume (e.g., 2x during incidents). Architecture will be sized to handle ${drivers.peakFactor}x the average throughput.`}
                />
              </TipField>
              <TipField label="Filtering / Drop %" tip="Estimated percentage of data that will be filtered out or dropped. Reduces outbound data volume and costs.">
                <NumberField
                  aria-label="Filtering / Drop % (percent dropped)"
                  min={0}
                  max={99}
                  step={1}
                  value={drivers.filteringDropPercent}
                  onChange={(v) => setDrivers({ filteringDropPercent: Math.round(clampNum(v, 0, 99, 0)) })}
                  helperText={
                    drivers.filteringDropPercent > 0
                      ? `% dropped. Reduces outbound data by ${drivers.filteringDropPercent}% (${fmtGB(result.metrics.totalOutboundBeforeDropGB)} → ${fmtGB(result.metrics.totalOutboundGB)}).`
                      : '% dropped. No data reduction applied'
                  }
                />
              </TipField>
            </div>

            <div className="in-switch-row">
              <div className="in-switch-row__control">
                <Switch
                  aria-label="Apply processing-complexity headroom to sizing"
                  checked={drivers.applyComplexityHeadroom}
                  onChange={(e) => setDrivers({ applyComplexityHeadroom: e.target.checked })}
                />
              </div>
              <div className="in-switch-row__body">
                <Text variant="body-sm-semibold">Apply processing-complexity headroom to sizing</Text>
                <Text variant="body-sm-normal" color="secondary">
                  Multiplies each source&apos;s throughput by its processing-complexity factor before sizing. When off, complexity is only used as a risk indicator and
                  shows as a warning on the architecture.
                </Text>
                <div className="row">
                  {COMPLEXITY_OPTIONS.map((o) => (
                    <span key={o.value} className="chip">
                      {o.label.replace(' Processing', '').replace(' / To Be Decided', '')} ×{o.factor % 1 === 0 ? o.factor.toFixed(1) : o.factor}
                    </span>
                  ))}
                </div>
                {design.sources.length > 0 && (
                  <Text variant="body-xs-semibold" color={drivers.applyComplexityHeadroom ? 'accent' : 'secondary'}>
                    {headroomPct > 0
                      ? drivers.applyComplexityHeadroom
                        ? `Adds +${headroomPct}% capacity for this design's sources.`
                        : `Would add +${headroomPct}% capacity for this design's sources.`
                      : 'All sources are Light processing: no extra headroom needed.'}
                  </Text>
                )}
              </div>
            </div>

            <Callout tone="info" title="Architecture Sizing Note">
              These drivers estimate capacity using Cribl&apos;s published sizing guidance: {SIZING_RULES.x86.gbPerDayPerVcpu} GB/day per x86 vCPU or{' '}
              {SIZING_RULES.arm.gbPerDayPerVcpu} GB/day per ARM vCPU (in + out), reserved vCPUs per node, capacity to survive{' '}
              {SIZING_RULES.haSurvivableNodeLossPct * 100}% of nodes down, and at least {SIZING_RULES.minProductionNodesPerGroup} Worker Nodes per production Worker Group. See
              Methodology in the left navigation for the full model. Always validate with real data and CPU usage in your environment.
            </Callout>
          </Section>
        </div>

        <LivePreview design={design} result={result} />
      </div>

      <WizardFooter onBack={back} next={{ label: 'Next: Features & Persistent Queues', onClick: next }} />
    </>
  );
}

function PreviewMetric({ label, value, sub, hero }: { label: string; value: string | number; sub?: string; hero?: boolean }) {
  return (
    <div className={`in-metric ${hero ? 'in-metric--hero' : ''}`}>
      <Text variant="body-xs-semibold" color="secondary">
        <span className="in-metric__label">{label}</span>
      </Text>
      <span key={String(value)} className="in-metric__value">
        <Text variant={hero ? 'metric-lg' : 'metric-md'}>{value}</Text>
      </span>
      {sub && (
        <Text variant="body-xs-normal" color="secondary">
          {sub}
        </Text>
      )}
    </div>
  );
}

function LivePreview({ design, result }: { design: Design; result: ArchitectureResult }) {
  const { metrics, architecture } = result;
  const groups = architecture.workerGroups;
  const isProd = design.mode === 'production';
  const cribl = groups.every((g) => g.managedBy === 'cribl');
  const spares = groups.reduce((a, g) => a + g.haSpareNodes, 0);
  const floorApplied = groups.some((g) => g.haFloorApplied);
  const leader = architecture.useManagedLeader ? 'Cribl.Cloud Leader (managed)' : architecture.leaderHA ? 'Leader HA pair (customer-managed)' : 'Single Leader (POC)';

  return (
    <aside className="in-preview" aria-label="Live sizing preview" aria-live="polite">
      <div className="in-preview__head">
        <Text as="h2" variant="heading-sm">
          Live sizing preview
        </Text>
        <span className="in-live">
          <span className="in-live__dot" aria-hidden />
          Live
        </span>
      </div>

      {design.sources.length === 0 && <Callout tone="warning">Add sources in Step 2 to see sizing for real traffic. Minimum footprints are shown.</Callout>}

      <div className="in-metrics">
        <PreviewMetric
          hero
          label="Worker Nodes"
          value={fmtNum(metrics.totalNodes)}
          sub={
            isProd
              ? `${fmtNum(metrics.nodesForCapacity)} for capacity → ${fmtNum(metrics.totalNodes)} deployed with HA (+${spares} spare${spares === 1 ? '' : 's'}${floorApplied ? ', 3-node minimum applied' : ''})`
              : `${fmtNum(metrics.nodesForCapacity)} for capacity · POC: no HA spares`
          }
        />
        <PreviewMetric label="Worker Groups" value={groups.length} sub={design.drivers.workerGroupStrategy === 'multiple' ? 'By source category' : 'Single group'} />
        <PreviewMetric label="Total vCPUs" value={fmtNum(metrics.totalVcpus)} sub={`${fmtNum(metrics.totalWorkerProcesses)} Worker Processes`} />
        <PreviewMetric label="Peak throughput" value={fmtGB(metrics.peakThroughputGB)} sub={`in + out × ${design.drivers.peakFactor} peak`} />
        <PreviewMetric label="Per node" value={`${fmtNum(architecture.profile.capacityGBPerDay)}`} sub={`GB/day · ${architecture.profile.vcpus} vCPU · ${architecture.profile.ramGB} GB RAM`} />
      </div>

      <div className="in-groups">
        {groups.map((g) => {
          const pct = Math.min(100, Math.round(g.peakUtilizationPct));
          return (
            <div key={g.id} className="in-group">
              <div className="in-group__row">
                <span className="in-group__letter">{g.letter}</span>
                <span className="in-group__name">
                  <Text variant="body-sm-semibold">{g.name}</Text>
                </span>
                <Text variant="body-xs-semibold" color="secondary">
                  {g.managedBy === 'cribl' ? `~${g.cloudTierTBPerDay} TB/day` : `${g.nodes} × ${g.profile.vcpus} vCPU`}
                </Text>
              </div>
              <div className="in-bar" role="img" aria-label={`Peak utilization ${pct}%`}>
                <div className={`in-bar__fill ${pct > 85 ? 'in-bar__fill--warning' : ''}`} style={{ width: `${Math.max(2, pct)}%` }} />
              </div>
              <Text variant="body-xs-normal" color="secondary">
                {g.managedBy === 'cribl' ? 'Cribl-managed Worker Group · ' : ''}
                {fmtGB(g.peakGB)} peak · {pct}% of deployed capacity
              </Text>
            </div>
          );
        })}
      </div>

      <div className="stack stack--sm">
        <div className="in-flow">
          <span className="chip chip--brand">{leader}</span>
          {architecture.useEdge && <span className="chip chip--success">{fmtNum(metrics.totalEdgeNodes)} Edge Nodes</span>}
          {architecture.useLB && <span className="chip chip--info">Load balancer</span>}
        </div>
        {cribl && (
          <Text variant="body-xs-normal" color="secondary">
            Cribl.Cloud provisions and scales Cribl-managed Worker Groups; node counts are indicative.
          </Text>
        )}
      </div>
    </aside>
  );
}
