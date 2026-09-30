import type { jsPDF as JsPDF } from 'jspdf';
import { PHASE_LABELS, type DeploymentPlan, type Phase } from '../../../engine/deploymentPlan';
import type { ArchitectureResult, Design } from '../../../model/types';
import { fmtGB, fmtNum } from '../../../ui/layout';
import { downloadBlob, fileSlug, fmtLong, overallDone, titleLookup, toIsoDate, type Schedule } from './planUtils';

/*
 * Text-based PDF (no DOM capture — canvas screenshots may be blocked in the Cribl sandbox).
 * PDF colors are RGB tuples here because they are drawn by jsPDF, not CSS; the printed page is always light.
 */

type RGB = [number, number, number];
const INK: RGB = [23, 28, 36];
const MUTED: RGB = [98, 106, 120];
const RULE: RGB = [220, 224, 230];
const PANEL: RGB = [245, 247, 250];
const CODE_BG: RGB = [240, 242, 246];
const BRAND: RGB = [0, 110, 122];
const BRAND_SOFT: RGB = [224, 244, 245];
const CRITICAL: RGB = [196, 43, 28];
const DONE: RGB = [22, 128, 72];
const PHASE_RGB: Record<Phase, RGB> = {
  PREP: [98, 106, 120],
  DEPLOY: [30, 102, 196],
  CONFIGURE: [0, 128, 140],
  VALIDATE: [124, 72, 196],
  GOLIVE: [22, 128, 72],
};

/** Standard PDF fonts only cover WinAnsi — map the engine's typographic characters to safe equivalents. */
function safe(text: string): string {
  return text
    .replace(/[→⇒➜]/g, '->')
    .replace(/[←]/g, '<-')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/≈/g, '~')
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[✓✔]/g, 'v')
    .replace(/\t/g, '  ')
    .replace(/[^\n -ÿ•]/g, '?');
}

