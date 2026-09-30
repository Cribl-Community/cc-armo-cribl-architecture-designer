import { getSourceType } from './catalog';
import type { Design, Destination, SourceGroup } from './types';

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const todayIso = () => new Date().toISOString().split('T')[0];

export function blankDesign(name = 'Untitled design'): Design {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name,
    customer: '',
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    mode: 'production',
    sources: [],
    destinations: [],
    drivers: {
      deploymentModel: 'hybrid',
      workerGroupStrategy: 'single',
      nodeSize: 'medium',
      cpuArch: 'x86',
      peakFactor: 2,
      filteringDropPercent: 0,
      applyComplexityHeadroom: true,
      pqOutageHours: 4,
    },
    features: { search: false, guard: false },
    lakeRetentionDays: '',
    plan: {
      startDate: todayIso(),
      optimistic: false,
      showParties: false,
      parties: ['Client', 'Cribl Team', 'Network Team', 'Cloud Team'],
      categoryParties: {},
      checkedSteps: {},
      stepEffort: {},
      hoursPerDay: 8,
    },
    maxStepReached: 1,
  };
}

export function makeSource(partial: Partial<SourceGroup> & { type: string }): SourceGroup {
  const def = getSourceType(partial.type);
  return {
    id: newId(),
    count: 10,
    volumeGBPerDay: 100,
    complexity: 'medium',
    locationType: def.defaultLocation ?? 'centralized',
    destinationIds: [],
    pq: 'off',
    origin: 'manual',
    ...partial,
  };
}

export function makeDestination(partial: Partial<Destination> & { type: string }): Destination {
  return { id: newId(), backpressure: 'pq', origin: 'manual', ...partial };
}

/** A realistic enterprise SOC design used for demos and first-run exploration. */
export function sampleDesign(): Design {
  const d = blankDesign('Acme Corp — SOC modernization');
  d.customer = 'Acme Corp';
  const splunk = makeDestination({ type: 'Splunk' });
  const sentinel = makeDestination({ type: 'Microsoft Sentinel' });
  const s3 = makeDestination({ type: 'S3', backpressure: 'block' });
  const lake = makeDestination({ type: 'Cribl Lake' });
  d.destinations = [splunk, sentinel, s3, lake];
  d.sources = [
    makeSource({ type: 'Windows', count: 2500, volumeGBPerDay: 600, complexity: 'medium', destinationIds: [sentinel.id, lake.id], pq: 'smart' }),
    makeSource({ type: 'Linux', count: 900, volumeGBPerDay: 350, complexity: 'light', destinationIds: [splunk.id, lake.id] }),
    makeSource({ type: 'Kubernetes', count: 6, volumeGBPerDay: 500, complexity: 'medium', destinationIds: [splunk.id] }),
    makeSource({ type: 'Firewall', count: 40, volumeGBPerDay: 1200, complexity: 'heavy', destinationIds: [sentinel.id, s3.id], pq: 'always' }),
    makeSource({ type: 'Cloud (AWS/Azure/GCP)', count: 3, volumeGBPerDay: 700, complexity: 'light', destinationIds: [s3.id, lake.id] }),
    makeSource({ type: 'SaaS Application', count: 12, volumeGBPerDay: 60, complexity: 'light', destinationIds: [sentinel.id] }),
  ];
  d.drivers = { ...d.drivers, workerGroupStrategy: 'multiple', peakFactor: 1.5, filteringDropPercent: 35 };
  d.features = { search: true, guard: true };
  d.lakeRetentionDays = '365';
  d.maxStepReached = 7;
  return d;
}
