export interface StepDef {
  n: number;
  slug: string;
  title: string;
  short: string;
}

export const STEPS: StepDef[] = [
  { n: 1, slug: 'mode', title: 'Deployment Mode', short: 'Mode' },
  { n: 2, slug: 'sources', title: 'Sources & Destinations', short: 'Sources' },
  { n: 3, slug: 'drivers', title: 'Architecture Drivers', short: 'Drivers' },
  { n: 4, slug: 'features', title: 'Features & Persistent Queues', short: 'Features' },
  { n: 5, slug: 'architecture', title: 'Architecture', short: 'Architecture' },
  { n: 6, slug: 'plan', title: 'Deployment Plan', short: 'Plan' },
  { n: 7, slug: 'build', title: 'Build in Cribl', short: 'Build' },
];

export const stepBySlug = (slug?: string) => STEPS.find((s) => s.slug === slug);
export const stepPath = (designId: string, n: number) => `/designs/${designId}/${STEPS[n - 1].slug}`;
