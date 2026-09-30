import type { ReactNode } from 'react';
import { Text } from '@capra/core';
import { AppsOutlined, CircleCheck, CircleXmark, SecurityScan } from '@capra/icons';
import { GUARD_DESCRIPTION } from '../../../model/catalog';
import type { ArchitectureResult, Design } from '../../../model/types';
import { Section, fmtNum } from '../../../ui/layout';
import { ProductLogo } from '../../../ui/logos';
import { plural } from './format';

type FeatureKey = 'stream' | 'edge' | 'lake' | 'search' | 'guard';

interface FeatureRow {
  key: FeatureKey;
  name: string;
  tagline: string;
  available: boolean;
  used: boolean;
  /** Why it is used (detail) or why it is not (reason). */
  detail: string;
}

function FeatureIcon({ k }: { k: FeatureKey }) {
  if (k === 'guard') {
    return (
      <span className="arch-feature__guard" aria-hidden>
        <SecurityScan size="sm" />
      </span>
    );
  }
  return <ProductLogo product={k} size="lg" />;
}

function buildFeatureRows(design: Design, result: ArchitectureResult): FeatureRow[] {
  const arch = result.architecture;
  const onPrem = design.drivers.deploymentModel === 'on-prem';
  const cloudLabel = design.drivers.deploymentModel === 'cloud' ? 'Cloud' : 'Hybrid';
  const lakeDest = design.destinations.find((d) => d.type === 'Cribl Lake');
  const retention = design.lakeRetentionDays?.trim();
  const retentionText = retention && retention.toLowerCase() !== 'unknown' ? `${retention} days retention` : 'retention TBD';
  const lakeSources = lakeDest ? design.sources.filter((s) => s.destinationIds.includes(lakeDest.id)).length : 0;

  return [
    {
      key: 'stream',
      name: 'Cribl Stream',
      tagline: 'Core data processing and routing engine',
      available: true,
      used: true,
      detail: `Core processing engine, always required: ${plural(arch.workerGroups.length, 'Worker Group')} routing ${plural(design.sources.length, 'source group')} to ${plural(design.destinations.length, 'Destination')}.`,
    },
    {
      key: 'edge',
      name: 'Cribl Edge',
      tagline: 'Distributed collection and pre-processing on endpoints',
      available: true, // Edge is always licensable; it is simply not needed without endpoint sources
      used: arch.usedFeatures.edge,
      detail: arch.usedFeatures.edge
        ? `Collecting from ${fmtNum(result.metrics.totalEdgeNodes)} endpoints in ${plural(arch.edgeFleets.length, 'Edge Fleet')}.`
        : 'No distributed endpoint sources detected (Windows, Linux, Kubernetes, application hosts).',
    },
    {
      key: 'lake',
      name: 'Cribl Lake',
      tagline: 'Cost-effective storage with built-in search',
      available: arch.availableFeatures.lake,
      used: arch.usedFeatures.lake,
      detail: arch.usedFeatures.lake
        ? `Storage Destination for ${plural(lakeSources, 'source group')} · ${retentionText}.`
        : onPrem
          ? 'Cribl Lake runs in Cribl.Cloud and is not available with the On-Premises deployment model.'
          : lakeDest
            ? 'Selected as a Destination but no sources are routed to it.'
            : 'Not selected as a Destination.',
    },
    {
      key: 'search',
      name: 'Cribl Search',
      tagline: 'Federated search across Cribl Lake and data at rest',
      available: arch.availableFeatures.search,
      used: arch.usedFeatures.search,
      detail: arch.usedFeatures.search
        ? `Enabled in your Cribl.Cloud Workspace (available with ${cloudLabel} deployment).`
        : onPrem
          ? 'Requires a Cloud or Hybrid deployment: Cribl Search runs in Cribl.Cloud.'
          : `Available with ${cloudLabel} deployment, but not enabled in Features & Persistent Queues.`,
    },
    {
      key: 'guard',
      name: 'Cribl Guard',
      tagline: 'Sensitive-data detection and masking (Enterprise)',
      available: arch.availableFeatures.guard,
      used: arch.usedFeatures.guard,
      detail: arch.usedFeatures.guard ? GUARD_DESCRIPTION : 'Not enabled in Features & Persistent Queues.',
    },
  ];
}

function StatusChip({ row }: { row: FeatureRow }) {
  if (row.used) return <span className="chip chip--success">Used</span>;
  if (row.available) return <span className="chip">Available</span>;
  return <span className="chip chip--danger">Not available</span>;
}

function FeatureList({ title, icon, rows, tone, empty }: { title: string; icon: ReactNode; rows: FeatureRow[]; tone: 'used' | 'unused'; empty: string }) {
  return (
    <div className="stack stack--sm">
      <div className={`arch-feature-list__title arch-feature-list__title--${tone}`}>
        {icon}
        <Text variant="body-md-semibold">{title}</Text>
      </div>
      {rows.length === 0 ? (
        <Text as="p" variant="body-sm-normal" color="secondary">
          {empty}
        </Text>
      ) : (
        rows.map((r) => (
          <div key={r.key} className={`arch-feature-item arch-feature-item--${tone}`}>
            <span className="arch-feature-item__icon">{tone === 'used' ? <CircleCheck size="sm" /> : <CircleXmark size="sm" />}</span>
            <div>
              <Text as="div" variant="body-sm-semibold">
                {r.name}
              </Text>
              <Text as="div" variant="body-xs-normal" color="secondary">
                {r.detail}
              </Text>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function FeaturesSection({ design, result }: { design: Design; result: ArchitectureResult }) {
  const rows = buildFeatureRows(design, result);
  const used = rows.filter((r) => r.used);
  const unused = rows.filter((r) => !r.used);
  return (
    <Section title="Cribl features" icon={<AppsOutlined size="sm" />} description="The Cribl product suite for this design: what the architecture uses, and why the rest is left out.">
      <div className="arch-suite">
        {rows.map((r) => (
          <div key={r.key} className={`arch-feature${r.used ? ' arch-feature--used' : ''}${!r.available ? ' arch-feature--na' : ''}`}>
            <div className="arch-feature__head">
              <FeatureIcon k={r.key} />
              <StatusChip row={r} />
            </div>
            <Text as="div" variant="body-md-semibold">
              {r.name}
            </Text>
            <Text as="div" variant="body-xs-normal" color="secondary">
              {r.tagline}
            </Text>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <FeatureList title="Used in this architecture" icon={<CircleCheck size="sm" />} rows={used} tone="used" empty="Only Cribl Stream is used (core requirement)." />
        <FeatureList title="Not used in this architecture" icon={<CircleXmark size="sm" />} rows={unused} tone="unused" empty="All Cribl features are used." />
      </div>
    </Section>
  );
}
