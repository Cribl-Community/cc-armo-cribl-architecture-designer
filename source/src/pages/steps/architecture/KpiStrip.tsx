import type { ArchitectureResult, Design } from '../../../model/types';
import { SIZING_RULES } from '../../../model/catalog';
import { StatTile, fmtGB, fmtNum } from '../../../ui/layout';
import { mult, plural } from './format';

export function KpiStrip({ design, result }: { design: Design; result: ArchitectureResult }) {
  const m = result.metrics;
  const arch = result.architecture;
  const groups = arch.workerGroups;
  const managed = groups.length > 0 && groups.every((g) => g.managedBy === 'cribl');
  const d = design.drivers;
  const complexity = m.totalThroughputGB > 0 ? m.weightedThroughputGB / m.totalThroughputGB : 1;
  const tierTB = groups.reduce((a, g) => a + (g.cloudTierTBPerDay ?? 0), 0);
  const haExtra = m.totalNodes - m.nodesForCapacity;
  const isProd = design.mode === 'production';

  const nodesHint = isProd
    ? `Nodes for capacity = Σ ceil(peak ÷ per-node capacity) for each Worker Group. Deployed adds the per-group HA rule: +${SIZING_RULES.haSurvivableNodeLossPct * 100}% spare Worker Nodes (so the group still carries peak with ${SIZING_RULES.haSurvivableNodeLossPct * 100}% of nodes down for patching or failure), and at least ${SIZING_RULES.minProductionNodesPerGroup} Worker Nodes per production Worker Group. The difference is intentional headroom, not a sizing mismatch.`
    : 'POC mode: nodes for capacity only, without HA spares or the 3-node production minimum.';

  return (
    <div className="stat-grid">
      <StatTile label="Total inbound" value={fmtGB(m.totalInboundGB)} sub={plural(design.sources.length, 'source group')} hint="Sum of all configured source volumes before any processing." />
      <StatTile
        label="Outbound after filtering"
        value={fmtGB(m.totalOutboundGB)}
        sub={`${mult(m.effectiveFanout)}× fan-out · ${d.filteringDropPercent}% dropped`}
        hint="Σ(volume × destinations) × (1 − drop%). Data sent to several Destinations is counted once per Destination."
      />
      <StatTile
        label="Peak throughput"
        tone="accent"
        value={fmtGB(m.peakThroughputGB)}
        sub={`(in + out) × ${mult(complexity)} complexity × ${mult(d.peakFactor)} peak`}
        hint="The number every Worker Group is sized against: inbound + outbound, with processing-complexity headroom and the peak factor applied per source."
      />
      {managed ? (
        <StatTile label="Cribl.Cloud tier" tone="success" value={`~${fmtNum(tierTB)} TB/day`} sub={`ingest across ${plural(groups.length, 'Cribl-managed group')}`} hint="Cribl.Cloud provisions, scales and keeps Cribl-managed Worker Groups highly available. Tier ≈ peak (in+out) ÷ 3, at Cribl.Cloud's 1:2 ingest:egress sizing assumption." />
      ) : (
        <StatTile
          label="Worker Nodes"
          tone="success"
          value={fmtNum(m.totalNodes)}
          sub={
            <>
              {m.nodesForCapacity} for capacity → {m.totalNodes} deployed{isProd && haExtra > 0 ? ` (+${haExtra} HA)` : ''}
            </>
          }
          hint={nodesHint}
        />
      )}
      <StatTile label="Worker Groups" value={groups.length} sub={groups.map((g) => g.letter).join(' · ') + (d.workerGroupStrategy === 'multiple' ? ' · by category' : ' · single group')} />
      {managed ? (
        <StatTile label="vCPUs / Worker Processes" value="Managed" sub="Cribl.Cloud sizes Worker Processes" />
      ) : (
        <StatTile
          label="vCPUs / Worker Processes"
          value={`${fmtNum(m.totalVcpus)} / ${fmtNum(m.totalWorkerProcesses)}`}
          sub={`${arch.profile.label} · ${m.vcpusRequired} needed at peak`}
          hint={`One Worker Process per usable vCPU (vCPUs − ${arch.profile.reservedVcpus} reserved for OS/API per node). At peak, ${fmtNum(m.peakThroughputGB)} ÷ ${arch.profile.gbPerDayPerVcpu} GB/day per vCPU = ${m.vcpusRequired} Worker Processes busy.`}
        />
      )}
      <StatTile
        label="Edge Nodes"
        value={fmtNum(m.totalEdgeNodes)}
        sub={arch.useEdge ? plural(arch.edgeFleets.length, 'Edge Fleet') : 'No endpoint sources'}
        hint="Cribl Edge runs 1:1 on endpoint hosts (Windows, Linux, Kubernetes, application hosts), grouped into one Fleet per platform."
      />
    </div>
  );
}
