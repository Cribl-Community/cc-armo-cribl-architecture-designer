import { useState } from 'react';
import { Alert, Button, Checkbox, IconButton, NumberField, SelectField, Text } from '@capra/core';
import { CircleInfo, Destinations, Plus, Routes, Sources, Trash } from '@capra/icons';
import ImportWorkspaceButton from '../../features/import/ImportWorkspaceButton';
import {
  CATEGORY_LABELS,
  COMPLEXITY_OPTIONS,
  DESTINATION_TYPES,
  SOURCE_TYPES,
  categoryOf,
  destinationLabel,
  getDestinationType,
  getSourceType,
} from '../../model/catalog';
import type { Complexity, Destination, LocationType, SourceCategory, SourceGroup } from '../../model/types';
import { useDesign } from '../../state/DesignStore';
import { InfoTip, PageHeader, Section, StatTile, WizardFooter, fmtGB, fmtNum } from '../../ui/layout';
import { DestinationLogo, SourceLogo } from '../../ui/logos';
import { useStepNav } from '../../ui/useStepNav';
import { clampNum } from './inputs/num';
import './inputs/inputs.css';

// ── Option lists (module-level so SelectField item renderers stay pure) ──────
type RichItem = { id: string; label: string; description: string };

const SOURCE_ITEMS: RichItem[] = SOURCE_TYPES.map((t) => ({ id: t.value, label: t.label, description: t.description }));
const DESTINATION_ITEMS: RichItem[] = DESTINATION_TYPES.map((t) => ({ id: t.value, label: t.label, description: t.description }));
const COMPLEXITY_ITEMS: RichItem[] = COMPLEXITY_OPTIONS.map((o) => ({ id: o.value, label: o.label, description: `${o.description} Sizing headroom ×${o.factor.toFixed(2)}.` }));
const COMPLEXITY_SHORT = COMPLEXITY_OPTIONS.map((o) => ({ id: o.value, label: o.label.replace(' Processing', '').replace(' / To Be Decided', '') }));
const LOCATION_ITEMS = [
  { id: 'distributed', label: 'Distributed - Logs generated across many hosts (requires Edge)' },
  { id: 'centralized', label: 'Centralized - Logs sent to central system (syslog/API)' },
];
const LOCATION_SHORT = [
  { id: 'distributed', label: 'Distributed (Edge)' },
  { id: 'centralized', label: 'Centralized (syslog/API)' },
];

const renderSourceItem = (item: RichItem) => (
  <SelectField.Item id={item.id} textValue={item.label}>
    <span className="in-option">
      <span className="in-option__logo">
        <SourceLogo type={item.id} size="sm" />
      </span>
      <span className="in-option__text">
        <span className="in-option__label">{item.label}</span>
        <span className="in-option__desc">{item.description}</span>
      </span>
    </span>
  </SelectField.Item>
);

const renderDestinationItem = (item: RichItem) => (
  <SelectField.Item id={item.id} textValue={item.label}>
    <span className="in-option">
      <span className="in-option__logo">
        <DestinationLogo type={item.id} size="sm" />
      </span>
      <span className="in-option__text">
        <span className="in-option__label">{item.label}</span>
        <span className="in-option__desc">{item.description}</span>
      </span>
    </span>
  </SelectField.Item>
);

const renderRichItem = (item: RichItem) => (
  <SelectField.Item id={item.id} textValue={item.label}>
    <span className="in-option__text">
      <span className="in-option__label">{item.label}</span>
      <span className="in-option__desc">{item.description}</span>
    </span>
  </SelectField.Item>
);

const CATEGORY_CHIP: Record<SourceCategory, string> = { endpoint: 'chip--brand', network: 'chip--info', cloud: 'chip--highlight' };

const COMPLEXITY_NOUN: Record<Complexity, string> = { light: 'Light', medium: 'Medium', heavy: 'Heavy', unknown: 'Unknown' };

const destName = (d: Destination) => d.label || destinationLabel(d.type);

interface NewSourceForm {
  type: string;
  count: number;
  volumeGBPerDay: number;
  complexity: Complexity;
  locationType: LocationType;
}

const blankForm = (): NewSourceForm => {
  const def = SOURCE_TYPES[0];
  return { type: def.value, count: 10, volumeGBPerDay: 100, complexity: 'medium', locationType: def.defaultLocation ?? 'centralized' };
};

