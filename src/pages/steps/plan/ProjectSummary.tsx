import { Fragment } from 'react';
import { Text } from '@capra/core';
import { ArrowRight } from '@capra/icons';
import type { DeploymentPlan } from '../../../engine/deploymentPlan';
import { Callout, StatTile, fmtGB, fmtNum } from '../../../ui/layout';
import { categoriesByPhase, fmtLong, pct, type Schedule } from './planUtils';

export function ProgressBar({ value, size = 'md', label }: { value: number; size?: 'md' | 'lg'; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`plan-progress ${size === 'lg' ? 'plan-progress--lg' : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
      <div className={`plan-progress__fill ${v === 100 ? 'plan-progress__fill--complete' : ''}`} style={{ width: `${v}%` }} />
    </div>
  );
}

export function ProjectSummary({ plan, schedule, done, optimistic, isProduction }: { plan: DeploymentPlan; schedule: Schedule; done: number; optimistic: boolean; isProduction: boolean }) {
  const ps = plan.projectSummary;
  const phases = categoriesByPhase(plan);
  const spare = ps.totalNodes - ps.nodesForCapacity;
  const progress = pct(done, plan.totalSteps);
  const saved = plan.totalEstimatedDays[optimistic ? 'min' : 'max'] - schedule.totalDays;

  return (
    <>
      <div className="stat-grid">
        <StatTile label="Deployment mode" value={ps.mode} tone="accent" />
        <StatTile label="Deployment model" value={ps.deploymentModel} />
        <StatTile label="Total inbound" value={fmtGB(ps.totalInboundGB)} sub={`${fmtGB(ps.totalOutboundGB)} outbound`} />
        <StatTile
          label="Worker Nodes"
          value={
            <>
              {fmtNum(ps.nodesForCapacity)} → {fmtNum(ps.totalNodes)}
            </>
          }
          sub={`${fmtNum(ps.nodesForCapacity)} for capacity → ${fmtNum(ps.totalNodes)} deployed (HA${spare > 0 ? `, +${spare} spare` : ''})`}
          hint={`${ps.nodesForCapacity} node(s) cover the raw throughput. The extra ${Math.max(0, spare)} are intentional high availability: about 20% spare capacity per Worker Group${isProduction ? ' and at least 3 nodes per production Worker Group' : ''}, so each group keeps up with peak load while nodes are down or being upgraded.`}
        />
        <StatTile label="Worker Groups" value={ps.workerGroups} />
        <StatTile label="Edge Nodes" value={fmtNum(ps.totalEdgeNodes)} sub={ps.totalEdgeNodes > 0 ? 'managed in Edge Fleets' : 'no endpoint sources'} />
        <StatTile label="Sources / Destinations" value={`${ps.sourceCount} / ${ps.destinationCount}`} />
      </div>

      <div className="plan-progress-row">
        <div className="row row--between">
          <Text variant="body-sm-semibold">Overall progress</Text>
          <Text variant="body-sm-normal" color="secondary">
            {done}/{plan.totalSteps} steps ({progress}%)
          </Text>
        </div>
        <ProgressBar value={progress} size="lg" label="Overall deployment progress" />
      </div>

      <div className="phase-flow" aria-label="Deployment phases">
        {phases.map((g, idx) => (
          <Fragment key={g.phase}>
            <div className={`phase-flow__chip phase-solid--${g.tone}`}>
              <span className="phase-flow__step">Phase {idx + 1}</span>
              <span className="phase-flow__label">{g.label}</span>
              <span className="phase-flow__meta">
                {g.categories.length} categor{g.categories.length === 1 ? 'y' : 'ies'} · {g.categories.reduce((a, c) => a + c.steps.length, 0)} steps
              </span>
            </div>
            {idx < phases.length - 1 && (
              <span className="phase-flow__arrow" aria-hidden="true">
                <ArrowRight size="sm" />
              </span>
            )}
          </Fragment>
        ))}
      </div>

      <div className="plan-estimates">
        <Callout tone="info" title={`Sequential estimate: ${plan.totalEstimatedDays.min}-${plan.totalEstimatedDays.max} days`}>
          Sum of every category run one after another. Parallel execution of independent categories can reduce this — categories with no shared dependencies can run simultaneously.
        </Callout>
        <Callout tone="success" title={`Scheduled (parallel): ${schedule.totalDays} days`}>
          {fmtLong(schedule.start)} → {fmtLong(schedule.end)} using {optimistic ? 'optimistic' : 'conservative'} durations
          {saved > 0 ? `, ${saved} day${saved === 1 ? '' : 's'} shorter than running everything in sequence` : ''}.
        </Callout>
      </div>
    </>
  );
}
