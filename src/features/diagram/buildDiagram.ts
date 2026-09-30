import type { Edge, Node } from '@xyflow/react';
import { PORTS, destinationLabel } from '../../model/catalog';
import type {
  ArchitectureResult,
  Backpressure,
  Design,
  Mode,
  PortSpec,
  SourceCategory,
  SourceGroup,
  SourcePQMode,
  WorkerGroupResult,
} from '../../model/types';

/* ────────────────────────────────────────────────────────────────
 * Pure, deterministic layout for the architecture diagram.
 *
 * Lanes, left → right:
 *   Sources │ Collection (Edge Fleets, Syslog Source) │ Load balancing │ Cribl Stream (Worker Groups) │ Destinations
 * with the Leader (control plane) above the Cribl Stream frame.
 *
 * Every node has a fixed width/height so positions never depend on DOM measurement.
 * ──────────────────────────────────────────────────────────────── */

export const LAYOUT = {
  SRC_W: 236,
  SRC_H: 100,
  COL_W: 228,
  COL_H: 100,
  LB_W: 216,
  LB_H: 136,
  GROUP_W: 320,
  GROUP_H: 262,
  DEST_W: 248,
  DEST_H: 100,
  LEADER_W: 360,
  LEADER_H: 108,
  LEADER_HA_H: 156,
  LANE_LABEL_H: 24,
  LANE_GAP: 76,
  OUT_GAP: 150,
  ROW_GAP: 20,
  CATEGORY_GAP: 22,
  GROUP_GAP: 24,
  FRAME_PAD_L: 48,
  FRAME_PAD_R: 28,
  FRAME_PAD_T: 64,
  FRAME_PAD_B: 28,
  /** Relative vertical position of the push-ingest handle on a Worker Group card. */
  GROUP_IN_FRAC: 0.42,
  /** Relative vertical position of the pull handle on a Worker Group card. */
  GROUP_PULL_FRAC: 0.8,
  /** Offset (px) of the control-plane handle from the top of a card. */
  CTL_OFFSET: 22,
} as const;

/** Visual variant of an edge; maps 1:1 to a CSS class and an arrow marker. */
export type EdgeVariant = 'endpoint' | 'network' | 'cloud' | 'mixed' | 'out' | 'lake' | 'control';

export const EDGE_VARIANTS: EdgeVariant[] = ['endpoint', 'network', 'cloud', 'mixed', 'out', 'lake', 'control'];

export const markerId = (variant: EdgeVariant) => `cad-arrow-${variant}`;

export type SourceNodeData = {
  title: string;
  subtitle: string | null;
  type: string;
  category: SourceCategory;
  count: number;
  countNoun: string;
  gbPerDay: number;
  pq: SourcePQMode;
  destinations: number;
  groupLetter: string;
  flows: string[];
};

export type FleetNodeData = {
  title: string;
  type: string;
  edgeNodes: number;
  port: number;
  groupLetter: string;
  flows: string[];
};

export type SyslogNodeData = {
  port: number;
  sourceTypes: string[];
  devices: number;
  groupLetters: string[];
  flows: string[];
};

export type LoadBalancerNodeData = {
  groupLetter: string;
  groupName: string;
  workerNodes: number;
  ports: PortSpec[];
  healthPath: string;
  healthPort: number;
  flows: string[];
};

export type GroupNodeData = {
  group: WorkerGroupResult;
  mode: Mode;
  categories: SourceCategory[];
  sourceTypes: string[];
  flows: string[];
};

export type LeaderNodeData = {
  variant: 'managed' | 'ha' | 'single';
  uiPort: number;
  workerPort: number;
  groups: number;
  fleets: number;
  flows: string[];
};

export type DestinationNodeData = {
  title: string;
  type: string;
  backpressure: Backpressure;
  isLake: boolean;
  retention: string | null;
  routedSources: number;
  groupLetters: string[];
  flows: string[];
};

export type FrameNodeData = {
  title: string;
  subtitle: string;
};

export type LaneNodeData = {
  label: string;
};

export type SourceNode = Node<SourceNodeData, 'source'>;
export type FleetNode = Node<FleetNodeData, 'fleet'>;
export type SyslogNode = Node<SyslogNodeData, 'syslog'>;
export type LoadBalancerNode = Node<LoadBalancerNodeData, 'loadBalancer'>;
export type GroupNode = Node<GroupNodeData, 'workerGroup'>;
export type LeaderNode = Node<LeaderNodeData, 'leader'>;
export type DestinationNode = Node<DestinationNodeData, 'destination'>;
export type FrameNode = Node<FrameNodeData, 'frame'>;
export type LaneNode = Node<LaneNodeData, 'lane'>;

