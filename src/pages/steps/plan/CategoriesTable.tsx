import { Tag, Text } from '@capra/core';
import { Flag } from '@capra/icons';
import { PHASE_LABELS, type DeploymentPlan } from '../../../engine/deploymentPlan';
import type { PlanState } from '../../../model/types';
import { ProgressBar } from './ProjectSummary';
import { PHASE_TONE, categoryDone, fmtShort, partyColor, pct, titleLookup, type Schedule } from './planUtils';

export function PhaseBadge({ phase }: { phase: keyof typeof PHASE_LABELS }) {
  return <span className={`phase-badge phase-badge--${PHASE_TONE[phase]}`}>{PHASE_LABELS[phase]}</span>;
}

export function CategoriesTable({ plan, schedule, planState }: { plan: DeploymentPlan; schedule: Schedule; planState: PlanState }) {
  const title = titleLookup(plan);
  const schedById = new Map(schedule.scheduled.map((s) => [s.categoryId, s]));
  const { showParties, parties, categoryParties, checkedSteps } = planState;

  return (
    <div className="plan-table-wrap">
      <table className="data-table plan-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Category</th>
            <th>Phase</th>
            <th>Start</th>
            <th>End</th>
            <th>Days</th>
            <th>Steps</th>
            <th>Dependencies</th>
            {showParties && <th>Assigned to</th>}
            <th>Progress</th>
          </tr>
        </thead>
        <tbody>
          {plan.categories.map((cat, idx) => {
            const s = schedById.get(cat.categoryId);
            const done = categoryDone(cat, checkedSteps);
            const assigned = categoryParties[cat.categoryId] ?? [];
            return (
              <tr key={cat.categoryId} className={s?.critical ? 'plan-table__row--critical' : undefined}>
                <td className="plan-table__num">{idx + 1}</td>
                <td className="plan-table__title">
                  <span className="row">
                    {cat.title}
                    {s?.critical && (
                      <span className="critical-flag" title="On the critical path">
                        <Flag size="xs" />
                      </span>
                    )}
                  </span>
                </td>
                <td>
                  <PhaseBadge phase={cat.phase} />
                </td>
                <td className="plan-table__nowrap">{s ? fmtShort(s.startDate) : '—'}</td>
                <td className="plan-table__nowrap">{s ? fmtShort(s.endDate) : '—'}</td>
                <td className="plan-table__nowrap">{s ? s.duration : `${cat.estimatedDays.min}-${cat.estimatedDays.max}`}</td>
                <td className="plan-table__nowrap">
                  {done}/{cat.steps.length}
                </td>
                <td>
                  <div className="plan-table__chips">
                    {cat.dependencies.length > 0 ? (
                      cat.dependencies.map((d) => (
                        <span key={d} className="chip">
                          {title(d)}
                        </span>
                      ))
                    ) : (
                      <Text variant="body-xs-normal" color="secondary">
                        None
                      </Text>
                    )}
                  </div>
                </td>
                {showParties && (
                  <td>
                    <div className="plan-table__chips">
                      {assigned.length > 0 ? (
                        assigned.map((p) => (
                          <Tag key={p} size="sm" color={partyColor(parties, p)}>
                            {p}
                          </Tag>
                        ))
                      ) : (
                        <Text variant="body-xs-normal" color="secondary">
                          —
                        </Text>
                      )}
                    </div>
                  </td>
                )}
                <td className="plan-table__progress">
                  <ProgressBar value={pct(done, cat.steps.length)} label={`${cat.title} progress`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
