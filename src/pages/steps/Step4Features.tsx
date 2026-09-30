import type { ReactNode } from 'react';
import { Button, NumberField, SelectField, Switch, Text, TextField } from '@capra/core';
import { ClockOutlined, HardDrive, Lightbulb, Packs, SecurityScan, StorageFilled } from '@capra/icons';
import { GUARD_DESCRIPTION, SIZING_RULES, destinationLabel } from '../../model/catalog';
import type { Backpressure, Destination, SourceGroup, SourcePQMode } from '../../model/types';
import { useDesign } from '../../state/DesignStore';
import { Callout, InfoTip, PageHeader, Section, StatTile, WizardFooter, fmtGB, fmtNum } from '../../ui/layout';
import { DestinationLogo, ProductLogo, SourceLogo } from '../../ui/logos';
import { useStepNav } from '../../ui/useStepNav';
import { clampNum } from './inputs/num';
import { TipField, TipHeading } from './inputs/shared';
import './inputs/inputs.css';

type RichItem = { id: string; label: string; description: string };

const PQ_OPTIONS: (RichItem & { id: SourcePQMode })[] = [
  { id: 'off', label: 'Off', description: 'No source-side buffering. Data is protected only by the Destination backpressure behavior below.' },
  { id: 'smart', label: 'Smart', description: 'Engages PQ only when downstream backpressure is detected, then drains automatically. Minimal disk I/O in normal operation.' },
  { id: 'always', label: 'Always On', description: 'Writes all incoming events to disk before processing. Maximum durability, with more disk I/O and slight added latency.' },
];

const BACKPRESSURE_OPTIONS: (RichItem & { id: Backpressure })[] = [
  { id: 'block', label: 'Block', description: 'Blocks Cribl pipeline until destination recovers. May cause upstream backpressure.' },
  { id: 'drop', label: 'Drop Events', description: 'Drops data when destination is unavailable. Data loss may occur.' },
  { id: 'pq', label: 'Persistent Queue (Recommended)', description: 'Buffers data to disk inside Cribl during outages. Prevents data loss (recommended).' },
];

const renderRichItem = (item: RichItem) => (
  <SelectField.Item id={item.id} textValue={item.label}>
    <span className="in-option__text">
      <span className="in-option__label">{item.label}</span>
      <span className="in-option__desc">{item.description}</span>
    </span>
  </SelectField.Item>
);

const RETENTION_PRESETS = [
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
  { label: '1 year', value: '365' },
  { label: 'Unknown', value: 'unknown' },
];

const fmtSize = (gb: number) =>
  gb >= 1024 * 1024 ? `${(gb / 1024 / 1024).toFixed(1)} PB` : gb >= 1024 ? `${(gb / 1024).toFixed(1)} TB` : `${Math.round(gb).toLocaleString()} GB`;

type ChipTone = '' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'highlight';

function ProductCard({
  logo,
  name,
  status,
  tone,
  state,
  children,
  control,
}: {
  logo: ReactNode;
  name: string;
  status: string;
  tone: ChipTone;
  state: 'on' | 'neutral' | 'off';
  children: ReactNode;
  control?: ReactNode;
}) {
  return (
    <div className={`in-product ${state === 'on' ? 'in-product--on' : state === 'off' ? 'in-product--off' : ''}`}>
      <div className="in-product__head">
        {logo}
        <div className="in-product__name">
          <Text variant="body-md-semibold">{name}</Text>
        </div>
        <span className={`chip ${tone ? `chip--${tone}` : ''}`}>{status}</span>
      </div>
      <Text variant="body-sm-normal" color="secondary">
        {children}
      </Text>
      {control && <div className="in-product__foot">{control}</div>}
    </div>
  );
}

