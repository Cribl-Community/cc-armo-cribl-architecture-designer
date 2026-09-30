export const DOCS = {
  scaling: { label: 'Sizing and scaling', href: 'https://docs.cribl.io/stream/scaling/' },
  architecture: { label: 'Distributed deployment architecture', href: 'https://docs.cribl.io/stream/deploy-architecture/' },
  pq: { label: 'Persistent Queues', href: 'https://docs.cribl.io/stream/persistent-queues/' },
  ports: { label: 'Ports', href: 'https://docs.cribl.io/stream/ports/' },
  cloudWorkers: { label: 'Cribl-managed Worker Groups', href: 'https://docs.cribl.io/stream/cloud-workers/' },
  fleets: { label: 'Edge Fleet management', href: 'https://docs.cribl.io/edge/fleet-management/' },
  secondLeader: { label: 'Leader high availability', href: 'https://docs.cribl.io/stream/deploy-add-second-leader/' },
} as const;

export type DocKey = keyof typeof DOCS;
