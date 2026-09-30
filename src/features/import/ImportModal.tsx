import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Checkbox, Collapse, Modal, NumberField, SelectField, Spinner, Text } from '@capra/core';
import { CircleCheck, Destinations, ReloadOutlined, Sources, WorkersOutlined } from '@capra/icons';
import { DESTINATION_TYPES, SOURCE_TYPES, getDestinationType, getSourceType } from '../../model/catalog';
import { isInCribl } from '../../platform/cribl';
import { useDesign } from '../../state/DesignStore';
import { InfoTip, StatTile, fmtGB, fmtNum } from '../../ui/layout';
import { DestinationLogo, SourceLogo } from '../../ui/logos';
import { discoverWorkspace, liveGet, workspaceLabelFromUrl, type CallError, type Progress } from './criblApi';
import {
  buildImport,
  buildSnapshot,
  findExistingDestination,
  hasExistingSource,
  normalizeWorkspace,
  splitVolume,
  type ImportResult,
  type ImportedInput,
  type ImportedOutput,
  type Workspace,
} from './mapping';
import { SAMPLE_WORKSPACE_LABEL, sampleGet } from './sampleWorkspace';
import './import.css';

interface SourceRow {
  key: string;
  input: ImportedInput;
  selected: boolean;
  type: string;
  count: number;
  volumeOverride: number | null;
  alreadyImported: boolean;
}

interface DestRow {
  key: string;
  output: ImportedOutput;
  selected: boolean;
  type: string;
}

type Phase = { kind: 'loading'; progress: Progress | null } | { kind: 'review' } | { kind: 'done'; stats: ImportResult['stats'] } | { kind: 'failed'; message: string };

const SOURCE_ITEMS = SOURCE_TYPES.map((s) => ({ id: s.value, label: s.label }));
const DEST_ITEMS = DESTINATION_TYPES.map((d) => ({ id: d.value, label: d.label }));

const plural = (n: number, one: string, many = `${one}s`) => `${fmtNum(n)} ${n === 1 ? one : many}`;
const fmtVolume = (gb: number | null | undefined) => (gb === null || gb === undefined ? '—' : gb < 10 ? `${gb.toFixed(1)} GB/day` : fmtGB(gb));