export default function Step4Features() {
  const { design, result, set, setDrivers, updateSource, updateDestination } = useDesign();
  const { next, back } = useStepNav(4);
  const { sources, destinations, drivers, features } = design;
  const { architecture, metrics } = result;

  const onPrem = drivers.deploymentModel === 'on-prem';
  const isCloud = drivers.deploymentModel === 'cloud';
  const lakeDests = destinations.filter((d) => d.type === 'Cribl Lake');
  const hasLake = lakeDests.length > 0;
  const lakeRoutedSources = sources.filter((s) => lakeDests.some((d) => s.destinationIds.includes(d.id)));
  const lakeDailyGB = lakeRoutedSources.reduce((a, s) => a + (s.volumeGBPerDay || 0) * lakeDests.filter((d) => s.destinationIds.includes(d.id)).length, 0) * metrics.dropFactor;
  const retentionNum = Number.parseInt(design.lakeRetentionDays, 10);
  const retentionKnown = Number.isFinite(retentionNum) && retentionNum > 0;

  const destName = (d: Destination) => d.label || destinationLabel(d.type);
  const srcName = (s: SourceGroup) => s.label || s.type;
  const pqSources = sources.filter((s) => s.pq !== 'off').length;
  const pqDests = destinations.filter((d) => d.backpressure === 'pq').length;

  // ── Product cards ─────────────────────────────────────────
  const lakeStatus = onPrem
    ? { status: 'Disabled', tone: 'danger' as ChipTone, state: 'off' as const, text: 'Not available in On-Prem deployments' }
    : architecture.usedFeatures.lake
      ? { status: 'In use', tone: 'success' as ChipTone, state: 'on' as const, text: `Open data lake for long-term storage and analytics. Receiving data from ${lakeRoutedSources.length} source group${lakeRoutedSources.length === 1 ? '' : 's'}.` }
      : hasLake
        ? { status: 'Not routed', tone: 'warning' as ChipTone, state: 'neutral' as const, text: 'Open data lake for long-term storage and analytics. A Cribl Lake destination exists but no sources route to it yet (Step 2).' }
        : { status: 'Available', tone: 'info' as ChipTone, state: 'neutral' as const, text: 'Open data lake for long-term storage and analytics. Add a Cribl Lake destination in Step 2 to use it.' };

  return (
    <>
      <PageHeader
        eyebrow={<span className="chip chip--brand">Step 4 of 7</span>}
        title="Step 4: Features & Persistent Queues"
        description="Select Cribl features and configure Persistent Queue settings"
      />

      {/* ── Cribl products ──────────────────────────────────────── */}
      <Section
        icon={<Packs size="sm" />}
        title={
          <span className="in-inline-heading">
            Cribl Features
            <InfoTip text="Available features depend on your deployment model. On-Prem deployments cannot use cloud-managed features." />
          </span>
        }
        description="Select which Cribl products to include in your architecture"
      >
        <div className="in-products">
          <ProductCard logo={<ProductLogo product="stream" size="lg" />} name="Cribl Stream" status="Always Enabled" tone="success" state="on">
            Core data routing and processing engine. Required for all deployments.
          </ProductCard>

          <ProductCard
            logo={<ProductLogo product="edge" size="lg" />}
            name="Cribl Edge"
            status={architecture.useEdge ? 'Auto-Enabled' : 'Not Needed'}
            tone={architecture.useEdge ? 'success' : ''}
            state={architecture.useEdge ? 'on' : 'off'}
          >
            {architecture.useEdge
              ? `Enabled automatically for distributed sources (endpoints, K8s): ${fmtNum(metrics.totalEdgeNodes)} Edge Nodes in ${architecture.edgeFleets.length} Fleet${architecture.edgeFleets.length === 1 ? '' : 's'}.`
              : 'No distributed sources detected. Edge not required.'}
          </ProductCard>

          <ProductCard logo={<ProductLogo product="lake" size="lg" />} name="Cribl Lake" status={lakeStatus.status} tone={lakeStatus.tone} state={lakeStatus.state}>
            {lakeStatus.text}
          </ProductCard>

          <ProductCard
            logo={<ProductLogo product="search" size="lg" />}
            name="Cribl Search"
            status={onPrem ? 'Disabled' : features.search ? 'Enabled' : 'Available'}
            tone={onPrem ? 'danger' : features.search ? 'success' : 'info'}
            state={onPrem ? 'off' : features.search ? 'on' : 'neutral'}
            control={
              <>
                <Text variant="body-xs-semibold" color="secondary">
                  Include Cribl Search
                </Text>
                <Switch aria-label="Include Cribl Search" checked={features.search && !onPrem} disabled={onPrem} onChange={(e) => set({ features: { ...features, search: e.target.checked } })} />
              </>
            }
          >
            {onPrem ? 'Not available in On-Prem deployments' : 'Federated search across all your data destinations'}
          </ProductCard>

          <ProductCard
            logo={
              <span className="in-product__glyph">
                <SecurityScan size="md" />
              </span>
            }
            name="Cribl Guard"
            status={features.guard ? 'Enabled' : 'Enterprise'}
            tone={features.guard ? 'success' : 'highlight'}
            state={features.guard ? 'on' : 'neutral'}
            control={
              <>
                <Text variant="body-xs-semibold" color="secondary">
                  Include Cribl Guard (Enterprise plan)
                </Text>
                <Switch aria-label="Include Cribl Guard" checked={features.guard} onChange={(e) => set({ features: { ...features, guard: e.target.checked } })} />
              </>
            }
          >
            {GUARD_DESCRIPTION}
          </ProductCard>
        </div>
      </Section>

      {/* ── Cribl Lake retention ────────────────────────────────── */}
      {hasLake && !onPrem && (
        <Section
          icon={<ClockOutlined size="sm" />}
          title={
            <span className="in-inline-heading">
              Cribl Lake Configuration
              <InfoTip text="Define retention period for data stored in Cribl Lake. This impacts storage costs and compliance requirements." />
            </span>
          }
          description="Configure Cribl Lake retention settings"
        >
          <div className="in-disk-layout">
            <div className="stack">
              <TipField label="Retention Period (Days)" tip="How long data is stored in Cribl Lake. Should align with compliance and investigation requirements.">
                <TextField
                  aria-label="Retention Period (Days)"
                  placeholder="e.g., 90, 365, or 'unknown'"
                  value={design.lakeRetentionDays}
                  onChange={(v) => set({ lakeRetentionDays: v })}
                  trailingSlot={<span className="muted">days</span>}
                />
              </TipField>
              <div className="in-presets" role="group" aria-label="Retention presets">
                {RETENTION_PRESETS.map((p) => (
                  <Button key={p.value} size="sm" variant={design.lakeRetentionDays.trim().toLowerCase() === p.value ? 'primary' : 'tertiary'} onClick={() => set({ lakeRetentionDays: p.value })}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="stack">
              <Text variant="body-sm-normal" color="secondary">
                Retention period defines how long data is stored in Cribl Lake. This impacts storage cost and should align with compliance and investigation requirements.
              </Text>
              <div className="stat-grid">
                <StatTile label="Into Lake" value={fmtGB(lakeDailyGB)} sub="After filtering / drop" />
                <StatTile
                  label="Retained (raw)"
                  value={retentionKnown ? fmtSize(lakeDailyGB * retentionNum) : 'To be defined'}
                  sub={retentionKnown ? `${fmtNum(retentionNum)} days, before Lake compression` : 'Set a retention period'}
                  tone={retentionKnown ? 'default' : 'warning'}
                />
              </div>
              <Callout tone="warning">
                <strong>Note:</strong> If retention is unknown, enter &quot;unknown&quot; or leave blank. This will generate a warning that the parameter should be validated during
                detailed design.
              </Callout>
            </div>
          </div>
        </Section>
      )}

      {/* ── Persistent Queues ───────────────────────────────────── */}
      <Section
        icon={<HardDrive size="sm" />}
        title={
          <span className="in-inline-heading">
            Data Reliability Requirement
            <InfoTip text="Determines Persistent Queue (PQ) configuration inside Cribl Stream workers. PQ buffers data during downstream outages to prevent data loss." />
          </span>
        }
        description="How critical is it to avoid data loss during outages?"
        actions={
          <div className="row">
            <span className={`chip ${pqSources > 0 ? 'chip--success' : ''}`}>
              Source PQ: {pqSources}/{sources.length}
            </span>
            <span className={`chip ${pqDests > 0 ? 'chip--success' : ''}`}>
              Destination PQ: {pqDests}/{destinations.length}
            </span>
          </div>
        }
      >
        <Callout tone="accent" title="Understanding Persistent Queue (PQ)">
          <div className="stack stack--sm">
          <p>
            Persistent Queue (PQ) is configured <strong>inside Cribl Stream workers</strong> to buffer data on disk when downstream systems are unavailable or slow. It prevents data
            loss but uses disk space and may add slight latency.
          </p>
          <p>
            <strong>Important:</strong> PQ is a Cribl feature, not configured on external systems like Splunk or Sentinel. It protects data at the source and destination pipelines
            within Cribl.
          </p>
          </div>
        </Callout>

        {sources.length > 0 && (
          <div className="stack">
            <TipHeading tip="Enable PQ to buffer data inside Cribl Stream workers when downstream systems are unavailable. Prevents data loss.">Enable Persistent Queue per Source</TipHeading>
            {isCloud && (
              <Callout tone="info" title="Cribl-managed Worker Groups">
                Cribl-managed Worker Groups support Source PQ in Always On mode only. Smart mode requires a customer-managed (Hybrid or On-Prem) Worker Group.
              </Callout>
            )}
            <div className="in-list">
              {sources.map((s) => {
                const opt = PQ_OPTIONS.find((o) => o.id === s.pq) ?? PQ_OPTIONS[0];
                return (
                  <div key={s.id} className="in-pq-row">
                    <div className="in-pq-row__who">
                      <span className="in-logo-box in-logo-box--sm">
                        <SourceLogo type={s.type} size="sm" />
                      </span>
                      <div className="in-item__title">
                        <Text variant="body-sm-semibold">{srcName(s)}</Text>
                        <Text variant="body-xs-normal" color="secondary">
                          {fmtNum(s.count)} sources • {fmtNum(s.volumeGBPerDay)} GB/day
                        </Text>
                      </div>
                    </div>
                    <SelectField<RichItem>
                      aria-label={`Persistent Queue mode for ${srcName(s)}`}
                      size="sm"
                      items={PQ_OPTIONS}
                      value={s.pq}
                      onChange={(v) => v != null && updateSource(s.id, { pq: v as SourcePQMode })}
                    >
                      {renderRichItem}
                    </SelectField>
                    <div className="in-pq-row__desc">
                      <span className={`chip ${s.pq === 'off' ? '' : 'chip--success'}`}>{s.pq === 'off' ? 'No Source PQ' : `PQ ${opt.label}`}</span>
                      {isCloud && s.pq === 'smart' && <span className="chip chip--warning">Not supported on Cribl-managed groups</span>}
                      <Text variant="body-xs-normal" color="secondary">
                        {opt.description}
                      </Text>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="in-hint">
              <Lightbulb size="xs" />
              <Text variant="body-xs-normal">Recommended for production deployments to prevent data loss during downstream outages.</Text>
            </div>
          </div>
        )}

        <Callout tone="warning" title="Destination Backpressure Handling">
          <div className="stack stack--sm">
          <p>
            PQ for destinations is configured <strong>inside Cribl Stream</strong> on the destination pipelines, not on external systems. When a destination (e.g., Splunk,
            Sentinel) is slow or unavailable, Cribl workers can buffer data to disk (PQ), block ingestion, or drop data.
          </p>
          <p>
            <strong>Recommendation:</strong> For production deployments with high data reliability requirements, enable PQ on critical destination pipelines. This will be
            configured during detailed design based on the reliability requirements selected above.
          </p>
          </div>
        </Callout>

        {destinations.length > 0 && (
          <div className="stack">
            <TipHeading tip="Configure PQ on Cribl Destinations (sending to external systems). PQ exists inside Cribl, not on Splunk/Sentinel/etc.">
              Cribl Destination PQ Configuration
            </TipHeading>
            <div className="in-list">
              {destinations.map((d) => {
                const opt = BACKPRESSURE_OPTIONS.find((o) => o.id === d.backpressure) ?? BACKPRESSURE_OPTIONS[2];
                return (
                  <div key={d.id} className="in-pq-row">
                    <div className="in-pq-row__who">
                      <span className="in-logo-box in-logo-box--sm">
                        <DestinationLogo type={d.type} size="sm" />
                      </span>
                      <div className="in-item__title">
                        <Text variant="body-sm-semibold">Cribl Destination → {destName(d)}</Text>
                        <Text variant="body-xs-normal" color="secondary">
                          PQ buffers data inside Cribl when {destName(d)} is unavailable
                        </Text>
                      </div>
                    </div>
                    <SelectField<RichItem>
                      aria-label={`Backpressure behavior for ${destName(d)}`}
                      size="sm"
                      items={BACKPRESSURE_OPTIONS}
                      value={d.backpressure}
                      onChange={(v) => v != null && updateDestination(d.id, { backpressure: v as Backpressure })}
                    >
                      {renderRichItem}
                    </SelectField>
                    <div className="in-pq-row__desc">
                      <span className={`chip ${d.backpressure === 'pq' ? 'chip--success' : d.backpressure === 'drop' ? 'chip--danger' : 'chip--warning'}`}>{opt.label.replace(' (Recommended)', '')}</span>
                      <Text variant="body-xs-normal" color="secondary">
                        {opt.description}
                      </Text>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      {/* ── PQ disk sizing ─────────────────────────────────────── */}
      <Section
        icon={<StorageFilled size="sm" />}
        title="Persistent Queue Disk Sizing"
        description="Disk each Worker Node needs so PQ can absorb a downstream outage, based on the Source and Destination PQ settings above."
      >
        <div className="in-disk-layout">
          <div className="stack">
            <NumberField
              label="Outage to absorb (hours)"
              min={1}
              max={168}
              step={1}
              value={drivers.pqOutageHours}
              onChange={(v) => setDrivers({ pqOutageHours: clampNum(v, 1, 168, 4) })}
              helperText="How long a downstream outage PQ must buffer without losing data. Common targets are 4–24 hours."
            />
            <Text variant="body-xs-normal" color="secondary">
              Hourly volume of every PQ-enabled Source and Destination × outage hours, spread across the Worker Nodes still running with HA spares down. Recommended disk adds
              Cribl&apos;s {SIZING_RULES.minFreeDiskGB} GB minimum free space and ~20 GB for the OS and Cribl install, rounded up.
            </Text>
          </div>
          <div className="in-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Worker Group</th>
                  <th scope="col">Worker Nodes</th>
                  <th scope="col">PQ disk / node</th>
                  <th scope="col">Recommended disk / node</th>
                </tr>
              </thead>
              <tbody>
                {architecture.workerGroups.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <div className="in-group__row">
                        <span className="in-group__letter">{g.letter}</span>
                        <Text variant="body-sm-semibold">{g.name}</Text>
                      </div>
                    </td>
                    {g.managedBy === 'cribl' ? (
                      <td colSpan={3}>
                        <span className="chip chip--info">Managed by Cribl</span>{' '}
                        <Text variant="body-xs-normal" color="secondary">
                          Cribl.Cloud provisions PQ storage for Cribl-managed Worker Groups.
                        </Text>
                      </td>
                    ) : (
                      <>
                        <td>
                          <Text variant="body-sm-normal">{g.nodes}</Text>
                        </td>
                        <td>
                          <Text variant="body-sm-semibold">{g.pqDiskPerNodeGB > 0 ? `${fmtNum(g.pqDiskPerNodeGB)} GB` : 'No PQ'}</Text>
                        </td>
                        <td>
                          <Text variant="body-sm-semibold" color="accent">
                            {fmtNum(g.recommendedDiskPerNodeGB)} GB
                          </Text>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <WizardFooter onBack={back} next={{ label: 'Generate Architecture', onClick: next }} />
    </>
  );
}
