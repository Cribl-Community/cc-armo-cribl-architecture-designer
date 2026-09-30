import type { ReactNode } from 'react';
import { IconButton, Link, Popover, Text } from '@capra/core';
import { ArrowRight, CircleInfo, Gauge, HardDrive } from '@capra/icons';
import { COMPLEXITY_OPTIONS, SIZING_RULES } from '../../../model/catalog';
import type { ArchitectureResult, Design, SourceGroup, WorkerGroupResult } from '../../../model/types';
import { Callout, InfoTip, Section, fmtGB, fmtNum } from '../../../ui/layout';
import { SourceLogo } from '../../../ui/logos';
import { UtilizationBar } from '../../../features/diagram/nodes';
import { gb, mult } from './format';

/* ── Popover formula content ───────────────────────────────── */

function Formula({ title, lines, children, why }: { title: string; lines?: ReactNode[]; children?: ReactNode; why?: ReactNode }) {
  return (
    <div className="arch-formula">
      <Text as="div" variant="body-sm-semibold">
        {title}
      </Text>
      {lines && lines.length > 0 && (
        <ul className="arch-formula__lines">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {children}
      {why && <div className="arch-formula__why">{why}</div>}
    </div>
  );
}

const Eq = ({ children }: { children: ReactNode }) => <div className="arch-formula__eq mono">{children}</div>;

function FormulaButton({ label, content }: { label: string; content: ReactNode }) {
  return (
    <Popover content={content} placement="bottom">
      <IconButton icon={CircleInfo} aria-label={label} variant="tertiary" size="xs" />
    </Popover>
  );
}

/* ── (a) Per-source throughput table ───────────────────────── */

function ThroughputTable({ design, result }: { design: Design; result: ArchitectureResult }) {
  const m = result.metrics;
  const rows = m.perSource;
  const byId = new Map(design.sources.map((s) => [s.id, s]));
  const letterOf = new Map<string, string>();
  for (const g of result.architecture.workerGroups) for (const s of g.sources) letterOf.set(s.id, g.letter);
  const drop = design.drivers.filteringDropPercent;
  const avgCf = m.totalThroughputGB > 0 ? m.weightedThroughputGB / m.totalThroughputGB : 1;
  const pf = design.drivers.peakFactor;

  return (
    <div className="arch-table-wrap">
      <table className="data-table arch-num-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Group</th>
            <th className="arch-num">In (GB/day)</th>
            <th className="arch-num">Destinations</th>
            <th className="arch-num">Out after {drop}% drop</th>
            <th className="arch-num">In + Out</th>
            <th className="arch-num">Complexity</th>
            <th className="arch-num">Weighted</th>
            <th className="arch-num">Peak (×{mult(pf)})</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = byId.get(r.sourceId);
            return (
              <tr key={r.sourceId}>
                <td>
                  <span className="row arch-src-cell">
                    <SourceLogo type={r.type} size="sm" />
                    <span>{s?.label?.trim() || r.type}</span>
                  </span>
                </td>
                <td>{letterOf.get(r.sourceId) && <span className="arch-letter">{letterOf.get(r.sourceId)}</span>}</td>
                <td className="arch-num">{gb(r.inGB)}</td>
                <td className="arch-num">{r.destinations === 0 ? <span className="chip chip--danger">none</span> : r.destinations}</td>
                <td className="arch-num">{gb(r.outGB)}</td>
                <td className="arch-num">{gb(r.throughputGB)}</td>
                <td className="arch-num">×{mult(r.complexityFactor)}</td>
                <td className="arch-num">{gb(r.weightedGB)}</td>
                <td className="arch-num arch-strong">{gb(r.peakGB)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td />
            <td className="arch-num">{gb(m.totalInboundGB)}</td>
            <td className="arch-num">{mult(m.effectiveFanout)}× avg</td>
            <td className="arch-num">{gb(m.totalOutboundGB)}</td>
            <td className="arch-num">{gb(m.totalThroughputGB)}</td>
            <td className="arch-num">×{mult(avgCf)} avg</td>
            <td className="arch-num">{gb(m.weightedThroughputGB)}</td>
            <td className="arch-num arch-strong">{gb(m.peakThroughputGB)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ── (b) Calculation ladder ────────────────────────────────── */

interface LadderStep {
  key: string;
  label: string;
  op?: string;
  value: number;
  caption: string;
  formula: ReactNode;
  emphasis?: boolean;
}

function CalculationLadder({ design, result }: { design: Design; result: ArchitectureResult }) {
  const m = result.metrics;
  const d = design.drivers;
  const rows = m.perSource;
  const name = (id: string, type: string) => design.sources.find((s) => s.id === id)?.label?.trim() || type;
  const avgCf = m.totalThroughputGB > 0 ? m.weightedThroughputGB / m.totalThroughputGB : 1;
  const unroutedGB = m.totalInboundGB - m.routedInboundGB;
  const profile = result.architecture.profile;

  const steps: LadderStep[] = [
    {
      key: 'in',
      label: 'Inbound',
      value: m.totalInboundGB,
      caption: 'Σ source volumes',
      formula: (
        <Formula
          title="Step 1 · Total inbound volume"
          lines={rows.map((r) => (
            <>
              {name(r.sourceId, r.type)}: <b>{gb(r.inGB)}</b> GB/day
            </>
          ))}
          why={unroutedGB > 0 ? `${gb(unroutedGB)} GB/day comes from sources without Destinations: it is ingested (and sized for) but not forwarded.` : undefined}
        >
          <Eq>Total = {gb(m.totalInboundGB)} GB/day</Eq>
        </Formula>
      ),
    },
    {
      key: 'fanout',
      label: 'Fan-out',
      op: `× ${mult(m.effectiveFanout)}`,
      value: m.totalOutboundBeforeDropGB,
      caption: 'outbound before filtering',
      formula: (
        <Formula
          title="Step 2 · Weighted fan-out"
          lines={rows.map((r) => (
            <>
              {name(r.sourceId, r.type)}: {gb(r.inGB)} × {r.destinations} dest = <b>{gb(r.inGB * r.destinations)}</b>
            </>
          ))}
          why="Every Destination a source is routed to is a separate copy leaving the Worker Group."
        >
          <Eq>
            Fan-out = Σ(volume × destinations) ÷ routed inbound = {gb(m.totalOutboundBeforeDropGB)} ÷ {gb(m.routedInboundGB)} = {mult(m.effectiveFanout)}×
          </Eq>
        </Formula>
      ),
    },
    {
      key: 'drop',
      label: 'Filtering',
      op: `− ${d.filteringDropPercent}%`,
      value: m.totalOutboundGB,
      caption: 'outbound after drop',
      formula: (
        <Formula title="Step 3 · Outbound after filtering" why="Filtering, sampling and dropping in Pipelines reduce what reaches each Destination, not what the Worker Group receives.">
          <Eq>
            Out = Σ(volume × destinations) × (1 − {d.filteringDropPercent}%) = {gb(m.totalOutboundBeforeDropGB)} × {mult(m.dropFactor)} = {gb(m.totalOutboundGB)} GB/day
          </Eq>
        </Formula>
      ),
    },
    {
      key: 'tp',
      label: 'Throughput',
      op: 'in + out',
      value: m.totalThroughputGB,
      caption: 'bytes through Worker Processes',
      formula: (
        <Formula title="Step 4 · Total throughput" why="Cribl sizing guidance counts inbound and outbound bytes: a Worker Process spends CPU both receiving and sending.">
          <Eq>
            Throughput = in + out = {gb(m.totalInboundGB)} + {gb(m.totalOutboundGB)} = {gb(m.totalThroughputGB)} GB/day
          </Eq>
        </Formula>
      ),
    },
    {
      key: 'cx',
      label: 'Complexity headroom',
      op: `× ${mult(avgCf)}`,
      value: m.weightedThroughputGB,
      caption: d.applyComplexityHeadroom ? 'weighted per source' : 'not applied',
      formula: (
        <Formula
          title="Step 5 · Processing-complexity headroom"
          lines={
            d.applyComplexityHeadroom
              ? rows.map((r) => (
                  <>
                    {name(r.sourceId, r.type)}: {gb(r.throughputGB)} × {mult(r.complexityFactor)} = <b>{gb(r.weightedGB)}</b>
                  </>
                ))
              : undefined
          }
          why={
            d.applyComplexityHeadroom
              ? `Factors: ${COMPLEXITY_OPTIONS.map((o) => `${o.label.replace(' Processing', '').replace(' / To Be Decided', '')} ×${mult(o.factor)}`).join(' · ')}. Validate with real CPU usage during detailed design.`
              : 'Complexity headroom is switched off in Architecture Drivers, so every source counts ×1.0 (base sizing assumes light processing). See the warnings below.'
          }
        >
          <Eq>
            Weighted = Σ(throughput × factor) = {gb(m.weightedThroughputGB)} GB/day (×{mult(avgCf)} on average)
          </Eq>
        </Formula>
      ),
    },
    {
      key: 'peak',
      label: 'Peak',
      op: `× ${mult(d.peakFactor)}`,
      value: m.peakThroughputGB,
      caption: 'sizing target',
      emphasis: true,
      formula: (
        <Formula title="Step 6 · Peak throughput" why="Peak throughput makes sure Worker Nodes absorb traffic spikes without backpressure. Every Worker Group is sized against its share of this number.">
          <Eq>
            Peak = weighted × peak factor = {gb(m.weightedThroughputGB)} × {mult(d.peakFactor)} = {gb(m.peakThroughputGB)} GB/day
          </Eq>
        </Formula>
      ),
    },
  ];

  const anyCustomer = result.architecture.workerGroups.some((g) => g.managedBy === 'customer');

  return (
    <div className="stack">
      <ol className="arch-ladder" aria-label="Sizing calculation">
        {steps.map((s, i) => (
          <li key={s.key} className={`arch-ladder__step${s.emphasis ? ' arch-ladder__step--peak' : ''}`}>
            {i > 0 && (
              <span className="arch-ladder__arrow" aria-hidden>
                <ArrowRight size="xs" />
              </span>
            )}
            <div className="arch-ladder__card">
              <div className="arch-ladder__top">
                <span className="arch-ladder__label">{s.label}</span>
                <FormulaButton label={`Show ${s.label.toLowerCase()} calculation`} content={s.formula} />
              </div>
              {s.op && <span className="arch-ladder__op mono">{s.op}</span>}
              <span className="arch-ladder__value">{fmtGB(s.value)}</span>
              <span className="arch-ladder__caption">{s.caption}</span>
            </div>
          </li>
        ))}
      </ol>
      {anyCustomer && (
        <Callout tone="accent" title="From peak to Worker Nodes">
          Each {profile.label} node runs {profile.workerProcesses} Worker Processes ({profile.vcpus} vCPU − {profile.reservedVcpus} reserved) × {profile.gbPerDayPerVcpu} GB/day ={' '}
          <b>{fmtNum(profile.capacityGBPerDay)} GB/day per node</b>. Each Worker Group divides its own peak by that capacity, rounds up, then adds HA spares ({SIZING_RULES.haSurvivableNodeLossPct * 100}% node-loss rule) and the
          production minimum of {SIZING_RULES.minProductionNodesPerGroup} nodes: {result.metrics.nodesForCapacity} nodes for capacity → {result.metrics.totalNodes} deployed.
        </Callout>
      )}
    </div>
  );
}

/* ── (c) Per-Worker-Group sizing ───────────────────────────── */

function CalcRow({ label, formula, result, tone, hint }: { label: string; formula?: ReactNode; result: ReactNode; tone?: 'ok' | 'raised' | 'bad'; hint?: string }) {
  return (
    <div className={`arch-calc${tone ? ` arch-calc--${tone}` : ''}`}>
      <span className="arch-calc__label">
        {label}
        {hint && <InfoTip text={hint} />}
      </span>
      <span className="arch-calc__formula mono">{formula}</span>
      <span className="arch-calc__result">{result}</span>
    </div>
  );
}

function SourcesLine({ sources }: { sources: SourceGroup[] }) {
  if (!sources.length) return <span className="muted">No sources</span>;
  return (
    <span className="arch-src-line">
      {sources.map((s) => (
        <span key={s.id} className="arch-src-pill">
          <SourceLogo type={s.type} size="xs" />
          {s.label?.trim() || s.type}
        </span>
      ))}
    </span>
  );
}

function GroupSizingCard({ group: g, design }: { group: WorkerGroupResult; design: Design }) {
  const p = g.profile;
  const isProd = design.mode === 'production';
  const managed = g.managedBy === 'cribl';
  const survivors = Math.max(1, g.nodes - g.haSpareNodes);
  const ratio = p.capacityGBPerDay > 0 ? g.peakGB / p.capacityGBPerDay : 0;
  const ingestGB = g.peakGB / 3;
  const ingestTB = ingestGB / 1024;
  const survives = g.capacityWithSpareDownGB >= g.peakGB;

  return (
    <div className="arch-group-card">
      <div className="arch-group-card__head">
        <span className="arch-letter arch-letter--lg">{g.letter}</span>
        <div className="arch-group-card__title">
          <Text as="div" variant="heading-xs">
            Worker Group {g.letter}: {g.name}
          </Text>
          <SourcesLine sources={g.sources} />
        </div>
        <span className={`chip ${managed ? 'chip--brand' : ''}`}>{managed ? 'Cribl-managed' : 'Customer-managed'}</span>
      </div>

      {managed ? (
        <>
          <div className="arch-calc-list">
            <CalcRow label="Peak (in + out)" formula="Σ source peaks" result={fmtGB(g.peakGB)} />
            <CalcRow
              label="Peak ingest"
              formula={`${gb(g.peakGB)} ÷ 3`}
              result={`${fmtGB(ingestGB)} (${ingestTB.toFixed(2)} TB)`}
              hint="Cribl.Cloud tiers assume a 1:2 ingest:egress ratio, so ingest ≈ (in + out) ÷ 3."
            />
            <CalcRow label="Ingest tier" formula={`ceil(${ingestTB.toFixed(2)})`} result={<b>~{g.cloudTierTBPerDay} TB/day</b>} tone={(g.cloudTierTBPerDay ?? 0) > SIZING_RULES.cloudGroupMaxTBPerDay ? 'bad' : 'ok'} />
          </div>
          <div className="arch-util-row">
            <span className="muted">Tier fill</span>
            <UtilizationBar pct={g.cloudTierTBPerDay ? (ingestTB / g.cloudTierTBPerDay) * 100 : 0} label={`Worker Group ${g.letter} tier fill`} />
          </div>
          <Callout tone="success">
            Cribl.Cloud provisions the Worker Nodes, scales them with load and keeps the group highly available, so there is no VM sizing, load balancer or disk planning for this group.
            {(g.cloudTierTBPerDay ?? 0) > SIZING_RULES.cloudGroupMaxTBPerDay && ` Above the ${SIZING_RULES.cloudGroupMaxTBPerDay} TB/day largest Cribl-managed tier: split the workload or talk to your Cribl account team.`}
          </Callout>
        </>
      ) : (
        <>
          <dl className="arch-profile">
            <div>
              <dt>Node profile</dt>
              <dd>{p.label}</dd>
            </div>
            <div>
              <dt>vCPU / reserved</dt>
              <dd>
                {p.vcpus} / {p.reservedVcpus} for OS + API
              </dd>
            </div>
            <div>
              <dt>Worker Processes</dt>
              <dd>
                {p.workerProcesses} per node ({p.vcpus} − {p.reservedVcpus})
              </dd>
            </div>
            <div>
              <dt>Throughput per vCPU</dt>
              <dd>{p.gbPerDayPerVcpu} GB/day (in + out)</dd>
            </div>
            <div>
              <dt>Capacity per node</dt>
              <dd>
                {p.workerProcesses} × {p.gbPerDayPerVcpu} = <b>{fmtNum(p.capacityGBPerDay)} GB/day</b>
              </dd>
            </div>
            <div>
              <dt>RAM</dt>
              <dd>
                {p.ramGB} GB ({p.workerProcesses} × {SIZING_RULES.heapGBPerWorkerProcess} GB heap + {SIZING_RULES.osRamGB} GB OS)
              </dd>
            </div>
            <div>
              <dt>Disk per node</dt>
              <dd>
                <HardDrive size="xs" /> {g.recommendedDiskPerNodeGB} GB
                {g.pqDiskPerNodeGB > 0 ? ` incl. ${g.pqDiskPerNodeGB} GB Persistent Queue` : ''}
              </dd>
            </div>
          </dl>

          <div className="arch-calc-list">
            <CalcRow label="Peak for this group" formula="Σ source peaks" result={fmtGB(g.peakGB)} />
            <CalcRow label="Nodes for capacity" formula={`ceil(${gb(g.peakGB)} ÷ ${fmtNum(p.capacityGBPerDay)}) = ceil(${ratio.toFixed(2)})`} result={<b>{g.nodesForCapacity}</b>} />
            {isProd ? (
              <CalcRow
                label="HA spare nodes"
                formula={`+ ceil(${g.nodesForCapacity} × ${SIZING_RULES.haSurvivableNodeLossPct * 100}%)`}
                result={`+${g.haSpareNodes}`}
                hint={`Survive ${SIZING_RULES.haSurvivableNodeLossPct * 100}% of Worker Nodes down (patching, upgrades, failure) while still carrying peak.`}
              />
            ) : (
              <CalcRow label="HA spare nodes" formula="POC mode" result="none" />
            )}
            {g.haFloorApplied && (
              <CalcRow
                label="Production minimum"
                formula={`max(${SIZING_RULES.minProductionNodesPerGroup}, ${g.nodesForCapacity + g.haSpareNodes})`}
                result={`raised to ${SIZING_RULES.minProductionNodesPerGroup}`}
                tone="raised"
                hint={`Cribl recommends at least ${SIZING_RULES.minProductionNodesPerGroup} Worker Nodes per production Worker Group.`}
              />
            )}
            <CalcRow label="Worker Nodes deployed" formula={`${g.nodes} × ${p.vcpus} vCPU`} result={<b>{`${g.nodes} nodes · ${fmtNum(g.totalVcpus)} vCPU · ${fmtNum(g.totalWorkerProcesses)} WP`}</b>} tone="ok" />
            <CalcRow label="Capacity" formula={`${g.nodes} × ${fmtNum(p.capacityGBPerDay)}`} result={fmtGB(g.capacityGB)} />
            <CalcRow
              label={g.haSpareNodes > 0 ? `With ${g.haSpareNodes} node${g.haSpareNodes === 1 ? '' : 's'} down` : 'Single-node capacity'}
              formula={`${survivors} × ${fmtNum(p.capacityGBPerDay)}`}
              result={`${fmtGB(g.capacityWithSpareDownGB)} ${survives ? '≥' : '<'} peak`}
              tone={survives ? 'ok' : 'bad'}
            />
            {g.pqDiskPerNodeGB > 0 && (
              <CalcRow
                label="PQ disk per node"
                formula={`PQ volume ÷ ${survivors} surviving nodes`}
                result={`${g.pqDiskPerNodeGB} GB`}
                hint={`Hourly volume of PQ-enabled Sources/Destinations × ${design.drivers.pqOutageHours} h outage, spread across the nodes still running with HA spares down.`}
              />
            )}
          </div>
          <div className="arch-util-row">
            <span className="muted">Peak utilization</span>
            <UtilizationBar pct={g.peakUtilizationPct} label={`Worker Group ${g.letter} peak utilization`} />
          </div>
        </>
      )}
    </div>
  );
}

export function SizingSection({ design, result }: { design: Design; result: ArchitectureResult }) {
  const groups = result.architecture.workerGroups;
  return (
    <Section
      title="Sizing & reasoning"
      icon={<Gauge size="sm" />}
      description={
        <>
          Every number below is derived from your inputs using{' '}
          <Link href={SIZING_RULES.source} target="_blank" rel="noopener noreferrer">
            Cribl sizing guidance
          </Link>
          . Open the <CircleInfo size="xs" aria-label="info" /> on each step for the formula with your numbers.
        </>
      }
    >
      <div className="stack">
        <Text as="h3" variant="heading-xs">
          Peak throughput, step by step
        </Text>
        <CalculationLadder design={design} result={result} />
      </div>
      <div className="stack">
        <Text as="h3" variant="heading-xs">
          Per-source throughput
        </Text>
        <ThroughputTable design={design} result={result} />
      </div>
      <div className="stack">
        <Text as="h3" variant="heading-xs">
          Worker Group sizing
        </Text>
        <div className={groups.length > 1 ? 'arch-group-grid' : 'stack'}>
          {groups.map((g) => (
            <GroupSizingCard key={g.id} group={g} design={design} />
          ))}
        </div>
      </div>
    </Section>
  );
}