export type DiagramNode = SourceNode | FleetNode | SyslogNode | LoadBalancerNode | GroupNode | LeaderNode | DestinationNode | FrameNode | LaneNode;

export type DiagramEdgeData = {
  variant: EdgeVariant;
  /** Source-group ids whose data travels over this edge (drives hover highlighting). */
  flows: string[];
  /** Control-plane routing: y of the horizontal bus under the Leader. */
  busY?: number;
  /** Control-plane routing: x of the vertical channel next to the target. */
  channelX?: number;
  /** Set by the renderer while another element is hovered. */
  dim?: boolean;
};

export type DiagramEdge = Edge<DiagramEdgeData>;

export interface DiagramModel {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** Lanes present, for the legend. */
  lanes: { collection: boolean; loadBalancer: boolean };
  /** Edge variants present, for the legend. */
  variants: EdgeVariant[];
}

const CATEGORY_ORDER: SourceCategory[] = ['endpoint', 'network', 'cloud'];
const COUNT_NOUN: Record<SourceCategory, string> = { endpoint: 'hosts', network: 'devices', cloud: 'integrations' };

const Z_FRAME = 0;
const Z_EDGE = 1;
const Z_NODE = 2;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** Compact label for the source types carried by an edge, e.g. "Windows, Linux +2". */
export function summarizeTypes(types: string[], max = 2): string {
  const u = uniq(types);
  if (u.length <= max) return u.join(', ');
  return `${u.slice(0, max).join(', ')} +${u.length - max}`;
}

