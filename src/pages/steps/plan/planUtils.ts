import type { TagColor } from '@capra/core';
import { PHASE_LABELS, PHASE_ORDER, type DeploymentPlan, type Phase, type PlanCategory, type scheduleTimeline } from '../../../engine/deploymentPlan';
import type { PlanState } from '../../../model/types';

export type Schedule = ReturnType<typeof scheduleTimeline>;

/** Phase → Capra token family. Used as a CSS modifier (`--neutral`, `--info`, …). */
export type PhaseTone = 'neutral' | 'info' | 'brand' | 'highlight' | 'success';
export const PHASE_TONE: Record<Phase, PhaseTone> = {
  PREP: 'neutral',
  DEPLOY: 'info',
  CONFIGURE: 'brand',
  VALIDATE: 'highlight',
  GOLIVE: 'success',
};

/** Party colors: Capra categorical scales (they flip automatically in dark mode). */
export const PARTY_COLORS = ['violet', 'amber', 'jade', 'ruby', 'cyan', 'orange', 'indigo', 'pink'] as const satisfies readonly TagColor[];
export type PartyColor = (typeof PARTY_COLORS)[number];
export const partyColor = (parties: string[], name: string): PartyColor => {
  const idx = parties.indexOf(name);
  return PARTY_COLORS[(idx >= 0 ? idx : 0) % PARTY_COLORS.length];
};

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Local-time yyyy-mm-dd (toISOString would shift the date across UTC). */
export function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function safeStartDate(value: string): string {
  if (ISO_DATE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())) return value;
  return toIsoDate(new Date());
}

export const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const fmtLong = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
export const fmtWeekday = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

export const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);

export function categoryDone(cat: PlanCategory, checked: PlanState['checkedSteps']) {
  return cat.steps.filter((s) => checked[s.id]).length;
}

/** Only count checks for steps that still exist in the (re-generated) plan. */
export function overallDone(plan: DeploymentPlan, checked: PlanState['checkedSteps']) {
  return plan.categories.reduce((a, c) => a + categoryDone(c, checked), 0);
}

export function categoriesByPhase(plan: DeploymentPlan) {
  return PHASE_ORDER.map((phase) => ({
    phase,
    label: PHASE_LABELS[phase],
    tone: PHASE_TONE[phase],
    categories: plan.categories.filter((c) => c.phase === phase),
  })).filter((g) => g.categories.length > 0);
}

export function titleLookup(plan: DeploymentPlan) {
  const map = new Map(plan.categories.map((c) => [c.categoryId, c.title]));
  return (id: string) => map.get(id) ?? id;
}

export function fileSlug(name: string) {
  return (name || 'cribl-design').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'cribl-design';
}

/** Blob + <a download>: works inside the Cribl sandboxed iframe. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
