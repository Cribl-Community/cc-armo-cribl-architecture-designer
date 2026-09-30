import { Label, NumberField, Text, TextField, ToggleButtonGroup, type Key } from '@capra/core';
import { Flag } from '@capra/icons';
import { DEFAULT_HOURS_PER_DAY, PHASE_LABELS, PHASE_ORDER } from '../../../engine/deploymentPlan';
import type { PlanState } from '../../../model/types';
import { InfoTip } from '../../../ui/layout';
import { ISO_DATE, PHASE_TONE, fmtLong, fmtShort, fmtWeekday, type Schedule } from './planUtils';

const DAY_MS = 86_400_000;

interface Props {
  schedule: Schedule;
  planState: PlanState;
  onChange: (patch: Partial<PlanState>) => void;
}

export function Timeline({ schedule, planState, onChange }: Props) {
  const { totalDays, scheduled, start, end } = schedule;
  const pos = (day: number) => (totalDays > 0 ? (day / totalDays) * 100 : 0);

  const weeks: { day: number; label: string }[] = [];
  for (let d = 0; d <= totalDays; d += 7) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    weeks.push({ day: d, label: fmtShort(date) });
  }

  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);
  const todayDay = Math.round((todayMid.getTime() - start.getTime()) / DAY_MS);
  const showToday = todayDay > 0 && todayDay < totalDays;
  const phasesPresent = PHASE_ORDER.filter((p) => scheduled.some((s) => s.phase === p));
  const criticalCount = scheduled.filter((s) => s.critical).length;

  return (
    <>
      <div className="timeline-controls">
        <div className="timeline-controls__date">
          <TextField
            type="date"
            label="Project start date"
            value={planState.startDate}
            onChange={(v) => {
              if (ISO_DATE.test(v)) onChange({ startDate: v });
            }}
          />
        </div>
        <div className="timeline-controls__group">
          <Label
            id="plan-duration-label"
            trailingSlot={<InfoTip text="For categories without entered effort, Optimistic uses the minimum default estimate and Conservative the maximum. Categories with effort entered always use the days calculated from it. Categories run in parallel wherever their dependencies allow." />}
          >
            Duration estimate
          </Label>
          <ToggleButtonGroup
            aria-labelledby="plan-duration-label"
            size="md"
            disallowEmptySelection
            selectedKeys={[planState.optimistic ? 'optimistic' : 'conservative']}
            onSelectionChange={(keys: Set<Key>) => {
              const k = [...keys][0];
              if (k) onChange({ optimistic: k === 'optimistic' });
            }}
            items={[
              { key: 'optimistic', text: 'Optimistic' },
              { key: 'conservative', text: 'Conservative' },
            ]}
          />
        </div>
        <div className="timeline-controls__hours">
          <NumberField
            label="Working hours per day"
            min={1}
            max={24}
            step={0.5}
            value={planState.hoursPerDay && planState.hoursPerDay > 0 ? planState.hoursPerDay : DEFAULT_HOURS_PER_DAY}
            onChange={(v) => {
              if (Number.isFinite(v) && v >= 1 && v <= 24) onChange({ hoursPerDay: v });
            }}
          />
        </div>
      </div>

      <div className="timeline-span">
        <div>
          <Text as="div" variant="body-xs-semibold" color="secondary">
            PROJECT START
          </Text>
          <Text as="div" variant="heading-sm">
            {fmtLong(start)}
          </Text>
        </div>
        <div className="timeline-span__line" aria-hidden="true">
          <span className="timeline-span__days">
            <Text variant="body-sm-semibold">
              {totalDays} days · {criticalCount} on critical path
            </Text>
          </span>
        </div>
        <div className="timeline-span__end">
          <Text as="div" variant="body-xs-semibold" color="secondary">
            ESTIMATED COMPLETION
          </Text>
          <Text as="div" variant="heading-sm">
            {fmtLong(end)}
          </Text>
        </div>
      </div>

      <div className="gantt">
        <div className="gantt__inner" role="group" aria-label="Deployment schedule Gantt chart">
          <div className="gantt__row" aria-hidden="true">
            <div />
            <div className="gantt__axis">
              {weeks.map((w, i) => (
                <span key={w.day} className={`gantt__week ${i > 0 && pos(w.day) > 94 ? 'gantt__week--last' : ''}`} style={{ left: `${pos(w.day)}%` }}>
                  {i === 0 ? w.label : `Wk ${i + 1} · ${w.label}`}
                </span>
              ))}
            </div>
          </div>

          {scheduled.map((cat) => {
            const left = pos(cat.startDay);
            const w = pos(cat.duration);
            const parties = planState.categoryParties[cat.categoryId] ?? [];
            const tip = `${cat.title}: ${fmtWeekday(cat.startDate)} → ${fmtWeekday(cat.endDate)} (${cat.duration} day${cat.duration === 1 ? '' : 's'})${cat.critical ? ' · critical path' : ''}`;
            return (
              <div key={cat.categoryId} className="gantt__row">
                <div className="gantt__label">
                  <span className="gantt__label-title">
                    <Text variant="body-sm-semibold">{cat.title}</Text>
                    {cat.critical && (
                      <span className="critical-flag" title="On the critical path">
                        <Flag size="xs" />
                      </span>
                    )}
                  </span>
                  {planState.showParties && parties.length > 0 && <span className="gantt__parties">{parties.join(', ')}</span>}
                </div>
                <div className="gantt__track">
                  {weeks.map((wk) => (
                    <span key={wk.day} className="gantt__grid" style={{ left: `${pos(wk.day)}%` }} />
                  ))}
                  {showToday && <span className="gantt__today" style={{ left: `${pos(todayDay)}%` }} />}
                  <div
                    className={`gantt__bar phase-solid--${PHASE_TONE[cat.phase]} ${cat.critical ? 'gantt__bar--critical' : ''}`}
                    style={{ left: `${left}%`, width: `${Math.max(w, 0.8)}%` }}
                    title={tip}
                    aria-label={tip}
                    tabIndex={0}
                  >
                    {w > 5 && `${cat.duration}d`}
                  </div>
                  <span className="gantt__dates" style={{ left: `${left}%` }}>
                    {fmtShort(cat.startDate)}
                  </span>
                  {cat.duration > 1 && (
                    <span className="gantt__dates gantt__dates--end" style={{ left: `${left + w}%` }}>
                      {fmtShort(cat.endDate)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          <div className="gantt__legend">
            {phasesPresent.map((p) => (
              <span key={p} className="gantt__legend-item">
                <span className={`gantt__swatch phase-solid--${PHASE_TONE[p]}`} />
                <Text variant="body-xs-normal" color="secondary">
                  {PHASE_LABELS[p]}
                </Text>
              </span>
            ))}
            <span className="gantt__legend-item">
              <span className="gantt__swatch gantt__swatch--critical" />
              <Text variant="body-xs-normal" color="secondary">
                Critical path
              </Text>
            </span>
            {showToday && (
              <span className="gantt__legend-item">
                <span className="gantt__swatch gantt__swatch--today" />
                <Text variant="body-xs-normal" color="secondary">
                  Today
                </Text>
              </span>
            )}
            <span className="gantt__legend-hint no-print">
              <Text variant="body-xs-normal" color="secondary">
                Hover a bar for dates
              </Text>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
