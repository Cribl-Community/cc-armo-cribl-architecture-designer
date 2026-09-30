export type Mode = 'poc' | 'production';
export type DeploymentModel = 'on-prem' | 'hybrid' | 'cloud';
export type Complexity = 'light' | 'medium' | 'heavy' | 'unknown';
export type LocationType = 'distributed' | 'centralized';
export type SourceCategory = 'endpoint' | 'network' | 'cloud';
export type CpuArch = 'x86' | 'arm';
export type WorkerGroupStrategy = 'single' | 'multiple';
export type NodeSize = 'small' | 'medium' | 'large' | 'xlarge';
export type SourcePQMode = 'off' | 'smart' | 'always';
export type Backpressure = 'block' | 'drop' | 'pq';
export type DecisionType = 'recommended' | 'best_practice' | 'optional' | 'required';
export type Severity = 'info' | 'warning';
export type Origin = 'manual' | 'imported';

export interface SourceGroup {
  id: string;
  type: string;
  count: number;
  volumeGBPerDay: number;
  complexity: Complexity;
  locationType: LocationType;
  destinationIds: string[];
  pq: SourcePQMode;
  origin?: Origin;
  /** Free-text name, e.g. the imported Cribl Source id. */
  label?: string;
}

export interface Destination {
  id: string;
  type: string;
  backpressure: Backpressure;
  origin?: Origin;
  label?: string;
}

export interface Drivers {
  deploymentModel: DeploymentModel;
  workerGroupStrategy: WorkerGroupStrategy;
  nodeSize: NodeSize;
  cpuArch: CpuArch;
  peakFactor: number;
  filteringDropPercent: number;
  /** Apply processing-complexity headroom as a sizing multiplier (otherwise warning only). */
  applyComplexityHeadroom: boolean;
  /** Downstream outage the Persistent Queue must absorb, in hours. */
  pqOutageHours: number;
}

export type EffortUnit = 'h' | 'min';

export interface StepEffort {
  value: number;
  unit: EffortUnit;
}

export interface PlanState {
  startDate: string;
  optimistic: boolean;
  showParties: boolean;
  parties: string[];
  categoryParties: Record<string, string[]>;
  checkedSteps: Record<string, boolean>;
  /** Effort entered per plan step. Optional so designs saved before this field existed still load. */
  stepEffort?: Record<string, StepEffort>;
  /** Working hours in one project day, used to turn step effort into category days. */
  hoursPerDay?: number;
}

export interface ImportSnapshot {
  importedAt: string;
  workspaceLabel: string;
  groups: {
    id: string;
    name: string;
    onPrem: boolean;
    isFleet: boolean;
    workerCount: number;
    totalVcpus: number;
  }[];
  dailyInGB: number | null;
  dailyOutGB: number | null;
  sample: boolean;
}

export interface Design {
  id: string;
  name: string;
  customer: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
  mode: Mode;
  sources: SourceGroup[];
  destinations: Destination[];
  drivers: Drivers;
  features: { search: boolean; guard: boolean };
  lakeRetentionDays: string;
  plan: PlanState;
  maxStepReached: number;
  importSnapshot?: ImportSnapshot;
}

export interface NodeProfile {
  size: NodeSize;
  arch: CpuArch;
  label: string;
  vcpus: number;
  reservedVcpus: number;
  workerProcesses: number;
  gbPerDayPerVcpu: number;
  capacityGBPerDay: number;
  ramGB: number;
  baseDiskGB: number;
  description: string;
  useCases: string[];
  pros: string[];
  cons: string[];
  recommended: boolean;
}

export interface PortSpec {
  port: number | string;
  protocol: string;
  purpose: string;
  direction: string;
}

export interface WorkerGroupResult {
  id: string;
  letter: string;
  name: string;
  category: SourceCategory | 'all';
  managedBy: 'customer' | 'cribl';
  sources: SourceGroup[];
  destinationIds: string[];
  inboundGB: number;
  outboundGB: number;
  throughputGB: number;
  weightedThroughputGB: number;
  peakGB: number;
  profile: NodeProfile;
  nodesForCapacity: number;
  haSpareNodes: number;
  haFloorApplied: boolean;
  nodes: number;
  totalVcpus: number;
  totalWorkerProcesses: number;
  capacityGB: number;
  capacityWithSpareDownGB: number;
  peakUtilizationPct: number;
  pqDiskPerNodeGB: number;
  recommendedDiskPerNodeGB: number;
  usesLoadBalancer: boolean;
  ingressPorts: PortSpec[];
  cloudTierTBPerDay: number | null;
}

export interface Decision {
  decision: string;
  outcome: string;
  reason: string;
  type: DecisionType;
}

export interface Warning {
  title: string;
  message: string;
  recommendation?: string;
  severity: Severity;
}

export interface Insight {
  title: string;
  content: string;
}

export interface SourceThroughputRow {
  sourceId: string;
  type: string;
  inGB: number;
  destinations: number;
  outGB: number;
  throughputGB: number;
  complexityFactor: number;
  weightedGB: number;
  peakGB: number;
}

export interface ArchitectureResult {
  metrics: {
    totalInboundGB: number;
    routedInboundGB: number;
    totalOutboundBeforeDropGB: number;
    totalOutboundGB: number;
    totalThroughputGB: number;
    weightedThroughputGB: number;
    peakThroughputGB: number;
    effectiveFanout: number;
    dropFactor: number;
    vcpusRequired: number;
    nodesForCapacity: number;
    totalNodes: number;
    totalVcpus: number;
    totalWorkerProcesses: number;
    totalEdgeNodes: number;
    perSource: SourceThroughputRow[];
  };
  architecture: {
    mode: Mode;
    deploymentModel: DeploymentModel;
    useDistributed: boolean;
    useEdge: boolean;
    useLB: boolean;
    leaderHA: boolean;
    useManagedLeader: boolean;
    profile: NodeProfile;
    workerGroups: WorkerGroupResult[];
    categorizedSources: Record<SourceCategory, SourceGroup[]>;
    edgeFleets: { name: string; sourceId: string; type: string; nodes: number }[];
    availableFeatures: { stream: true; edge: boolean; lake: boolean; search: boolean; guard: boolean };
    usedFeatures: { stream: true; edge: boolean; lake: boolean; search: boolean; guard: boolean };
    ports: typeof import('./catalog').PORTS;
  };
  decisions: Decision[];
  warnings: Warning[];
  insights: Insight[];
}