export default function ImportModal({ onClose }: { onClose: () => void }) {
  const { design, set } = useDesign();
  const sample = !isInCribl();
  const workspaceLabel = sample ? SAMPLE_WORKSPACE_LABEL : workspaceLabelFromUrl(window.CRIBL_API_URL);

  const [phase, setPhase] = useState<Phase>({ kind: 'loading', progress: null });
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [errors, setErrors] = useState<CallError[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [sourceRows, setSourceRows] = useState<SourceRow[]>([]);
  const [destRows, setDestRows] = useState<DestRow[]>([]);
  const [totalGB, setTotalGB] = useState<number | null>(null);
  const [connectRoutes, setConnectRoutes] = useState(true);

  const ctrlRef = useRef<AbortController | null>(null);
  // Latest design for the async load callback (to flag already-imported items) without re-triggering discovery.
  const designRef = useRef(design);
  useEffect(() => {
    designRef.current = design;
  }, [design]);

  const load = useCallback(() => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setPhase({ kind: 'loading', progress: null });
    setErrors([]);
    discoverWorkspace(sample ? sampleGet : liveGet, ctrl.signal, (progress) => {
      if (!ctrl.signal.aborted) setPhase({ kind: 'loading', progress });
    })
      .then(({ raw, errors: errs }) => {
        if (ctrl.signal.aborted) return;
        const ws = normalizeWorkspace(raw);
        const current = designRef.current;
        setWorkspace(ws);
        setErrors(errs);
        setRequestCount(3 + ws.streamGroups.length * 2);
        setSourceRows(
          ws.inputs.map((input) => {
            const alreadyImported = hasExistingSource(current, input);
            return { key: input.key, input, selected: !alreadyImported, type: input.mappedType, count: 1, volumeOverride: null, alreadyImported };
          }),
        );
        setDestRows(ws.outputs.map((output) => ({ key: output.key, output, selected: true, type: output.mappedType })));
        setTotalGB(ws.license && ws.license.dailyInGB > 0 ? ws.license.dailyInGB : null);
        setPhase({ kind: 'review' });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setPhase({ kind: 'failed', message: e instanceof Error ? e.message : 'Unexpected error while reading the workspace.' });
      });
  }, [sample]);

  useEffect(() => {
    load();
    return () => ctrlRef.current?.abort();
  }, [load]);

  const close = useCallback(() => {
    ctrlRef.current?.abort();
    onClose();
  }, [onClose]);

  const volumes = useMemo(() => splitVolume(totalGB, sourceRows), [totalGB, sourceRows]);
  const selectedSources = sourceRows.filter((r) => r.selected);
  const selectedDests = destRows.filter((r) => r.selected);
  const groupNames = useMemo(() => new Map((workspace?.streamGroups ?? []).map((g) => [g.id, g.name])), [workspace]);

  const routePreview = useMemo(() => {
    if (!connectRoutes) return 0;
    const destKeysByGroup = new Map<string, Set<string>>();
    for (const d of selectedDests) {
      for (const g of d.output.groupIds) {
        const s = destKeysByGroup.get(g) ?? new Set<string>();
        s.add(`${d.type}|${d.output.outputId}`);
        destKeysByGroup.set(g, s);
      }
    }
    return selectedSources.reduce((a, s) => a + (destKeysByGroup.get(s.input.groupId)?.size ?? 0), 0);
  }, [connectRoutes, selectedSources, selectedDests]);

  const updateSource = (key: string, patch: Partial<SourceRow>) => setSourceRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const updateDest = (key: string, patch: Partial<DestRow>) => setDestRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const apply = () => {
    if (!workspace) return;
    const snapshot = buildSnapshot(workspace, workspaceLabel, sample);
    const result = buildImport(
      design,
      sourceRows.flatMap((r, i) => (r.selected ? [{ input: r.input, type: r.type, count: r.count, volumeGBPerDay: volumes[i] }] : [])),
      selectedDests.map((r) => ({ output: r.output, type: r.type })),
      { connectRoutes, snapshot },
    );
    set(result.patch);
    setPhase({ kind: 'done', stats: result.stats });
  };

  const hasRows = sourceRows.length > 0 || destRows.length > 0;
  const nothingSelected = selectedSources.length === 0 && selectedDests.length === 0;

  const title = (
    <Modal.ExpandedTitleLayout>
      <Modal.Heading>Import from this workspace</Modal.Heading>
      {sample ? <span className="chip chip--warning">{SAMPLE_WORKSPACE_LABEL}</span> : <span className="chip chip--brand">Read-only</span>}
    </Modal.ExpandedTitleLayout>
  );

  let footer: ReactNode;
  if (phase.kind === 'review') {
    const primaryLabel = !hasRows || nothingSelected ? 'Save workspace snapshot' : `Add ${plural(selectedSources.length, 'Source')} & ${plural(selectedDests.length, 'Destination')}`;
    footer = (
      <Modal.ExpandedFooterLayout>
        <Text variant="body-sm-normal" color="secondary">
          {connectRoutes && routePreview > 0 ? `${plural(routePreview, 'route')} will be created` : 'Nothing in Cribl is changed'}
        </Text>
        <div className="row">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={apply}>
            {primaryLabel}
          </Button>
        </div>
      </Modal.ExpandedFooterLayout>
    );
  } else if (phase.kind === 'done') {
    footer = (
      <Modal.FooterActions>
        <Button variant="primary" onClick={close}>
          Done
        </Button>
      </Modal.FooterActions>
    );
  } else {
    footer = (
      <Modal.FooterActions>
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
      </Modal.FooterActions>
    );
  }

  return (
    <Modal isOpen onIsOpenChange={(open) => !open && close()} title={title} size="lg" footer={footer}>
      <div className="imp">
        {phase.kind === 'loading' && <LoadingState progress={phase.progress} sample={sample} />}

        {phase.kind === 'failed' && (
          <Alert appearance="danger" title="Couldn't read the workspace" action={{ label: 'Try again', onClick: load }}>
            {phase.message}
          </Alert>
        )}

        {phase.kind === 'done' && <DoneState stats={phase.stats} workspaceLabel={workspaceLabel} sample={sample} />}

        {phase.kind === 'review' && workspace && (
          <>
            {sample ? (
              <Alert appearance="info" title={SAMPLE_WORKSPACE_LABEL}>
                The App is running outside Cribl, so this is a built-in example workspace processed by the same import logic. Open the App inside Cribl.Cloud to read your real Worker Groups,
                Sources and Destinations.
              </Alert>
            ) : (
              <Text as="p" variant="body-sm-normal" color="secondary">
                Read from <span className="mono">{workspaceLabel}</span>. This only reads configuration and usage; nothing in Cribl is changed.
              </Text>
            )}

            {errors.length > 0 && <ErrorsAlert errors={errors} total={requestCount} onRetry={load} />}

            <WorkspaceSummary workspace={workspace} />

            <section className="imp-block" aria-labelledby="imp-sources-title">
              <div className="imp-block__header">
                <div className="imp-block__title">
                  <Sources size="sm" aria-hidden />
                  <Text as="h3" id="imp-sources-title" variant="heading-xs">
                    Sources
                  </Text>
                  <span className="chip">{`${selectedSources.length} of ${sourceRows.length} selected`}</span>
                </div>
                <div className="imp-volume">
                  <div className="imp-volume__field">
                    <NumberField
                      label="Daily volume to distribute (GB/day)"
                      size="sm"
                      min={0}
                      step={10}
                      value={totalGB ?? ''}
                      placeholder="e.g. 500"
                      appearance={totalGB === null && selectedSources.length > 0 ? 'warning' : 'default'}
                      onChange={(v) => setTotalGB(Number.isFinite(v) ? Math.max(0, v) : null)}
                    />
                  </div>
                  <Button variant="tertiary" size="sm" leadingIcon={ReloadOutlined} disabled={!sourceRows.some((r) => r.volumeOverride !== null)} onClick={() => setSourceRows((rows) => rows.map((r) => ({ ...r, volumeOverride: null })))}>
                    Split evenly
                  </Button>
                </div>
              </div>
              <Text as="p" variant="body-xs-normal" color="secondary">
                {workspace.license
                  ? `Prefilled with the average daily inbound volume from license usage (last ${plural(workspace.license.days, 'day')}), split evenly across the selected Sources. Edit any row to override it.`
                  : "License usage couldn't be read, so enter the total daily volume here (or per Source) to size the design."}
              </Text>
              {sourceRows.length === 0 ? (
                <EmptyRows what="Sources" />
              ) : (
                <SourcesTable rows={sourceRows} volumes={volumes} groupNames={groupNames} onChange={updateSource} onToggleAll={(v) => setSourceRows((rows) => rows.map((r) => ({ ...r, selected: v })))} />
              )}
            </section>

            <section className="imp-block" aria-labelledby="imp-dests-title">
              <div className="imp-block__header">
                <div className="imp-block__title">
                  <Destinations size="sm" aria-hidden />
                  <Text as="h3" id="imp-dests-title" variant="heading-xs">
                    Destinations
                  </Text>
                  <span className="chip">{`${selectedDests.length} of ${destRows.length} selected`}</span>
                </div>
              </div>
              {destRows.length === 0 ? (
                <EmptyRows what="Destinations" />
              ) : (
                <DestinationsTable rows={destRows} onChange={updateDest} onToggleAll={(v) => setDestRows((rows) => rows.map((r) => ({ ...r, selected: v })))} />
              )}
            </section>

            <div className="imp-routes">
              <Checkbox checked={connectRoutes} onChange={(e) => setConnectRoutes(e.target.checked)}>
                Connect every imported Source to every imported Destination in the same Worker Group
              </Checkbox>
              <InfoTip text="Seeds the routing matrix from where each Source and Destination is configured in Cribl. Cribl Routes can be more selective; review and refine them in the Routing step." />
            </div>

            {(workspace.skipped.disabled > 0 || workspace.skipped.internal > 0) && (
              <Text as="p" variant="body-xs-normal" color="secondary">
                {`Skipped ${plural(workspace.skipped.disabled, 'disabled item')} and ${plural(workspace.skipped.internal, 'Cribl-internal item')} (e.g. CriblLogs, CriblMetrics, devnull, the default output).`}
              </Text>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function LoadingState({ progress, sample }: { progress: Progress | null; sample: boolean }) {
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="imp-loading" role="status" aria-live="polite">
      <Spinner size="lg" title="Reading workspace" />
      <Text variant="body-md-semibold">{sample ? 'Loading the sample workspace…' : 'Reading your Cribl workspace…'}</Text>
      <Text variant="body-sm-normal" color="secondary">
        {progress ? `${progress.current} · ${progress.done} of ${progress.total} requests` : 'Worker Groups, Nodes, license usage, Sources and Destinations'}
      </Text>
      <div className="imp-progress" aria-hidden>
        <div className="imp-progress__bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ErrorsAlert({ errors, total, onRetry }: { errors: CallError[]; total: number; onRetry: () => void }) {
  return (
    <Alert appearance="warning" title="Some data couldn't be read" action={{ label: 'Retry', onClick: onRetry }}>
      <div className="stack stack--sm">
        <span>{`${plural(errors.length, 'request')} of ${total} failed. Everything else was imported; fill in the gaps manually.`}</span>
        <Collapse title={`Show details (${errors.length})`}>
          <ul className="imp-errors">
            {errors.map((e) => (
              <li key={e.key}>
                <Text variant="body-sm-semibold">{e.message}</Text>
                <span className="imp-errors__meta">
                  <span className="mono">GET {e.path}</span>
                  {e.status !== undefined && <span className="chip chip--danger">{e.status}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Collapse>
      </div>
    </Alert>
  );
}

function WorkspaceSummary({ workspace }: { workspace: Workspace }) {
  const { streamGroups, fleets, license } = workspace;
  const nodes = streamGroups.reduce((a, g) => a + g.workerCount, 0);
  const vcpus = streamGroups.reduce((a, g) => a + g.totalVcpus, 0);
  const estimated = streamGroups.some((g) => g.vcpusEstimated);
  const customer = streamGroups.filter((g) => g.onPrem).length;
  const edgeNodes = fleets.reduce((a, g) => a + g.workerCount, 0);
  const inputsByGroup = countBy(workspace.inputs.map((i) => i.groupId));
  const outputsByGroup = countBy(workspace.outputs.flatMap((o) => o.groupIds));

  return (
    <div className="stack stack--sm">
      <div className="imp-stats">
        <StatTile label="Worker Groups" value={fmtNum(streamGroups.length)} sub={`${customer} customer-managed · ${streamGroups.length - customer} Cribl-managed`} />
        <StatTile label="Worker Nodes" value={fmtNum(nodes)} sub="Connected Stream nodes" />
        <StatTile label="vCPUs" value={vcpus > 0 ? fmtNum(vcpus) : '—'} sub={vcpus === 0 ? 'Not reported' : estimated ? 'Partly estimated' : 'Across Worker Nodes'} hint="Sum of CPUs reported by connected Worker Nodes. Cribl reserves some cores for the OS; the designer accounts for that when sizing." />
        <StatTile label="Edge Fleets" value={fmtNum(fleets.length)} sub={plural(edgeNodes, 'Edge Node')} />
        <StatTile label="Avg daily in" value={fmtVolume(license?.dailyInGB)} sub={license ? `License usage, ${license.days} days` : 'License usage unavailable'} tone="accent" />
        <StatTile label="Avg daily out" value={fmtVolume(license?.dailyOutGB)} sub={license ? 'To all Destinations' : 'License usage unavailable'} />
      </div>
      {streamGroups.length > 0 && (
        <div className="imp-table-wrap">
          <table className="data-table imp-table imp-table--compact">
            <thead>
              <tr>
                <th>Worker Group</th>
                <th>Managed by</th>
                <th className="imp-num">Nodes</th>
                <th className="imp-num">vCPUs</th>
                <th className="imp-num">Sources</th>
                <th className="imp-num">Destinations</th>
              </tr>
            </thead>
            <tbody>
              {streamGroups.map((g) => (
                <tr key={g.id}>
                  <td>
                    <div className="imp-cell-stack">
                      <span className="imp-group-name">
                        <WorkersOutlined size="xs" aria-hidden />
                        <Text variant="body-sm-semibold">{g.name}</Text>
                      </span>
                      {g.name !== g.id && <span className="mono imp-sub">{g.id}</span>}
                    </div>
                  </td>
                  <td>{g.onPrem ? <span className="chip">Customer (hybrid)</span> : <span className="chip chip--brand">Cribl.Cloud</span>}</td>
                  <td className="imp-num">{fmtNum(g.workerCount)}</td>
                  <td className="imp-num">{g.totalVcpus > 0 ? `${fmtNum(g.totalVcpus)}${g.vcpusEstimated ? '*' : ''}` : '—'}</td>
                  <td className="imp-num">{fmtNum(inputsByGroup.get(g.id) ?? 0)}</td>
                  <td className="imp-num">{fmtNum(outputsByGroup.get(g.id) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SourcesTable({
  rows,
  volumes,
  groupNames,
  onChange,
  onToggleAll,
}: {
  rows: SourceRow[];
  volumes: number[];
  groupNames: Map<string, string>;
  onChange: (key: string, patch: Partial<SourceRow>) => void;
  onToggleAll: (selected: boolean) => void;
}) {
  const selected = rows.filter((r) => r.selected).length;
  return (
    <div className="imp-table-wrap">
      <table className="data-table imp-table">
        <thead>
          <tr>
            <th className="imp-check">
              <Checkbox aria-label="Select all Sources" checked={selected === rows.length} indeterminate={selected > 0 && selected < rows.length} onChange={(e) => onToggleAll(e.target.checked)} />
            </th>
            <th>Source type in design</th>
            <th>Cribl Source</th>
            <th className="imp-col-count">Count</th>
            <th className="imp-col-volume">GB/day</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className={r.selected ? undefined : 'imp-row--off'}>
              <td className="imp-check">
                <Checkbox aria-label={`Import ${r.input.inputId}`} checked={r.selected} onChange={(e) => onChange(r.key, { selected: e.target.checked })} />
              </td>
              <td>
                <div className="imp-type">
                  <span className="imp-logo">
                    <SourceLogo type={r.type} size="sm" />
                  </span>
                  <div className="imp-type__select">
                    <SelectField
                      aria-label={`Source type for ${r.input.inputId}`}
                      size="sm"
                      items={SOURCE_ITEMS}
                      value={r.type}
                      disabled={!r.selected}
                      onChange={(k) => k !== null && onChange(r.key, { type: String(k) })}
                    />
                  </div>
                </div>
              </td>
              <td>
                <div className="imp-cell-stack">
                  <span className="imp-id">
                    <span className="mono">
                      <span className="imp-sub">{r.input.groupId}/</span>
                      {r.input.inputId}
                    </span>
                    <span className="chip">{r.input.criblType}</span>
                    {r.alreadyImported && <span className="chip chip--info">Already in design</span>}
                  </span>
                  <span className="imp-sub">
                    {[r.input.description, r.input.ports.length ? `port ${r.input.ports.join(', ')}` : '', r.input.pq !== 'off' ? `PQ ${r.input.pq}` : '', groupNames.get(r.input.groupId) !== r.input.groupId ? groupNames.get(r.input.groupId) : '']
                      .filter(Boolean)
                      .join(' · ') || getSourceType(r.type).criblInputHint}
                  </span>
                </div>
              </td>
              <td className="imp-col-count">
                <NumberField aria-label={`Number of ${r.input.inputId} sources`} size="sm" min={1} step={1} value={r.count} disabled={!r.selected} onChange={(v) => onChange(r.key, { count: Number.isFinite(v) ? Math.max(1, Math.round(v)) : 1 })} />
              </td>
              <td className="imp-col-volume">
                <NumberField
                  aria-label={`GB per day for ${r.input.inputId}`}
                  size="sm"
                  min={0}
                  step={1}
                  value={r.selected ? volumes[i] : 0}
                  disabled={!r.selected}
                  formatOptions={{ maximumFractionDigits: 1 }}
                  onChange={(v) => onChange(r.key, { volumeOverride: Number.isFinite(v) ? Math.max(0, v) : null })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DestinationsTable({ rows, onChange, onToggleAll }: { rows: DestRow[]; onChange: (key: string, patch: Partial<DestRow>) => void; onToggleAll: (selected: boolean) => void }) {
  const { design } = useDesign();
  const selected = rows.filter((r) => r.selected).length;
  return (
    <div className="imp-table-wrap">
      <table className="data-table imp-table">
        <thead>
          <tr>
            <th className="imp-check">
              <Checkbox aria-label="Select all Destinations" checked={selected === rows.length} indeterminate={selected > 0 && selected < rows.length} onChange={(e) => onToggleAll(e.target.checked)} />
            </th>
            <th>Destination type in design</th>
            <th>Cribl Destination</th>
            <th>Worker Groups</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const existing = findExistingDestination(design, r.type, r.output.outputId);
            return (
              <tr key={r.key} className={r.selected ? undefined : 'imp-row--off'}>
                <td className="imp-check">
                  <Checkbox aria-label={`Import ${r.output.outputId}`} checked={r.selected} onChange={(e) => onChange(r.key, { selected: e.target.checked })} />
                </td>
                <td>
                  <div className="imp-type">
                    <span className="imp-logo">
                      <DestinationLogo type={r.type} size="sm" />
                    </span>
                    <div className="imp-type__select">
                      <SelectField aria-label={`Destination type for ${r.output.outputId}`} size="sm" items={DEST_ITEMS} value={r.type} disabled={!r.selected} onChange={(k) => k !== null && onChange(r.key, { type: String(k) })} />
                    </div>
                  </div>
                </td>
                <td>
                  <div className="imp-cell-stack">
                    <span className="imp-id">
                      <span className="mono">{r.output.outputId}</span>
                      <span className="chip">{r.output.criblType}</span>
                      {existing && <span className="chip chip--info">Links to existing</span>}
                    </span>
                    <span className="imp-sub">
                      {[r.output.backpressure ? `Backpressure: ${r.output.backpressure === 'pq' ? 'Persistent Queue' : r.output.backpressure}` : '', getDestinationType(r.type).description].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                </td>
                <td>
                  <span className="imp-groups">
                    {r.output.groupIds.map((g) => (
                      <span key={g} className="chip mono">
                        {g}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyRows({ what }: { what: string }) {
  return (
    <div className="imp-empty">
      <Text variant="body-sm-normal" color="secondary">
        {`No enabled ${what} were found in the Stream Worker Groups that could be read.`}
      </Text>
    </div>
  );
}

function DoneState({ stats, workspaceLabel, sample }: { stats: ImportResult['stats']; workspaceLabel: string; sample: boolean }) {
  const parts = [
    plural(stats.sourcesAdded, 'Source'),
    plural(stats.destinationsAdded, 'Destination'),
    ...(stats.destinationsReused > 0 ? [`${plural(stats.destinationsReused, 'existing Destination')} linked`] : []),
    plural(stats.routes, 'route'),
  ];
  return (
    <div className="imp-done">
      <span className="imp-done__icon">
        <CircleCheck size="lg" aria-hidden />
      </span>
      <Text as="h3" variant="heading-sm">
        Workspace imported
      </Text>
      <Text as="p" variant="body-md-normal" color="secondary">
        {`Added ${parts.join(', ')} from ${sample ? 'the sample workspace' : workspaceLabel}. The workspace snapshot is saved with this design for the current-vs-recommended comparison.`}
      </Text>
      <Alert appearance="success" layout="inline">
        Imported items are tagged as imported. Review the mapped types, counts and volumes before sizing.
      </Alert>
    </div>
  );
}

function countBy(keys: string[]) {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}