interface Ctx {
  doc: JsPDF;
  y: number;
  readonly pageW: number;
  readonly pageH: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const width = (c: Ctx) => c.right - c.left;

function newPage(c: Ctx) {
  c.doc.addPage();
  c.y = c.top;
}

function ensure(c: Ctx, h: number) {
  if (c.y + h > c.bottom) newPage(c);
}

function font(c: Ctx, size: number, style: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal', color: RGB = INK, family: 'helvetica' | 'courier' = 'helvetica') {
  c.doc.setFont(family, style);
  c.doc.setFontSize(size);
  c.doc.setTextColor(...color);
}

const lh = (size: number) => size * 1.35;

function wrap(c: Ctx, text: string, w: number): string[] {
  return c.doc.splitTextToSize(safe(text), w) as string[];
}

/** Wrapped paragraph with per-line page breaks. */
function para(c: Ctx, text: string, opts: { size?: number; style?: 'normal' | 'bold' | 'italic' | 'bolditalic'; color?: RGB; indent?: number; after?: number } = {}) {
  const { size = 10, style = 'normal', color = INK, indent = 0, after = 4 } = opts;
  font(c, size, style, color);
  const lines = wrap(c, text, width(c) - indent);
  for (const line of lines) {
    ensure(c, lh(size));
    c.doc.text(line, c.left + indent, c.y + size);
    c.y += lh(size);
  }
  c.y += after;
}

function heading(c: Ctx, text: string, size = 15) {
  ensure(c, lh(size) + 40);
  c.y += 6;
  font(c, size, 'bold', INK);
  c.doc.text(safe(text), c.left, c.y + size);
  c.y += lh(size);
  c.doc.setDrawColor(...BRAND);
  c.doc.setLineWidth(1.2);
  c.doc.line(c.left, c.y, c.left + 40, c.y);
  c.y += 10;
}

/** Monospace block with a tinted background that splits cleanly across pages. */
function codeBlock(c: Ctx, text: string, indent: number) {
  const size = 7.8;
  const pad = 6;
  const lineH = size * 1.3;
  font(c, size, 'normal', INK, 'courier');
  const x = c.left + indent;
  const w = width(c) - indent;
  const lines = text.split('\n').flatMap((l) => (l.trim() === '' ? [''] : (c.doc.splitTextToSize(safe(l), w - pad * 2) as string[])));
  let i = 0;
  while (i < lines.length) {
    ensure(c, lineH + pad * 2);
    const fit = Math.max(1, Math.floor((c.bottom - c.y - pad * 2) / lineH));
    const chunk = lines.slice(i, i + fit);
    const h = chunk.length * lineH + pad * 2;
    c.doc.setFillColor(...CODE_BG);
    c.doc.setDrawColor(...RULE);
    c.doc.setLineWidth(0.5);
    c.doc.roundedRect(x, c.y, w, h, 3, 3, 'FD');
    font(c, size, 'normal', INK, 'courier');
    chunk.forEach((line, j) => c.doc.text(line, x + pad, c.y + pad + size + j * lineH));
    c.y += h;
    i += chunk.length;
    if (i < lines.length) newPage(c);
  }
  c.y += 8;
}

interface Column {
  label: string;
  /** Fraction of the content width. */
  w: number;
  align?: 'left' | 'right';
}
type CellStyle = { color?: RGB; bold?: boolean };
type Cell = string | { text: string } & CellStyle;

function table(c: Ctx, columns: Column[], rows: Cell[][]) {
  const size = 8.5;
  const padX = 4;
  const padY = 4;
  const total = columns.reduce((a, col) => a + col.w, 0);
  const widths = columns.map((col) => (col.w / total) * width(c));
  const drawHeader = () => {
    const h = lh(size) + padY * 2;
    c.doc.setFillColor(...PANEL);
    c.doc.rect(c.left, c.y, width(c), h, 'F');
    font(c, size, 'bold', MUTED);
    let x = c.left;
    columns.forEach((col, i) => {
      const tx = col.align === 'right' ? x + widths[i] - padX : x + padX;
      c.doc.text(safe(col.label.toUpperCase()), tx, c.y + padY + size, { align: col.align === 'right' ? 'right' : 'left' });
      x += widths[i];
    });
    c.y += h;
  };
  ensure(c, 60);
  drawHeader();
  for (const row of rows) {
    const cells = row.map((cell) => (typeof cell === 'string' ? { text: cell } : cell));
    const wrapped = cells.map((cell, i) => {
      font(c, size, cell.bold ? 'bold' : 'normal');
      return wrap(c, cell.text, widths[i] - padX * 2);
    });
    const h = Math.max(...wrapped.map((l) => l.length)) * lh(size) + padY * 2;
    if (c.y + h > c.bottom) {
      newPage(c);
      drawHeader();
    }
    let x = c.left;
    cells.forEach((cell, i) => {
      font(c, size, cell.bold ? 'bold' : 'normal', cell.color ?? INK);
      const col = columns[i];
      wrapped[i].forEach((line, j) => {
        const tx = col.align === 'right' ? x + widths[i] - padX : x + padX;
        c.doc.text(line, tx, c.y + padY + size + j * lh(size), { align: col.align === 'right' ? 'right' : 'left' });
      });
      x += widths[i];
    });
    c.y += h;
    c.doc.setDrawColor(...RULE);
    c.doc.setLineWidth(0.5);
    c.doc.line(c.left, c.y, c.right, c.y);
  }
  c.y += 12;
}

function statGrid(c: Ctx, items: { label: string; value: string }[], cols = 4) {
  const gap = 8;
  const w = (width(c) - gap * (cols - 1)) / cols;
  const valueSize = 10;
  for (let i = 0; i < items.length; i += cols) {
    const row = items.slice(i, i + cols);
    font(c, valueSize, 'bold', INK);
    const values = row.map((it) => wrap(c, it.value, w - 16));
    const h = 22 + Math.max(...values.map((v) => v.length)) * lh(valueSize) + 4;
    ensure(c, h + gap);
    row.forEach((it, j) => {
      const x = c.left + j * (w + gap);
      c.doc.setFillColor(...PANEL);
      c.doc.setDrawColor(...RULE);
      c.doc.setLineWidth(0.5);
      c.doc.roundedRect(x, c.y, w, h, 4, 4, 'FD');
      font(c, 7, 'bold', MUTED);
      c.doc.text(wrap(c, it.label.toUpperCase(), w - 16)[0] ?? '', x + 8, c.y + 13);
      font(c, valueSize, 'bold', INK);
      values[j].forEach((line, k) => c.doc.text(line, x + 8, c.y + 18 + valueSize + k * lh(valueSize)));
    });
    c.y += h + gap;
  }
  c.y += 6;
}

export interface PdfInput {
  design: Design;
  result: ArchitectureResult;
  plan: DeploymentPlan;
  schedule: Schedule;
}

export function buildPlanPdf(JsPDFCtor: typeof JsPDF, { design, result, plan, schedule }: PdfInput): JsPDF {
  const doc = new JsPDFCtor({ unit: 'pt', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const c: Ctx = { doc, y: 0, pageW, pageH, left: 44, right: pageW - 44, top: 48, bottom: pageH - 50 };
  const ps = plan.projectSummary;
  const m = result.metrics;
  const arch = result.architecture;
  const { categoryParties, checkedSteps, optimistic } = design.plan;
  const title = titleLookup(plan);
  const done = overallDone(plan, checkedSteps);
  const hasParties = plan.categories.some((cat) => (categoryParties[cat.categoryId] ?? []).length > 0);

  doc.setProperties({ title: `${design.name || 'Cribl'} — Deployment Plan`, subject: 'Cribl Deployment Plan', creator: 'ArMo - Cribl Architecture Designer' });

  // ── Title band ───────────────────────────────────────────
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageW, 118, 'F');
  font(c, 9, 'bold', BRAND_SOFT);
  doc.text('CRIBL ARCHITECTURE DESIGNER', c.left, 38);
  font(c, 24, 'bold', [255, 255, 255]);
  doc.text('Deployment Plan', c.left, 68);
  font(c, 12, 'normal', [255, 255, 255]);
  doc.text(safe([design.name, design.customer].filter(Boolean).join('  ·  ') || 'Untitled design'), c.left, 90);
  font(c, 9, 'normal', BRAND_SOFT);
  doc.text(safe(`Generated ${fmtLong(new Date())}`), c.right, 38, { align: 'right' });
  doc.text(safe(`${ps.mode} · ${ps.deploymentModel}`), c.right, 90, { align: 'right' });
  c.y = 142;

  // ── Key sizing ───────────────────────────────────────────
  heading(c, 'Project summary');
  statGrid(c, [
    { label: 'Deployment mode', value: ps.mode },
    { label: 'Deployment model', value: ps.deploymentModel },
    { label: 'Inbound', value: fmtGB(m.totalInboundGB) },
    { label: 'Outbound', value: fmtGB(m.totalOutboundGB) },
    { label: 'Total throughput', value: fmtGB(m.totalThroughputGB) },
    { label: 'Peak throughput', value: fmtGB(m.peakThroughputGB) },
    { label: 'Worker Nodes', value: `${ps.nodesForCapacity} capacity -> ${ps.totalNodes} deployed` },
    { label: 'vCPUs / Processes', value: `${fmtNum(m.totalVcpus)} / ${fmtNum(m.totalWorkerProcesses)}` },
    { label: 'Worker Groups', value: String(ps.workerGroups) },
    { label: 'Edge Nodes', value: fmtNum(ps.totalEdgeNodes) },
    { label: 'Sources / Destinations', value: `${ps.sourceCount} / ${ps.destinationCount}` },
    { label: 'Node profile', value: arch.profile.label },
    { label: 'Sequential estimate', value: `${plan.totalEstimatedDays.min}-${plan.totalEstimatedDays.max} days` },
    { label: `Scheduled (${optimistic ? 'optimistic' : 'conservative'})`, value: `${schedule.totalDays} days` },
    { label: 'Start -> end', value: `${toIsoDate(schedule.start)} -> ${toIsoDate(schedule.end)}` },
    { label: 'Progress', value: `${done}/${plan.totalSteps} steps` },
  ]);
  para(
    c,
    `Worker Nodes: ${ps.nodesForCapacity} node(s) are needed for raw capacity; ${ps.totalNodes} are deployed. The difference is intentional high availability — about 20% spare capacity per Worker Group${ps.mode === 'Production' ? ' and a minimum of 3 nodes per production Worker Group' : ''}, so the platform keeps up with peak load while nodes are down or being upgraded.`,
    { size: 8.5, color: MUTED, after: 10 },
  );

  // ── Worker groups ────────────────────────────────────────
  if (arch.workerGroups.length > 0) {
    heading(c, 'Worker Groups', 13);
    table(
      c,
      [
        { label: 'Group', w: 2.1 },
        { label: 'Managed by', w: 1.15 },
        { label: 'Sources', w: 2.2 },
        { label: 'Nodes', w: 1.5 },
        { label: 'In', w: 1.35, align: 'right' },
        { label: 'Out', w: 1.35, align: 'right' },
        { label: 'Peak util.', w: 1.15, align: 'right' },
      ],
      arch.workerGroups.map((g) => [
        { text: `${g.letter} · ${g.name}`, bold: true },
        g.managedBy === 'cribl' ? 'Cribl' : 'Customer',
        g.sources.map((s) => s.label || s.type).join(', ') || '-',
        g.managedBy === 'cribl' && g.cloudTierTBPerDay != null ? `~${g.cloudTierTBPerDay} TB/day tier` : `${g.nodes} (${g.nodesForCapacity} + ${g.haSpareNodes} HA)`,
        fmtGB(g.inboundGB),
        fmtGB(g.outboundGB),
        `${Math.round(g.peakUtilizationPct)}%`,
      ]),
    );
  }

  // ── Schedule ─────────────────────────────────────────────
  heading(c, 'Schedule', 13);
  para(c, `Parallel schedule by dependencies (${optimistic ? 'optimistic' : 'conservative'} durations): ${schedule.totalDays} days, ${fmtLong(schedule.start)} to ${fmtLong(schedule.end)}. Rows marked critical are on the critical path — any delay there moves the go-live date.`, {
    size: 8.5,
    color: MUTED,
    after: 8,
  });
  const scheduleCols: Column[] = [
    { label: '#', w: 0.4 },
    { label: 'Category', w: 2.6 },
    { label: 'Phase', w: 1.65 },
    { label: 'Start', w: 1.2 },
    { label: 'End', w: 1.2 },
    { label: 'Days', w: 0.6, align: 'right' },
    { label: 'Depends on', w: 2.2 },
  ];
  if (hasParties) scheduleCols.push({ label: 'Assigned', w: 1.8 });
  table(
    c,
    scheduleCols,
    schedule.scheduled.map((s, i) => {
      const row: Cell[] = [
        String(i + 1),
        { text: s.critical ? `${s.title}  (critical)` : s.title, bold: true, color: s.critical ? CRITICAL : INK },
        { text: PHASE_LABELS[s.phase], color: PHASE_RGB[s.phase], bold: true },
        toIsoDate(s.startDate),
        toIsoDate(s.endDate),
        String(s.duration),
        s.dependencies.map(title).join(', ') || '-',
      ];
      if (hasParties) row.push((categoryParties[s.categoryId] ?? []).join(', ') || '-');
      return row;
    }),
  );

  // ── Categories and steps ─────────────────────────────────
  newPage(c);
  heading(c, 'Deployment steps');
  const schedById = new Map(schedule.scheduled.map((s) => [s.categoryId, s]));
  plan.categories.forEach((cat, catIdx) => {
    const sched = schedById.get(cat.categoryId);
    const catDone = cat.steps.filter((s) => checkedSteps[s.id]).length;
    ensure(c, 110);
    const barTop = c.y;
    font(c, 12.5, 'bold', INK);
    const titleLines = wrap(c, `${catIdx + 1}. ${cat.title}`, width(c) - 14);
    titleLines.forEach((line) => {
      doc.text(line, c.left + 10, c.y + 12.5);
      c.y += lh(12.5);
    });
    doc.setFillColor(...PHASE_RGB[cat.phase]);
    doc.rect(c.left, barTop + 1, 3.5, c.y - barTop, 'F');
    c.y += 2;
    const meta = [
      PHASE_LABELS[cat.phase],
      `Est. ${cat.estimatedDays.min === cat.estimatedDays.max ? `${cat.estimatedDays.min} day${cat.estimatedDays.min === 1 ? '' : 's'}` : `${cat.estimatedDays.min}-${cat.estimatedDays.max} days`}`,
      sched ? `Scheduled ${toIsoDate(sched.startDate)} -> ${toIsoDate(sched.endDate)}${sched.critical ? ' (critical path)' : ''}` : '',
      `${catDone}/${cat.steps.length} steps done`,
    ]
      .filter(Boolean)
      .join('  ·  ');
    para(c, meta, { size: 8.5, color: MUTED, indent: 10, after: 2 });
    if (cat.dependencies.length) para(c, `Depends on: ${cat.dependencies.map(title).join(', ')}`, { size: 8.5, color: MUTED, indent: 10, after: 2 });
    const assigned = categoryParties[cat.categoryId] ?? [];
    if (assigned.length) para(c, `Assigned to: ${assigned.join(', ')}`, { size: 8.5, style: 'bold', color: BRAND, indent: 10, after: 2 });
    para(c, cat.summary, { size: 9.5, style: 'italic', indent: 10, after: 8 });

    cat.steps.forEach((step, stepIdx) => {
      const checked = !!checkedSteps[step.id];
      ensure(c, 60);
      // Checkbox
      doc.setDrawColor(...(checked ? DONE : MUTED));
      doc.setLineWidth(0.8);
      if (checked) {
        doc.setFillColor(...DONE);
        doc.rect(c.left + 10, c.y + 2, 8, 8, 'FD');
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(1.2);
        doc.line(c.left + 11.8, c.y + 6.2, c.left + 13.6, c.y + 8.2);
        doc.line(c.left + 13.6, c.y + 8.2, c.left + 16.6, c.y + 3.8);
      } else {
        doc.rect(c.left + 10, c.y + 2, 8, 8, 'S');
      }
      font(c, 10, 'bold', checked ? DONE : INK);
      const stepTitle = wrap(c, `${catIdx + 1}.${stepIdx + 1}  ${step.title}${checked ? '  (done)' : ''}`, width(c) - 26);
      stepTitle.forEach((line) => {
        ensure(c, lh(10));
        doc.text(line, c.left + 26, c.y + 10);
        c.y += lh(10);
      });
      if (step.owner) para(c, `Owner: ${step.owner}`, { size: 8.5, color: BRAND, style: 'bold', indent: 26, after: 1 });
      para(c, step.detail, { size: 9.2, indent: 26, after: 4 });
      if (step.technical) codeBlock(c, step.technical, 26);
    });
    c.y += 6;
    ensure(c, 20);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.line(c.left, c.y, c.right, c.y);
    c.y += 14;
  });

  // ── Footer with page numbers ─────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.line(c.left, pageH - 34, c.right, pageH - 34);
    font(c, 8, 'normal', MUTED);
    doc.text(safe(`${design.name || 'Cribl design'} — Deployment Plan`), c.left, pageH - 22);
    doc.text(`Page ${p} of ${pages}`, c.right, pageH - 22, { align: 'right' });
  }
  return doc;
}

/** Lazy-loads jsPDF so it only ships when the user exports. */
export async function downloadPlanPdf(input: PdfInput) {
  const { jsPDF } = await import('jspdf');
  const doc = buildPlanPdf(jsPDF, input);
  downloadBlob(doc.output('blob'), `${fileSlug(input.design.name)}-deployment-plan.pdf`);
}