export function buildDiagram(design: Design, result: ArchitectureResult): DiagramModel {
  const L = LAYOUT;
  const arch = result.architecture;
  const groups = arch.workerGroups;
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const variants = new Set<EdgeVariant>();

  // ── Lookups ───────────────────────────────────────────────────
  const categoryOfSource = new Map<string, SourceCategory>();
  for (const c of CATEGORY_ORDER) for (const s of arch.categorizedSources[c]) categoryOfSource.set(s.id, c);
  const groupOfSource = new Map<string, WorkerGroupResult>();
  for (const g of groups) for (const s of g.sources) groupOfSource.set(s.id, g);

  const orderedSources: SourceGroup[] = CATEGORY_ORDER.flatMap((c) => arch.categorizedSources[c]);
  const networkSources = arch.categorizedSources.network;
  const hasCollection = arch.edgeFleets.length > 0 || networkSources.length > 0;
  const lbGroups = groups.filter((g) => g.usesLoadBalancer);
  const hasLB = lbGroups.length > 0;

  // ── Horizontal lanes ─────────────────────────────────────────
  let x = 0;
  const srcX = x;
  x += L.SRC_W + L.LANE_GAP;
  const colX = x;
  if (hasCollection) x += L.COL_W + L.LANE_GAP;
  const lbX = x;
  if (hasLB) x += L.LB_W + L.LANE_GAP;
  const frameX = x;
  const frameW = L.FRAME_PAD_L + L.GROUP_W + L.FRAME_PAD_R;
  const groupX = frameX + L.FRAME_PAD_L;
  const destX = frameX + frameW + L.OUT_GAP;

  // ── Vertical bands ───────────────────────────────────────────
  const leaderVariant: LeaderNodeData['variant'] = arch.useManagedLeader ? 'managed' : arch.leaderHA ? 'ha' : 'single';
  const leaderH = leaderVariant === 'ha' ? L.LEADER_HA_H : L.LEADER_H;
  const leaderY = 0;
  const busY = leaderY + leaderH + 34;
  const laneY = busY + 22;
  const frameY = laneY - 6;
  const contentY = laneY + L.LANE_LABEL_H + 20;
  const groupStartY = frameY + L.FRAME_PAD_T;

  // ── Sources ──────────────────────────────────────────────────
  const rowY = new Map<string, number>();
  let y = contentY;
  let prevCategory: SourceCategory | null = null;
  for (const s of orderedSources) {
    const c = categoryOfSource.get(s.id)!;
    if (prevCategory && prevCategory !== c) y += L.CATEGORY_GAP;
    rowY.set(s.id, y);
    y += L.SRC_H + L.ROW_GAP;
    prevCategory = c;
  }
  const rowCenter = (id: string) => (rowY.get(id) ?? contentY) + L.SRC_H / 2;

  for (const s of orderedSources) {
    const c = categoryOfSource.get(s.id)!;
    const title = s.label?.trim() || s.type;
    nodes.push({
      id: `src-${s.id}`,
      type: 'source',
      position: { x: srcX, y: rowY.get(s.id)! },
      width: L.SRC_W,
      height: L.SRC_H,
      zIndex: Z_NODE,
      data: {
        title,
        subtitle: title !== s.type ? s.type : null,
        type: s.type,
        category: c,
        count: s.count,
        countNoun: COUNT_NOUN[c],
        gbPerDay: s.volumeGBPerDay || 0,
        pq: s.pq,
        destinations: s.destinationIds.length,
        groupLetter: groupOfSource.get(s.id)?.letter ?? '',
        flows: [s.id],
      },
    });
  }

  // ── Worker Groups (placed next, other lanes align to them) ────
  const groupY = new Map<string, number>();
  let prevBottom = -Infinity;
  for (const g of groups) {
    const centers = g.sources.map((s) => rowCenter(s.id));
    const desired = Number.isFinite(mean(centers)) ? mean(centers) - L.GROUP_H / 2 : groupStartY;
    const gy = Math.max(desired, prevBottom + L.GROUP_GAP, groupStartY);
    groupY.set(g.id, gy);
    prevBottom = gy + L.GROUP_H;
  }
  const firstGroupY = groups.length ? groupY.get(groups[0].id)! : groupStartY;
  const lastGroupBottom = groups.length ? groupY.get(groups[groups.length - 1].id)! + L.GROUP_H : groupStartY + L.GROUP_H;
  const groupInY = (g: WorkerGroupResult) => groupY.get(g.id)! + L.GROUP_H * L.GROUP_IN_FRAC;

  // Frame (behind everything in the Cribl Stream lane)
  const managedAll = groups.length > 0 && groups.every((g) => g.managedBy === 'cribl');
  nodes.push({
    id: 'frame-stream',
    type: 'frame',
    position: { x: frameX, y: frameY },
    width: frameW,
    height: lastGroupBottom + L.FRAME_PAD_B - frameY,
    zIndex: Z_FRAME,
    selectable: false,
    focusable: false,
    data: {
      title: 'Cribl Stream',
      subtitle: managedAll ? 'Cribl.Cloud · Cribl-managed Worker Groups' : `${groups.length} Worker Group${groups.length === 1 ? '' : 's'} · customer-managed`,
    },
  });

  for (const g of groups) {
    const categories = CATEGORY_ORDER.filter((c) => g.sources.some((s) => categoryOfSource.get(s.id) === c));
    nodes.push({
      id: `wg-${g.id}`,
      type: 'workerGroup',
      position: { x: groupX, y: groupY.get(g.id)! },
      width: L.GROUP_W,
      height: L.GROUP_H,
      zIndex: Z_NODE,
      data: {
        group: g,
        mode: arch.mode,
        categories,
        sourceTypes: uniq(g.sources.map((s) => s.type)),
        flows: g.sources.map((s) => s.id),
      },
    });
  }

  // ── Load balancers ───────────────────────────────────────────
  for (const g of lbGroups) {
    const pushIds = g.sources.filter((s) => categoryOfSource.get(s.id) !== 'cloud').map((s) => s.id);
    nodes.push({
      id: `lb-${g.id}`,
      type: 'loadBalancer',
      position: { x: lbX, y: groupInY(g) - L.LB_H / 2 },
      width: L.LB_W,
      height: L.LB_H,
      zIndex: Z_NODE,
      data: {
        groupLetter: g.letter,
        groupName: g.name,
        workerNodes: g.nodes,
        ports: g.ingressPorts.filter((p) => p.direction === 'Inbound'),
        healthPath: PORTS.HEALTH_PATH,
        healthPort: PORTS.UI_API,
        flows: pushIds,
      },
    });
    const pushCats = uniq(pushIds.map((id) => categoryOfSource.get(id)!));
    const variant: EdgeVariant = pushCats.length === 1 ? (pushCats[0] as EdgeVariant) : 'mixed';
    edges.push(dataEdge(`e-lb-wg-${g.id}`, `lb-${g.id}`, `wg-${g.id}`, 'out', 'in', variant, undefined, pushIds));
    variants.add(variant);
  }

  /** Where push traffic for group `g` lands: its load balancer if it has one, else the group itself. */
  const pushTarget = (g: WorkerGroupResult) => (g.usesLoadBalancer ? { node: `lb-${g.id}`, handle: 'in' } : { node: `wg-${g.id}`, handle: 'in' });

  // ── Collection tier: Edge Fleets ─────────────────────────────
  for (const f of arch.edgeFleets) {
    const g = groupOfSource.get(f.sourceId);
    nodes.push({
      id: `fleet-${f.sourceId}`,
      type: 'fleet',
      position: { x: colX, y: rowY.get(f.sourceId) ?? contentY },
      width: L.COL_W,
      height: L.COL_H,
      zIndex: Z_NODE,
      data: { title: f.name, type: f.type, edgeNodes: f.nodes, port: PORTS.CRIBL_TCP, groupLetter: g?.letter ?? '', flows: [f.sourceId] },
    });
    edges.push(dataEdge(`e-src-fleet-${f.sourceId}`, `src-${f.sourceId}`, `fleet-${f.sourceId}`, 'out', 'in', 'endpoint', undefined, [f.sourceId]));
    if (g) {
      const t = pushTarget(g);
      edges.push(dataEdge(`e-fleet-${f.sourceId}`, `fleet-${f.sourceId}`, t.node, 'out', t.handle, 'endpoint', `Cribl TCP ${PORTS.CRIBL_TCP}`, [f.sourceId]));
    }
    variants.add('endpoint');
  }

  // ── Collection tier: Syslog Source ───────────────────────────
  if (networkSources.length > 0) {
    const netGroups = groups.filter((g) => g.sources.some((s) => categoryOfSource.get(s.id) === 'network'));
    const center = mean(networkSources.map((s) => rowCenter(s.id)));
    nodes.push({
      id: 'syslog',
      type: 'syslog',
      position: { x: colX, y: center - L.COL_H / 2 },
      width: L.COL_W,
      height: L.COL_H,
      zIndex: Z_NODE,
      data: {
        port: PORTS.SYSLOG,
        sourceTypes: uniq(networkSources.map((s) => s.type)),
        devices: networkSources.reduce((a, s) => a + (s.count || 0), 0),
        groupLetters: netGroups.map((g) => g.letter),
        flows: networkSources.map((s) => s.id),
      },
    });
    for (const s of networkSources) {
      edges.push(dataEdge(`e-src-syslog-${s.id}`, `src-${s.id}`, 'syslog', 'out', 'in', 'network', undefined, [s.id]));
    }
    for (const g of netGroups) {
      const ids = g.sources.filter((s) => categoryOfSource.get(s.id) === 'network').map((s) => s.id);
      const t = pushTarget(g);
      edges.push(dataEdge(`e-syslog-${g.id}`, 'syslog', t.node, 'out', t.handle, 'network', `Syslog ${PORTS.SYSLOG} TCP/UDP`, ids));
    }
    variants.add('network');
  }

  // ── Cloud sources: pulled directly by their Worker Group ─────
  for (const s of arch.categorizedSources.cloud) {
    const g = groupOfSource.get(s.id);
    if (!g) continue;
    edges.push(dataEdge(`e-pull-${s.id}`, `src-${s.id}`, `wg-${g.id}`, 'out', 'pull', 'cloud', 'pull · API', [s.id]));
    variants.add('cloud');
  }

  // ── Destinations ─────────────────────────────────────────────
  const groupCenter = (g: WorkerGroupResult) => groupY.get(g.id)! + L.GROUP_H / 2;
  const destOrder = design.destinations
    .map((d, index) => {
      const routing = groups.filter((g) => g.sources.some((s) => s.destinationIds.includes(d.id)));
      const bary = routing.length ? mean(routing.map(groupCenter)) : Number.POSITIVE_INFINITY;
      return { d, index, routing, bary };
    })
    .sort((a, b) => a.bary - b.bary || a.index - b.index);

  const destTotalH = destOrder.length * L.DEST_H + Math.max(0, destOrder.length - 1) * L.ROW_GAP;
  const groupsMid = (firstGroupY + lastGroupBottom) / 2;
  let dy = Math.max(contentY, groupsMid - destTotalH / 2);

  for (const { d, routing } of destOrder) {
    const isLake = d.type === 'Cribl Lake';
    const routedIds = design.sources.filter((s) => s.destinationIds.includes(d.id)).map((s) => s.id);
    const retention = design.lakeRetentionDays?.trim();
    nodes.push({
      id: `dest-${d.id}`,
      type: 'destination',
      position: { x: destX, y: dy },
      width: L.DEST_W,
      height: L.DEST_H,
      zIndex: Z_NODE,
      data: {
        title: d.label?.trim() || destinationLabel(d.type),
        type: d.type,
        backpressure: d.backpressure,
        isLake,
        retention: isLake ? (retention && retention.toLowerCase() !== 'unknown' ? retention : null) : null,
        routedSources: routedIds.length,
        groupLetters: routing.map((g) => g.letter),
        flows: routedIds,
      },
    });
    dy += L.DEST_H + L.ROW_GAP;

    for (const g of routing) {
      const carried = g.sources.filter((s) => s.destinationIds.includes(d.id));
      const variant: EdgeVariant = isLake ? 'lake' : 'out';
      edges.push(
        dataEdge(
          `e-out-${g.id}-${d.id}`,
          `wg-${g.id}`,
          `dest-${d.id}`,
          'out',
          'in',
          variant,
          summarizeTypes(carried.map((s) => s.type)),
          carried.map((s) => s.id),
        ),
      );
      variants.add(variant);
    }
  }

  // ── Leader + control plane ───────────────────────────────────
  nodes.push({
    id: 'leader',
    type: 'leader',
    position: { x: frameX + frameW / 2 - L.LEADER_W / 2, y: leaderY },
    width: L.LEADER_W,
    height: leaderH,
    zIndex: Z_NODE,
    data: {
      variant: leaderVariant,
      uiPort: PORTS.UI_API,
      workerPort: PORTS.WORKER_TO_LEADER,
      groups: groups.length,
      fleets: arch.edgeFleets.length,
      flows: [],
    },
  });

  for (const g of groups) {
    edges.push(controlEdge(`c-wg-${g.id}`, `wg-${g.id}`, busY, groupX - 22));
  }
  for (const f of arch.edgeFleets) {
    edges.push(controlEdge(`c-fleet-${f.sourceId}`, `fleet-${f.sourceId}`, busY, colX + L.COL_W + 26));
  }
  if (groups.length || arch.edgeFleets.length) variants.add('control');

  // ── Lane labels ──────────────────────────────────────────────
  const lane = (id: string, label: string, lx: number, w: number): LaneNode => ({
    id: `lane-${id}`,
    type: 'lane',
    position: { x: lx, y: laneY },
    width: w,
    height: L.LANE_LABEL_H,
    zIndex: Z_FRAME,
    selectable: false,
    focusable: false,
    data: { label },
  });
  if (orderedSources.length) nodes.push(lane('sources', 'Sources', srcX, L.SRC_W));
  if (hasCollection) nodes.push(lane('collection', 'Collection', colX, L.COL_W));
  if (hasLB) nodes.push(lane('lb', 'Load balancing', lbX, L.LB_W));
  if (destOrder.length) nodes.push(lane('destinations', 'Destinations', destX, L.DEST_W));

  return {
    nodes,
    edges,
    lanes: { collection: hasCollection, loadBalancer: hasLB },
    variants: EDGE_VARIANTS.filter((v) => variants.has(v)),
  };
}

function dataEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
  variant: EdgeVariant,
  label: string | undefined,
  flows: string[],
): DiagramEdge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: 'default',
    animated: true,
    zIndex: Z_EDGE,
    className: `cad-edge cad-edge--${variant}`,
    markerEnd: markerId(variant),
    label,
    labelShowBg: true,
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 6,
    focusable: false,
    data: { variant, flows },
  };
}

function controlEdge(id: string, target: string, busY: number, channelX: number): DiagramEdge {
  return {
    id,
    source: 'leader',
    target,
    sourceHandle: 'ctl',
    targetHandle: 'ctl',
    type: 'control',
    zIndex: Z_EDGE,
    className: 'cad-edge cad-edge--control',
    markerEnd: markerId('control'),
    label: String(PORTS.WORKER_TO_LEADER),
    focusable: false,
    data: { variant: 'control', flows: [], busY, channelX },
  };
}