export default function Step2Sources() {
  const { design, result, addSource, updateSource, removeSource, addDestination, removeDestination, toggleRoute } = useDesign();
  const { next, back } = useStepNav(2);
  const { sources, destinations } = design;

  const [form, setForm] = useState<NewSourceForm>(blankForm);
  const [newDest, setNewDest] = useState<string>(DESTINATION_TYPES[0].value);
  const [showWarning, setShowWarning] = useState(false);

  const def = getSourceType(form.type);
  const needsLocation = def.category === null;
  const resolvedCategory = categoryOf(form.type, form.locationType);
  const complexityDef = COMPLEXITY_OPTIONS.find((o) => o.value === form.complexity);
  const destDef = getDestinationType(newDest);

  const unrouted = sources.filter((s) => s.destinationIds.length === 0);
  const warningActive = showWarning && unrouted.length > 0;
  const routeCount = sources.reduce((a, s) => a + s.destinationIds.length, 0);
  const totalSystems = sources.reduce((a, s) => a + (s.count || 0), 0);
  const canContinue = sources.length > 0 && destinations.length > 0;

  const handleTypeChange = (type: string) => {
    const d = getSourceType(type);
    setForm((f) => ({ ...f, type, locationType: d.category === null ? f.locationType : (d.defaultLocation ?? 'centralized') }));
  };

  const handleAddSource = () => {
    if (form.count <= 0 || form.volumeGBPerDay <= 0) return;
    addSource({
      type: form.type,
      count: form.count,
      volumeGBPerDay: form.volumeGBPerDay,
      complexity: form.complexity,
      locationType: needsLocation ? form.locationType : (def.defaultLocation ?? 'centralized'),
      origin: 'manual',
    });
    setForm(blankForm());
  };

  const handleAddDestination = () => {
    if (!newDest) return;
    addDestination({ type: newDest, origin: 'manual' });
    setNewDest(DESTINATION_TYPES[0].value);
  };

  const handleNext = () => {
    if (!canContinue) return;
    if (unrouted.length > 0 && !showWarning) {
      setShowWarning(true);
      return;
    }
    next();
  };

  const destInboundGB = (destId: string) => sources.filter((s) => s.destinationIds.includes(destId)).reduce((a, s) => a + (s.volumeGBPerDay || 0), 0);

  return (
    <>
      <PageHeader
        eyebrow={<span className="chip chip--brand">Step 2 of 7</span>}
        title="Step 2: Sources & Destinations"
        description="Define your data sources and where they route to"
        actions={<ImportWorkspaceButton />}
      />

      <div className="stat-grid" aria-live="polite">
        <StatTile label="Total inbound" value={fmtGB(result.metrics.totalInboundGB)} sub={`${fmtNum(totalSystems)} systems sending data`} tone="accent" />
        <StatTile label="Source groups" value={sources.length} sub={sources.length === 1 ? '1 group defined' : `${sources.length} groups defined`} />
        <StatTile label="Destinations" value={destinations.length} sub={destinations.filter((d) => getDestinationType(d.type).isCribl).length > 0 ? 'Includes Cribl Lake' : 'External systems'} />
        <StatTile
          label="Routes"
          value={routeCount}
          sub={unrouted.length > 0 ? `${unrouted.length} source group${unrouted.length > 1 ? 's' : ''} unrouted` : sources.length > 0 ? 'Every source is routed' : 'No sources yet'}
          tone={unrouted.length > 0 ? 'warning' : 'default'}
        />
        <StatTile
          label="Est. fan-out"
          value={`${result.metrics.effectiveFanout.toFixed(2)}×`}
          sub={`${fmtGB(result.metrics.totalOutboundBeforeDropGB)} outbound before filtering`}
          hint="Average number of destinations each routed GB is delivered to. Every extra destination adds egress and Worker Node processing load."
          tone={result.metrics.effectiveFanout > 3 ? 'warning' : 'default'}
        />
      </div>

      <div className="in-split">
        {/* ── Sources ─────────────────────────────────────────── */}
        <Section
          icon={<Sources size="sm" />}
          title={
            <span className="in-inline-heading">
              Data Sources
              <InfoTip text="Define source groups with their volume, count, and location type. Each source can route to different destinations." />
            </span>
          }
          description="Add source groups that generate log data"
        >
          <div className="in-form">
            <SelectField<RichItem>
              label="Source Type"
              items={SOURCE_ITEMS}
              value={form.type}
              onChange={(v) => v != null && handleTypeChange(String(v))}
              helperText={def.description}
              leadingSlot={<SourceLogo type={form.type} size="sm" />}
              canSearch
              searchPlaceholder="Search source types"
            >
              {renderSourceItem}
            </SelectField>

            <div className="in-method">
              <span className="in-method__icon">
                <CircleInfo size="sm" />
              </span>
              <div className="in-method__body">
                <Text variant="body-sm-normal">
                  <strong>Auto-selected:</strong> {def.collectionMethod}
                  {needsLocation && (
                    <>
                      {' '}
                      — based on your answer below this source is treated as <strong>{CATEGORY_LABELS[resolvedCategory]}</strong>
                      {resolvedCategory === 'endpoint' ? ' (collected by Cribl Edge)' : ' (sent to a Syslog Source / API on the Worker Group)'}
                    </>
                  )}
                </Text>
                <Text variant="body-xs-normal" color="secondary">
                  {def.explanation}
                </Text>
                <span className="in-path">{def.routing}</span>
              </div>
            </div>

            <div className="in-form__row">
              <NumberField
                label="Count"
                min={1}
                value={form.count}
                helperText="Number of sources of this type (e.g., 15 Windows servers)"
                onChange={(v) => setForm((f) => ({ ...f, count: clampNum(v, 0, 10_000_000, 0) }))}
              />
              <NumberField
                label="GB/Day"
                min={0}
                value={form.volumeGBPerDay}
                helperText="Total data volume per day from all sources of this type"
                onChange={(v) => setForm((f) => ({ ...f, volumeGBPerDay: clampNum(v, 0, 10_000_000, 0) }))}
              />
            </div>

            <SelectField<RichItem>
              label="Processing Complexity"
              items={COMPLEXITY_ITEMS}
              value={form.complexity}
              onChange={(v) => v != null && setForm((f) => ({ ...f, complexity: v as Complexity }))}
              helperText={complexityDef?.description ?? 'Processing complexity should be validated during detailed design phase.'}
            >
              {renderRichItem}
            </SelectField>

            {needsLocation && (
              <SelectField
                label="How is this data generated?"
                items={LOCATION_ITEMS}
                value={form.locationType}
                onChange={(v) => v != null && setForm((f) => ({ ...f, locationType: v as LocationType }))}
                helperText="This determines the collection method for your custom source."
              />
            )}

            <Button variant="secondary" leadingIcon={Plus} block disabled={form.count <= 0 || form.volumeGBPerDay <= 0} onClick={handleAddSource}>
              Add Source Group
            </Button>
          </div>

          <div className="in-list">
            <div className="in-list__header">
              <Text variant="body-sm-semibold">
                {sources.length} source group{sources.length === 1 ? '' : 's'}
              </Text>
              {sources.length > 0 && (
                <Text variant="body-xs-normal" color="secondary">
                  {fmtGB(result.metrics.totalInboundGB)} total
                </Text>
              )}
            </div>
            {sources.map((s) => (
              <SourceRow
                key={s.id}
                source={s}
                destinations={destinations}
                onChange={(patch) => updateSource(s.id, patch)}
                onRemove={() => removeSource(s.id)}
              />
            ))}
            {sources.length === 0 && (
              <div className="in-empty">
                <Sources size="lg" />
                <Text variant="body-sm-normal">No sources added yet</Text>
              </div>
            )}
          </div>
        </Section>

        {/* ── Destinations ────────────────────────────────────── */}
        <Section
          icon={<Destinations size="sm" />}
          title={
            <span className="in-inline-heading">
              Destinations
              <InfoTip text="Define where your data will be sent. Each source can route to one or more destinations." />
            </span>
          }
          description="Add destinations for your data"
        >
          <div className="in-form">
            <SelectField<RichItem>
              label="Destination"
              items={DESTINATION_ITEMS}
              value={newDest}
              onChange={(v) => v != null && setNewDest(String(v))}
              helperText={destDef.description}
              leadingSlot={<DestinationLogo type={newDest} size="sm" />}
            >
              {renderDestinationItem}
            </SelectField>
            <Button variant="secondary" leadingIcon={Plus} block onClick={handleAddDestination}>
              Add Destination
            </Button>
          </div>

          <div className="in-list">
            <div className="in-list__header">
              <Text variant="body-sm-semibold">
                {destinations.length} destination{destinations.length === 1 ? '' : 's'}
              </Text>
            </div>
            {destinations.map((d) => {
              const routed = sources.filter((s) => s.destinationIds.includes(d.id)).length;
              const isCribl = getDestinationType(d.type).isCribl;
              return (
                <div key={d.id} className={`in-item ${routed === 0 && sources.length > 0 ? 'in-item--warning' : ''}`}>
                  <div className="in-item__head">
                    <span className="in-logo-box">
                      <DestinationLogo type={d.type} size="md" />
                    </span>
                    <div className="in-item__title">
                      <div className="in-item__title-row">
                        <Text variant="body-md-semibold">{destName(d)}</Text>
                        {isCribl && <span className="chip chip--brand">Cribl</span>}
                        {d.origin === 'imported' && <span className="chip chip--info">Imported</span>}
                      </div>
                      <Text variant="body-xs-normal" color="secondary">
                        {d.label && d.label !== destinationLabel(d.type) ? `${destinationLabel(d.type)} · ` : ''}
                        {routed === 0 ? 'No sources routed yet' : `${routed} source group${routed > 1 ? 's' : ''} · ${fmtGB(destInboundGB(d.id))} before filtering`}
                      </Text>
                    </div>
                    <IconButton icon={Trash} variant="tertiary" appearance="danger" aria-label={`Remove ${destName(d)}`} onClick={() => removeDestination(d.id)} />
                  </div>
                </div>
              );
            })}
            {destinations.length === 0 && (
              <div className="in-empty">
                <Destinations size="lg" />
                <Text variant="body-sm-normal">No destinations added yet</Text>
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* ── Routing matrix ──────────────────────────────────────── */}
      {canContinue ? (
        <Section
          icon={<Routes size="sm" />}
          title={
            <span className="in-inline-heading">
              Routing Configuration
              <InfoTip text="Map each source to its destination(s). Sources can route to different destinations - NOT all sources go to all destinations." />
            </span>
          }
          description="Define which sources route to which destinations (independent routing per source)"
        >
          <div className="in-table-scroll">
            <table className="data-table in-matrix">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  {destinations.map((d) => (
                    <th key={d.id} scope="col" className="in-matrix__dest">
                      <span className="in-matrix__dest-head">
                        <DestinationLogo type={d.type} size="sm" />
                        <Text variant="body-xs-semibold">{destName(d)}</Text>
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="in-matrix__dest">
                    Outbound
                  </th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const isUnrouted = s.destinationIds.length === 0;
                  return (
                    <tr key={s.id} className={isUnrouted ? 'is-unrouted' : ''}>
                      <td>
                        <div className="in-matrix__source">
                          <SourceLogo type={s.type} size="sm" />
                          <div>
                            <Text as="div" variant="body-sm-semibold">
                              {s.label || s.type}
                            </Text>
                            <Text as="div" variant="body-xs-normal" color="secondary">
                              {fmtNum(s.count)} sources • {fmtNum(s.volumeGBPerDay)} GB/day
                            </Text>
                          </div>
                        </div>
                      </td>
                      {destinations.map((d) => (
                        <td key={d.id} className="in-matrix__cell">
                          <div>
                            <Checkbox
                              checked={s.destinationIds.includes(d.id)}
                              onChange={() => toggleRoute(s.id, d.id)}
                              aria-label={`Route ${s.label || s.type} to ${destName(d)}`}
                            />
                          </div>
                        </td>
                      ))}
                      <td className="in-matrix__total">
                        {isUnrouted ? (
                          <span className="chip chip--warning">Not routed</span>
                        ) : (
                          <Text variant="body-sm-normal">{fmtGB(s.volumeGBPerDay * s.destinationIds.length)}</Text>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    <Text variant="body-xs-semibold" color="secondary">
                      Receives (before filtering)
                    </Text>
                  </td>
                  {destinations.map((d) => (
                    <td key={d.id} className="in-matrix__total">
                      <Text variant="body-xs-semibold">{fmtGB(destInboundGB(d.id))}</Text>
                    </td>
                  ))}
                  <td className="in-matrix__total">
                    <Text variant="body-xs-semibold">{fmtGB(result.metrics.totalOutboundBeforeDropGB)}</Text>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>
      ) : (
        <div className="in-empty">
          <Routes size="lg" />
          <Text variant="body-sm-normal">Add at least one source group and one destination to configure routing.</Text>
        </div>
      )}

      {warningActive && (
        <Alert appearance="warning" title="Warning: Sources Without Destinations">
          Some sources don't have any destinations selected. These sources will appear in the final architecture without any connections. You can continue, but make sure this is
          intentional. Unrouted: {unrouted.map((s) => s.label || s.type).join(', ')}.
        </Alert>
      )}

      <WizardFooter
        onBack={back}
        next={{ label: warningActive ? 'Proceed Anyway' : 'Next: Architecture Drivers', onClick: handleNext, disabled: !canContinue }}
      />
    </>
  );
}

function SourceRow({
  source: s,
  destinations,
  onChange,
  onRemove,
}: {
  source: SourceGroup;
  destinations: Destination[];
  onChange: (patch: Partial<SourceGroup>) => void;
  onRemove: () => void;
}) {
  const def = getSourceType(s.type);
  const category = categoryOf(s.type, s.locationType);
  const routed = destinations.filter((d) => s.destinationIds.includes(d.id));
  const locationDependent = def.category === null;
  const title = s.label || s.type;

  return (
    <div className={`in-item ${s.destinationIds.length === 0 && destinations.length > 0 ? 'in-item--warning' : ''}`}>
      <div className="in-item__head">
        <span className="in-logo-box">
          <SourceLogo type={s.type} size="md" />
        </span>
        <div className="in-item__title">
          <div className="in-item__title-row">
            <Text variant="body-md-semibold">{title}</Text>
            <span className={`chip ${CATEGORY_CHIP[category]}`}>{CATEGORY_LABELS[category]}</span>
            {s.origin === 'imported' && <span className="chip chip--info">Imported</span>}
          </div>
          <Text variant="body-xs-normal" color="secondary">
            {s.label && s.label !== s.type ? `${s.type} · ` : ''}
            {def.collectionMethod === 'To be determined' ? (category === 'endpoint' ? 'Cribl Edge' : 'Syslog / API') : def.collectionMethod}
          </Text>
        </div>
        <IconButton icon={Trash} variant="tertiary" appearance="danger" aria-label={`Remove ${title}`} onClick={onRemove} />
      </div>

      <div className={`in-item__fields ${locationDependent ? 'in-item__fields--4' : ''}`}>
        <NumberField label="Number of Sources" size="sm" min={1} value={s.count} onChange={(v) => onChange({ count: clampNum(v, 1, 10_000_000, 1) })} />
        <NumberField label="Volume (GB/day)" size="sm" min={0} value={s.volumeGBPerDay} onChange={(v) => onChange({ volumeGBPerDay: clampNum(v, 0, 10_000_000, 0) })} />
        <SelectField label="Processing" size="sm" items={COMPLEXITY_SHORT} value={s.complexity} onChange={(v) => v != null && onChange({ complexity: v as Complexity })} />
        {locationDependent && (
          <SelectField label="Generated" size="sm" items={LOCATION_SHORT} value={s.locationType} onChange={(v) => v != null && onChange({ locationType: v as LocationType })} />
        )}
      </div>

      <div className="in-item__meta">
        <Text variant="body-xs-normal" color="secondary">
          {s.locationType === 'distributed' ? 'Distributed' : 'Centralized'} • {COMPLEXITY_NOUN[s.complexity]} processing
        </Text>
        {destinations.length > 0 && (
          <span className="in-routes">
            <Text variant="body-xs-semibold" color="secondary">
              Routes to:
            </Text>
            {routed.length > 0 ? (
              routed.map((d) => (
                <span key={d.id} className="chip">
                  <DestinationLogo type={d.type} size="xs" />
                  {destName(d)}
                </span>
              ))
            ) : (
              <span className="chip chip--warning">None selected</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
