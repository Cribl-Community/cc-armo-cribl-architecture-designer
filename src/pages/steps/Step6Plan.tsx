import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Switch, Text } from '@capra/core';
import { CalendarOutlined, CheckOutlined, CollapseAllOutlined, CopyOutlined, Download, ExpandAllOutlined, FileTextOutlined, ListOrdered, Print, RocketLaunch, TableOutlined, UsersOutlined } from '@capra/icons';
import { scheduleTimeline } from '../../engine/deploymentPlan';
import type { PlanState, StepEffort } from '../../model/types';
import { useDesign, useStore } from '../../state/DesignStore';
import { PageHeader, Section, WizardFooter } from '../../ui/layout';
import { useStepNav } from '../../ui/useStepNav';
import { CategoriesTable } from './plan/CategoriesTable';
import { CategoryCard } from './plan/CategoryCard';
import { buildPlanMarkdown } from './plan/exportMarkdown';
import { downloadPlanPdf } from './plan/exportPdf';
import { PartyPanel } from './plan/PartyPanel';
import { categoriesByPhase, downloadBlob, fileSlug, fmtLong, overallDone, safeStartDate, titleLookup } from './plan/planUtils';
import { ProjectSummary } from './plan/ProjectSummary';
import { Timeline } from './plan/Timeline';
import './plan/plan.css';

type Status = { tone: 'success' | 'warning' | 'danger'; text: string } | null;

