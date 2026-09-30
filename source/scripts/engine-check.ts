import { calculateArchitecture } from '../src/engine/architecture';
import { generateDeploymentPlan, scheduleTimeline } from '../src/engine/deploymentPlan';
import { sampleDesign } from '../src/model/factory';

for (const dm of ['hybrid', 'cloud', 'on-prem'] as const) {
  for (const strat of ['multiple', 'single'] as const) {
    for (const mode of ['production', 'poc'] as const) {
      const d = sampleDesign();
      d.mode = mode;
      d.drivers.deploymentModel = dm;
      d.drivers.workerGroupStrategy = strat;
      const r = calculateArchitecture(d);
      const p = generateDeploymentPlan(r, d);
      const t = scheduleTimeline(p, '2026-10-01', false);
      const m = r.metrics;
      console.log(`\n== ${mode} / ${dm} / ${strat}: in ${Math.round(m.totalInboundGB)} out ${Math.round(m.totalOutboundGB)} weighted ${Math.round(m.weightedThroughputGB)} peak ${Math.round(m.peakThroughputGB)} | nodes ${m.nodesForCapacity}->${m.totalNodes}`);
      for (const g of r.architecture.workerGroups) {
        console.log(`   ${g.letter} ${g.name} [${g.managedBy}] peak ${Math.round(g.peakGB)} N=${g.nodesForCapacity} spare=${g.haSpareNodes} nodes=${g.nodes} floor=${g.haFloorApplied} util=${g.peakUtilizationPct.toFixed(0)}% pq/node=${g.pqDiskPerNodeGB} disk=${g.recommendedDiskPerNodeGB} LB=${g.usesLoadBalancer} tier=${g.cloudTierTBPerDay}`);
      }
      const unscheduled = p.categories.length - t.scheduled.length;
      console.log(`   plan: ${p.categories.length} cats, scheduled ${t.scheduled.length}${unscheduled ? ` (!! ${unscheduled} DROPPED)` : ''}, ${t.totalDays} days, critical: ${t.scheduled.filter((s) => s.critical).map((s) => s.categoryId).join('>')}`);
      console.log(`   warnings: ${r.warnings.map((w) => w.title).join(' | ')}`);
    }
  }
}
