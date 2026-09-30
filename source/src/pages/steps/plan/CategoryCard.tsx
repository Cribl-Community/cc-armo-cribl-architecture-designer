import { memo, useId, useState } from 'react';
import { Button, Checkbox, NumberField, Text, ToggleButtonGroup, type Key } from '@capra/core';
import { ChevronDown, ChevronRight, ClockOutlined, Flag, UserOutlined, UsersOutlined } from '@capra/icons';
import { DEFAULT_HOURS_PER_DAY, effortHours, type PlanCategory, type PlanStep } from '../../../engine/deploymentPlan';
import type { EffortUnit, PlanState, StepEffort } from '../../../model/types';
import { PhaseBadge } from './CategoriesTable';
import { ProgressBar } from './ProjectSummary';
import { PHASE_TONE, categoryDone, fmtShort, partyColor, pct, type Schedule } from './planUtils';

const fmtHours = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${Number.isInteger(h) ? h : h.toFixed(h < 10 ? 2 : 1).replace(/\.?0+$/, '')} h`);

function EffortInput({ step, effort, onEffort }: { step: PlanStep; effort: StepEffort | undefined; onEffort: (id: string, e: StepEffort | null) => void }) {
  const unit: EffortUnit = effort?.unit ?? 'h';
  const hasValue = !!effort && effort.value > 0;
  const setUnit = (next: EffortUnit) => {
    if (next === unit) return;
    const value = effort?.value ?? 0;
    const converted = next === 'min' ? Math.round(value * 60) : Math.round((value / 60) * 100) / 100;
    onEffort(step.id, { value: converted, unit: next });
  };
  return (
    <div className="plan-effort no-print-controls" role="group" aria-label={`Effort for ${step.title}`}>
      <span className="plan-effort__label">Effort</span>
      <div className="plan-effort__field">
        <NumberField
          aria-label={`Effort for ${step.title} in ${unit === 'h' ? 'hours' : 'minutes'}`}
          size="sm"
          min={0}
          step={unit === 'h' ? 0.5 : 5}
          value={hasValue ? effort!.value : NaN}
          placeholder="—"
          onChange={(v) => onEffort(step.id, Number.isFinite(v) && v > 0 ? { value: v, unit } : unit === 'h' ? null : { value: 0, unit })}
        />
      </div>
      <ToggleButtonGroup
        aria-label={`Effort unit for ${step.title}`}
        size="sm"
        disallowEmptySelection
        selectedKeys={[unit]}
        onSelectionChange={(keys: Set<Key>) => {
          const k = [...keys][0];
          if (k === 'h' || k === 'min') setUnit(k);
        }}
        items={[
          { key: 'h', text: 'h' },
          { key: 'min', text: 'min' },
        ]}
      />
      {hasValue && unit === 'min' && effort!.value >= 60 && <span className="plan-effort__hint">= {fmtHours(effortHours(effort))}</span>}
    </div>
  );
}

const StepItem = memo(function StepItem({
  step,
  index,
  prefix,
  checked,
  onToggle,
  effort,
  onEffort,
}: {
  step: PlanStep;
  index: number;
  prefix: string;
  checked: boolean;
  onToggle: (id: string) => void;
  effort: StepEffort | undefined;
  onEffort: (id: string, e: StepEffort | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const techId = useId();
  return (
    <div className={`plan-step ${checked ? 'plan-step--done' : ''}`}>
      <div className="plan-step__check">
        <Checkbox checked={checked} onChange={() => onToggle(step.id)} aria-label={`Mark "${step.title}" as ${checked ? 'not done' : 'done'}`} />
      </div>
      <div className="plan-step__content">
        <div className="plan-step__title-row">
          <span className="plan-step__index mono">
            {prefix}.{index + 1}
          </span>
          <span className="plan-step__title">
            <Text variant="body-md-semibold">{step.title}</Text>
          </span>
          {step.owner && (
            <span className="plan-step__owner">
              <UserOutlined size="xs" />
              {step.owner}
            </span>
          )}
        </div>
        <Text as="p" variant="body-sm-normal" color="secondary">
          {step.detail}
        </Text>
        <EffortInput step={step} effort={effort} onEffort={onEffort} />
        {step.technical && (
          <>
            <button type="button" className="plan-step__tech-toggle" aria-expanded={open} aria-controls={techId} onClick={() => setOpen((o) => !o)}>
              {open ? <ChevronDown size="xs" /> : <ChevronRight size="xs" />}
              {open ? 'Hide' : 'Show'} technical details
            </button>
            <pre id={techId} className={`plan-step__tech mono ${open ? '' : 'plan-step__tech--collapsed'}`}>
              {step.technical}
            </pre>
          </>
        )}
      </div>
    </div>
  );
});

interface Props {
  category: PlanCategory;
  number: number;
  schedule: Schedule['scheduled'][number] | undefined;
  planState: PlanState;
  dependencyTitle: (id: string) => string;
  collapsed: boolean;
  onToggleCollapsed: (id: string) => void;
  onToggleStep: (stepId: string) => void;
  onToggleParty: (categoryId: string, party: string) => void;
  onEffort: (stepId: string, effort: StepEffort | null) => void;
  onResetEffort: (categoryId: string) => void;
}

export function CategoryCard({ category, number, schedule, planState, dependencyTitle, collapsed, onToggleCollapsed, onToggleStep, onToggleParty, onEffort, onResetEffort }: Props) {
  const { checkedSteps, showParties, parties, categoryParties } = planState;
  const stepEffort = planState.stepEffort ?? {};
  const hoursPerDay = planState.hoursPerDay && planState.hoursPerDay > 0 ? planState.hoursPerDay : DEFAULT_HOURS_PER_DAY;
  const effort = category.effort;
  const days = category.estimatedDays;
  const dayText = days.min === days.max ? `${days.min} day${days.min === 1 ? '' : 's'}` : `${days.min}-${days.max} days`;
  const bodyId = useId();
  const done = categoryDone(category, checkedSteps);
  const progress = pct(done, category.steps.length);
  const assigned = categoryParties[category.categoryId] ?? [];
  const tone = PHASE_TONE[category.phase];

  return (
    <article className={`plan-card ${progress === 100 ? 'plan-card--complete' : ''}`} aria-label={category.title}>
      <div className={`plan-card__accent phase-solid--${tone}`} aria-hidden="true" />
      <div className="plan-card__main">
        <div className="plan-card__head">
          <button type="button" className="plan-card__toggle" aria-expanded={!collapsed} aria-controls={bodyId} onClick={() => onToggleCollapsed(category.categoryId)}>
            <span className="plan-card__title-row">
              <span className={`plan-card__chevron ${collapsed ? '' : 'plan-card__chevron--open'}`}>
                <ChevronRight size="sm" />
              </span>
              <Text variant="heading-xs">{`${number}. ${category.title}`}</Text>
              <PhaseBadge phase={category.phase} />
              <span className={`chip ${effort ? 'chip--brand' : ''}`}>
                <ClockOutlined size="xs" />
                {dayText}
                {effort ? ` · ${fmtHours(effort.hours)}` : ''}
              </span>
              {schedule && (
                <Text variant="body-xs-normal" color="secondary">
                  {fmtShort(schedule.startDate)} → {fmtShort(schedule.endDate)}
                </Text>
              )}
              {schedule?.critical && (
                <span className="chip chip--danger">
                  <Flag size="xs" />
                  Critical path
                </span>
              )}
            </span>
            <span className="plan-card__stats">
              <Text variant="body-sm-normal" color={progress === 100 ? 'success' : 'secondary'}>
                {done}/{category.steps.length} steps
              </Text>
              <ProgressBar value={progress} label={`${category.title} progress`} />
            </span>
          </button>

          <div className="plan-card__meta">
            <Text as="p" variant="body-sm-normal" color="secondary">
              {category.summary}
            </Text>
          </div>
          <div className="plan-card__meta plan-card__effort">
            {effort ? (
              <>
                <Text variant="body-xs-semibold">
                  {`Effort: ${fmtHours(effort.hours)} ÷ ${hoursPerDay} h/day = ${effort.days} day${effort.days === 1 ? '' : 's'}`}
                </Text>
                <Text variant="body-xs-normal" color="secondary">
                  {`${effort.stepsWithEffort} of ${category.steps.length} steps estimated · default was ${effort.defaultDays.min === effort.defaultDays.max ? effort.defaultDays.min : `${effort.defaultDays.min}-${effort.defaultDays.max}`} days`}
                </Text>
                <span className="no-print">
                  <Button variant="tertiary" size="sm" onClick={() => onResetEffort(category.categoryId)}>
                    Reset to default estimate
                  </Button>
                </span>
              </>
            ) : (
              <Text variant="body-xs-normal" color="secondary">
                Default estimate. Enter effort on the steps below (hours or minutes) to calculate this category's days.
              </Text>
            )}
          </div>
          {category.dependencies.length > 0 && (
            <div className="plan-card__meta">
              <Text variant="body-xs-semibold" color="secondary">
                Depends on:
              </Text>
              {category.dependencies.map((d) => (
                <span key={d} className="chip">
                  {dependencyTitle(d)}
                </span>
              ))}
            </div>
          )}
          {showParties && (
            <div className="plan-card__meta" role="group" aria-label={`Assign parties to ${category.title}`}>
              <Text variant="body-xs-semibold" color="secondary">
                <span className="row">
                  <UsersOutlined size="xs" /> Assigned:
                </span>
              </Text>
              {parties.map((p) => {
                const on = assigned.includes(p);
                return (
                  <button key={p} type="button" aria-pressed={on} className={`party-toggle ${on ? `party--${partyColor(parties, p)}` : ''}`} onClick={() => onToggleParty(category.categoryId, p)}>
                    {p}
                  </button>
                );
              })}
              {parties.length === 0 && (
                <Text variant="body-xs-normal" color="secondary">
                  No parties defined yet
                </Text>
              )}
            </div>
          )}
        </div>

        <div id={bodyId} className={`plan-card__body ${collapsed ? 'plan-card__body--collapsed' : ''}`}>
          {category.steps.map((step, idx) => (
            <StepItem key={step.id} step={step} index={idx} prefix={String(number)} checked={!!checkedSteps[step.id]} onToggle={onToggleStep} effort={stepEffort[step.id]} onEffort={onEffort} />
          ))}
        </div>
      </div>
    </article>
  );
}