export default function Step6Plan() {
  const { design, result, plan, setPlan } = useDesign();
  const { update } = useStore();
  const { back, next } = useStepNav(6);
  const startDate = safeStartDate(design.plan.startDate);
  // Normalised plan state (a corrupt/empty start date falls back to today).
  const planState = useMemo<PlanState>(() => ({ ...design.plan, startDate }), [design.plan, startDate]);

  const schedule = useMemo(() => scheduleTimeline(plan, startDate, planState.optimistic), [plan, startDate, planState.optimistic]);
  const done = overallDone(plan, planState.checkedSteps);
  const phases = useMemo(() => categoriesByPhase(plan), [plan]);
  const depTitle = useMemo(() => titleLookup(plan), [plan]);
  const schedById = useMemo(() => new Map(schedule.scheduled.map((s) => [s.categoryId, s])), [schedule]);

  // ── UI-only state (not persisted) ─────────────────────────
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const statusTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(statusTimer.current), []);

  const flash = (s: Status, ms: number) => {
    setStatus(s);
    window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => {
      setStatus(null);
      setCopied(false);
    }, ms);
  };

  // ── Persisted plan mutations (functional, so rapid clicks never drop an update) ──
  const updatePlan = useCallback((fn: (p: PlanState) => Partial<PlanState>) => update((d) => ({ ...d, plan: { ...d.plan, ...fn(d.plan) } })), [update]);

  const toggleStep = useCallback((id: string) => updatePlan((p) => ({ checkedSteps: { ...p.checkedSteps, [id]: !p.checkedSteps[id] } })), [updatePlan]);

  const toggleParty = useCallback(
    (categoryId: string, party: string) =>
      updatePlan((p) => {
        const current = p.categoryParties[categoryId] ?? [];
        const nextList = current.includes(party) ? current.filter((x) => x !== party) : [...current, party];
        return { categoryParties: { ...p.categoryParties, [categoryId]: nextList } };
      }),
    [updatePlan],
  );

  const setEffort = useCallback(
    (stepId: string, effort: StepEffort | null) =>
      updatePlan((p) => {
        const nextEffort = { ...(p.stepEffort ?? {}) };
        if (effort) nextEffort[stepId] = effort;
        else delete nextEffort[stepId];
        return { stepEffort: nextEffort };
      }),
    [updatePlan],
  );

  const resetEffort = useCallback(
    (categoryId: string) => {
      const stepIds = new Set(plan.categories.find((c) => c.categoryId === categoryId)?.steps.map((s) => s.id) ?? []);
      updatePlan((p) => ({ stepEffort: Object.fromEntries(Object.entries(p.stepEffort ?? {}).filter(([id]) => !stepIds.has(id))) }));
    },
    [plan, updatePlan],
  );

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
  }, []);

  // ── Exports ───────────────────────────────────────────────
  const exportDesign = { ...design, plan: planState };
  const mdFilename = `${fileSlug(design.name)}-deployment-plan.md`;
  const downloadMarkdown = (md: string) => downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), mdFilename);

  const copyMarkdown = () => {
    const md = buildPlanMarkdown(plan, schedule, exportDesign);
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(md))
      .then(() => {
        setCopied(true);
        flash({ tone: 'success', text: 'Markdown copied to clipboard.' }, 2500);
      })
      .catch(() => {
        // The Cribl sandbox can deny clipboard access: fall back to a file download.
        downloadMarkdown(md);
        flash({ tone: 'warning', text: `Clipboard access is blocked here, so the plan was downloaded as ${mdFilename} instead.` }, 6000);
      });
  };

  const downloadPdf = () => {
    setPdfBusy(true);
    downloadPlanPdf({ design: exportDesign, result, plan, schedule })
      .then(() => flash({ tone: 'success', text: 'PDF downloaded.' }, 2500))
      .catch((e: unknown) => flash({ tone: 'danger', text: `Could not create the PDF: ${e instanceof Error ? e.message : 'unknown error'}` }, 8000))
      .finally(() => setPdfBusy(false));
  };

  const allCollapsed = plan.categories.length > 0 && plan.categories.every((c) => collapsed.has(c.categoryId));

  return (
    <div className="plan-page">
      <div className="print-only">
        <Text as="h1" variant="heading-lg">
          Cribl Deployment Plan
        </Text>
        <Text as="p" variant="body-sm-normal" color="secondary">
          {[design.name, design.customer].filter(Boolean).join(' · ')} — generated by ArMo - Cribl Architecture Designer on {fmtLong(new Date())}
        </Text>
      </div>

      <PageHeader
        title="Deployment Plan"
        description="A dependency-aware, step-by-step plan to deploy this architecture. Schedule it, assign owners, track progress and export it for the customer."
        actions={
          <>
            <label className={`plan-toggle ${planState.showParties ? 'plan-toggle--on' : ''}`}>
              <Switch size="sm" aria-label="Party assignment" checked={planState.showParties} onChange={(e) => setPlan({ showParties: e.target.checked })} />
              <UsersOutlined size="sm" />
              <Text variant="body-sm-semibold">Party assignment</Text>
            </label>
            <Button variant="secondary" leadingIcon={copied ? CheckOutlined : CopyOutlined} onClick={copyMarkdown}>
              {copied ? 'Copied!' : 'Copy Markdown'}
            </Button>
            <Button variant="secondary" leadingIcon={FileTextOutlined} onClick={() => downloadMarkdown(buildPlanMarkdown(plan, schedule, exportDesign))}>
              Download .md
            </Button>
            <Button variant="secondary" leadingIcon={Download} pending={pdfBusy} disabled={pdfBusy} onClick={downloadPdf}>
              Download PDF
            </Button>
            <Button variant="secondary" leadingIcon={Print} onClick={() => window.print()}>
              Print
            </Button>
            <div className="plan-status" aria-live="polite">
              {status && (
                <Text variant="body-xs-normal" color={status.tone === 'success' ? 'success' : status.tone === 'warning' ? 'warning' : 'attention'}>
                  {status.text}
                </Text>
              )}
            </div>
          </>
        }
      />

      {planState.showParties && (
        <Section title="Responsible parties" description="Teams that own delivery. Assign them to each category below." icon={<UsersOutlined />} tone="accent">
          <PartyPanel planState={planState} onChange={setPlan} />
        </Section>
      )}

      <Section title="Project summary" description="What is being deployed, and how far along the plan is." icon={<RocketLaunch />}>
        <ProjectSummary plan={plan} schedule={schedule} done={done} optimistic={planState.optimistic} isProduction={design.mode === 'production'} />
      </Section>

      <Section title="Project timeline" description="Categories run in parallel wherever their dependencies allow. The critical path sets the go-live date." icon={<CalendarOutlined />}>
        <Timeline schedule={schedule} planState={planState} onChange={setPlan} />
      </Section>

      <Section title="Deployment categories overview" description={`${plan.categories.length} categories · ${plan.totalSteps} steps`} icon={<TableOutlined />}>
        <CategoriesTable plan={plan} schedule={schedule} planState={planState} />
      </Section>

      <Section
        title="Detailed steps by phase"
        description="Enter effort per step (hours, or switch a step to minutes) to calculate each category's days, and tick steps off as they are completed. Everything is saved with the design."
        icon={<ListOrdered />}
        actions={
          <div className="no-print">
            <Button
              variant="tertiary"
              size="sm"
              leadingIcon={allCollapsed ? ExpandAllOutlined : CollapseAllOutlined}
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(plan.categories.map((c) => c.categoryId)))}
            >
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </Button>
          </div>
        }
      >
        {phases.map((g) => (
          <div key={g.phase} className="stack">
            <div className="phase-divider">
              <span className={`phase-divider__pill phase-solid--${g.tone}`}>{g.label}</span>
              <span className="phase-divider__rule" />
              <Text variant="body-xs-normal" color="secondary">
                {g.categories.length} categor{g.categories.length === 1 ? 'y' : 'ies'}
              </Text>
            </div>
            {g.categories.map((cat) => (
              <CategoryCard
                key={cat.categoryId}
                category={cat}
                number={plan.categories.indexOf(cat) + 1}
                schedule={schedById.get(cat.categoryId)}
                planState={planState}
                dependencyTitle={depTitle}
                collapsed={collapsed.has(cat.categoryId)}
                onToggleCollapsed={toggleCollapsed}
                onToggleStep={toggleStep}
                onToggleParty={toggleParty}
                onEffort={setEffort}
                onResetEffort={resetEffort}
              />
            ))}
          </div>
        ))}
      </Section>

      <WizardFooter onBack={back} next={{ label: 'Next: Build in Cribl', onClick: next }} />
    </div>
  );
}
