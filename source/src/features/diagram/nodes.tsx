import type { ReactNode } from 'react';
import { Handle, Position, type NodeProps, type NodeTypes } from '@xyflow/react';
import { BranchesOutlined, CriblOutlined, HardDrive, WarningOutlined } from '@capra/icons';
import { GenericSyslog } from '@capra/icons/logos';
import { CATEGORY_LABELS, SIZING_RULES } from '../../model/catalog';
import type { Backpressure, SourceCategory, SourcePQMode } from '../../model/types';
import { DestinationLogo, ProductLogo, SourceLogo } from '../../ui/logos';
import { fmtGB, fmtNum } from '../../ui/layout';
import { LAYOUT } from './buildDiagram';
import type {
  DestinationNode,
  FleetNode,
  FrameNode,
  GroupNode,
  LaneNode,
  LeaderNode,
  LoadBalancerNode,
  SourceNode,
  SyslogNode,
} from './buildDiagram';

/* Custom React Flow nodes. Plain HTML + tokenised CSS (diagram.css); no colours in JS. */

const CATEGORY_TONE: Record<SourceCategory, 'info' | 'warning' | 'success'> = {
  endpoint: 'info',
  network: 'warning',
  cloud: 'success',
};

const PQ_LABEL: Record<SourcePQMode, string> = { off: 'PQ off', smart: 'PQ smart', always: 'PQ always' };

const BACKPRESSURE: Record<Backpressure, { label: string; tone: 'success' | 'warning' | 'danger'; hint: string }> = {
  pq: { label: 'Backpressure: PQ', tone: 'success', hint: 'Persistent Queue buffers to disk while the Destination is unavailable' },
  block: { label: 'Backpressure: Block', tone: 'warning', hint: 'Blocks upstream senders until the Destination recovers' },
  drop: { label: 'Backpressure: Drop', tone: 'danger', hint: 'Drops events while the Destination is unavailable' },
};

const utilTone = (pct: number) => (pct > 80 ? 'danger' : pct > 60 ? 'warning' : 'success');

const HANDLE = { isConnectable: false, className: 'cad-handle' } as const;
const ctlTop = { top: LAYOUT.CTL_OFFSET };

function Chip({ tone, children, title }: { tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'highlight'; children: ReactNode; title?: string }) {
  return (
    <span className={`chip cad-chip${tone ? ` chip--${tone}` : ''}`} title={title}>
      {children}
    </span>
  );
}

export function UtilizationBar({ pct, label }: { pct: number; label?: string }) {
  const tone = utilTone(pct);
  const shown = Math.max(0, Math.min(100, pct));
  return (
    <div className="cad-util">
      <div className="cad-util__track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label ?? 'Peak utilization'}>
        <div className={`cad-util__fill cad-util__fill--${tone}`} style={{ width: `${shown}%` }} />
      </div>
      <span className={`cad-util__pct cad-util__pct--${tone}`}>{Math.round(pct)}%</span>
    </div>
  );
}

function SourceNodeView({ data }: NodeProps<SourceNode>) {
  const unrouted = data.destinations === 0;
  return (
    <div className={`cad-card cad-card--source cad-accent--${data.category}${unrouted ? ' cad-card--alert' : ''}`}>
      <div className="cad-card__head">
        <span className="cad-logo">
          <SourceLogo type={data.type} size="md" />
        </span>
        <div className="cad-card__titles">
          <div className="cad-card__title" title={data.title}>
            {data.title}
          </div>
          <div className="cad-card__sub">{data.subtitle ?? `${CATEGORY_LABELS[data.category]} source`}</div>
        </div>
        {data.groupLetter && (
          <span className="cad-letter cad-letter--sm" title={`Processed by Worker Group ${data.groupLetter}`}>
            {data.groupLetter}
          </span>
        )}
      </div>
      <div className="cad-card__metric">
        <strong>{fmtGB(data.gbPerDay)}</strong>
        <span className="cad-muted"> · {fmtNum(data.count)} {data.countNoun}</span>
      </div>
      <div className="cad-card__tags">
        {data.pq !== 'off' && <Chip tone="success">{PQ_LABEL[data.pq]}</Chip>}
        {unrouted ? (
          <Chip tone="danger">
            <WarningOutlined size="xs" /> No destinations
          </Chip>
        ) : (
          <Chip>
            {data.destinations} destination{data.destinations === 1 ? '' : 's'}
          </Chip>
        )}
      </div>
      <Handle type="source" position={Position.Right} id="out" {...HANDLE} />
    </div>
  );
}

function FleetNodeView({ data }: NodeProps<FleetNode>) {
  return (
    <div className="cad-card cad-card--cribl cad-accent--endpoint">
      <Handle type="target" position={Position.Left} id="in" {...HANDLE} />
      <Handle type="target" position={Position.Right} id="ctl" style={ctlTop} {...HANDLE} />
      <div className="cad-card__head">
        <span className="cad-logo">
          <ProductLogo product="edge" size="md" />
        </span>
        <div className="cad-card__titles">
          <div className="cad-card__title" title={data.title}>
            {data.title}
          </div>
          <div className="cad-card__sub">Cribl Edge Fleet</div>
        </div>
      </div>
      <div className="cad-card__metric">
        <strong>{fmtNum(data.edgeNodes)}</strong>
        <span className="cad-muted"> Edge Node{data.edgeNodes === 1 ? '' : 's'}</span>
      </div>
      <div className="cad-card__tags">
        <Chip tone="info">Cribl TCP {data.port}</Chip>
        {data.groupLetter && <Chip>→ Group {data.groupLetter}</Chip>}
      </div>
      <Handle type="source" position={Position.Right} id="out" {...HANDLE} />
    </div>
  );
}

function SyslogNodeView({ data }: NodeProps<SyslogNode>) {
  return (
    <div className="cad-card cad-card--cribl cad-accent--network">
      <Handle type="target" position={Position.Left} id="in" {...HANDLE} />
      <div className="cad-card__head">
        <span className="cad-logo">
          <GenericSyslog size="md" aria-hidden />
        </span>
        <div className="cad-card__titles">
          <div className="cad-card__title">Syslog Source</div>
          <div className="cad-card__sub" title={data.sourceTypes.join(', ')}>
            on Worker Group {data.groupLetters.join(', ')}
          </div>
        </div>
      </div>
      <div className="cad-card__metric">
        <strong>{fmtNum(data.devices)}</strong>
        <span className="cad-muted" title={data.sourceTypes.join(', ')}>
          {' '}
          devices · {data.sourceTypes.join(', ')}
        </span>
      </div>
      <div className="cad-card__tags">
        <Chip tone="warning">TCP/UDP {data.port}</Chip>
        <Chip>No agent</Chip>
      </div>
      <Handle type="source" position={Position.Right} id="out" {...HANDLE} />
    </div>
  );
}

function LoadBalancerNodeView({ data }: NodeProps<LoadBalancerNode>) {
  return (
    <div className="cad-card cad-card--infra">
      <Handle type="target" position={Position.Left} id="in" {...HANDLE} />
      <div className="cad-card__head">
        <span className="cad-icon-tile">
          <BranchesOutlined size="sm" />
        </span>
        <div className="cad-card__titles">
          <div className="cad-card__title">Load Balancer</div>
          <div className="cad-card__sub">Layer 4 · Worker Group {data.groupLetter}</div>
        </div>
      </div>
      <div className="cad-card__tags">
        {data.ports.map((p) => (
          <Chip key={String(p.port)} tone="brand" title={p.purpose}>
            {p.port} {p.protocol}
          </Chip>
        ))}
      </div>
      <div className="cad-lb-health">
        <span className="cad-muted">Health check</span>
        <code className="cad-code">
          GET {data.healthPath} :{data.healthPort}
        </code>
      </div>
      <div className="cad-card__foot cad-muted">→ {data.workerNodes} healthy Worker Nodes</div>
      <Handle type="source" position={Position.Right} id="out" {...HANDLE} />
    </div>
  );
}

function GroupNodeView({ data }: NodeProps<GroupNode>) {
  const g = data.group;
  const managed = g.managedBy === 'cribl';
  const isProd = data.mode === 'production';
  const ingestTB = g.peakGB / 3 / 1024;
  const tierFill = managed && g.cloudTierTBPerDay ? (ingestTB / g.cloudTierTBPerDay) * 100 : 0;
  return (
    <div className="cad-card cad-card--group">
      <Handle type="target" position={Position.Left} id="ctl" style={ctlTop} {...HANDLE} />
      <Handle type="target" position={Position.Left} id="in" style={{ top: `${LAYOUT.GROUP_IN_FRAC * 100}%` }} {...HANDLE} />
      <Handle type="target" position={Position.Left} id="pull" style={{ top: `${LAYOUT.GROUP_PULL_FRAC * 100}%` }} {...HANDLE} />
      <div className="cad-group__head">
        <span className="cad-letter">{g.letter}</span>
        <div className="cad-card__titles">
          <div className="cad-card__sub cad-card__eyebrow">Worker Group {g.letter}</div>
          <div className="cad-card__title" title={g.name}>
            {g.name}
          </div>
        </div>
        <Chip tone={managed ? 'brand' : undefined}>{managed ? 'Cribl-managed' : 'Customer-managed'}</Chip>
      </div>

      {managed ? (
        <div className="cad-group__spec">
          <div>
            <div className="cad-group__big">~{g.cloudTierTBPerDay} TB/day</div>
            <div className="cad-muted">Cribl.Cloud ingest tier</div>
          </div>
          <div className="cad-group__side">
            <div className="cad-group__mid">{fmtGB(g.peakGB / 3)}</div>
            <div className="cad-muted">peak ingest (≈ in+out ÷ 3)</div>
          </div>
        </div>
      ) : (
        <div className="cad-group__spec">
          <div>
            <div className="cad-group__big">
              {g.nodes} × {g.profile.vcpus} vCPU
            </div>
            <div className="cad-muted">Worker Nodes · {g.profile.ramGB} GB RAM</div>
          </div>
          <div className="cad-group__side">
            <div className="cad-group__mid">{fmtNum(g.totalWorkerProcesses)}</div>
            <div className="cad-muted">Worker Processes</div>
          </div>
        </div>
      )}

      <div className="cad-group__util">
        <div className="cad-group__util-label">
          <span className="cad-muted">{managed ? 'Tier fill' : 'Peak utilization'}</span>
          <span>
            {managed ? (
              <>
                {ingestTB.toFixed(1)} of {g.cloudTierTBPerDay} TB/day
              </>
            ) : (
              <>
                {fmtGB(g.peakGB)} of {fmtGB(g.capacityGB)}
              </>
            )}
          </span>
        </div>
        <UtilizationBar pct={managed ? tierFill : g.peakUtilizationPct} label={`Worker Group ${g.letter} utilization`} />
      </div>

      <ul className="cad-group__facts">
        {managed ? (
          <li>Cribl.Cloud provisions, scales and keeps this group highly available</li>
        ) : isProd ? (
          <li>
            HA: {g.nodesForCapacity} for capacity + {g.haSpareNodes} spare ({SIZING_RULES.haSurvivableNodeLossPct * 100}% node loss)
            {g.haFloorApplied ? ` → min ${SIZING_RULES.minProductionNodesPerGroup}` : ''}
          </li>
        ) : (
          <li>POC: {g.nodesForCapacity} node{g.nodesForCapacity === 1 ? '' : 's'} for capacity, no HA spares</li>
        )}
        {!managed && (
          <li>
            <HardDrive size="xs" /> Disk {g.recommendedDiskPerNodeGB} GB / node
            {g.pqDiskPerNodeGB > 0 ? ` (incl. ${g.pqDiskPerNodeGB} GB PQ)` : ''}
          </li>
        )}
      </ul>

      <div className="cad-group__sources">
        {data.categories.map((c) => (
          <Chip key={c} tone={CATEGORY_TONE[c]}>
            {CATEGORY_LABELS[c]}
          </Chip>
        ))}
        <span className="cad-group__logos" title={data.sourceTypes.join(', ')}>
          {data.sourceTypes.slice(0, 6).map((t) => (
            <span key={t} className="cad-logo cad-logo--xs">
              <SourceLogo type={t} size="xs" />
            </span>
          ))}
        </span>
      </div>
      <Handle type="source" position={Position.Right} id="out" {...HANDLE} />
    </div>
  );
}

function LeaderNodeView({ data }: NodeProps<LeaderNode>) {
  const title = data.variant === 'managed' ? 'Cribl.Cloud Leader' : data.variant === 'ha' ? 'Leader High Availability' : 'Leader';
  const badge = data.variant === 'managed' ? 'Managed' : data.variant === 'ha' ? 'Primary + Standby' : 'Single (POC)';
  return (
    <div className="cad-card cad-card--leader">
      <div className="cad-card__head">
        <span className="cad-icon-tile cad-icon-tile--brand">
          <CriblOutlined size="sm" />
        </span>
        <div className="cad-card__titles">
          <div className="cad-card__sub cad-card__eyebrow">Control plane</div>
          <div className="cad-card__title">{title}</div>
        </div>
        <Chip tone="brand">{badge}</Chip>
      </div>
      {data.variant === 'ha' && (
        <div className="cad-leader__pair">
          <div className="cad-leader__box">
            <strong>Leader (Primary)</strong>
            <span className="cad-muted">active</span>
          </div>
          <div className="cad-leader__box cad-leader__box--standby">
            <strong>Leader (Standby)</strong>
            <span className="cad-muted">shared NFS failover</span>
          </div>
        </div>
      )}
      <div className="cad-card__tags">
        <Chip>UI/API :{data.uiPort}</Chip>
        <Chip tone="highlight">Workers → :{data.workerPort}</Chip>
        <span className="cad-muted cad-leader__count">
          {data.groups} group{data.groups === 1 ? '' : 's'}
          {data.fleets ? ` · ${data.fleets} fleet${data.fleets === 1 ? '' : 's'}` : ''}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} id="ctl" {...HANDLE} />
    </div>
  );
}

function DestinationNodeView({ data }: NodeProps<DestinationNode>) {
  const bp = BACKPRESSURE[data.backpressure];
  const unrouted = data.routedSources === 0;
  return (
    <div className={`cad-card cad-card--destination${data.isLake ? ' cad-card--lake' : ''}${unrouted ? ' cad-card--idle' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" {...HANDLE} />
      <div className="cad-card__head">
        <span className="cad-logo">
          <DestinationLogo type={data.type} size="md" />
        </span>
        <div className="cad-card__titles">
          <div className="cad-card__title" title={data.title}>
            {data.title}
          </div>
          <div className="cad-card__sub">
            {unrouted
              ? 'No sources routed'
              : `${data.routedSources} source${data.routedSources === 1 ? '' : 's'} · from Group ${data.groupLetters.join(', ')}`}
          </div>
        </div>
      </div>
      <div className="cad-card__tags">
        <Chip tone={bp.tone} title={bp.hint}>
          {bp.label}
        </Chip>
        {data.isLake && <Chip tone="brand">Retention: {data.retention ? `${data.retention} days` : 'TBD'}</Chip>}
      </div>
    </div>
  );
}

function FrameNodeView({ data }: NodeProps<FrameNode>) {
  return (
    <div className="cad-frame">
      <div className="cad-frame__head">
        <ProductLogo product="stream" size="md" />
        <div>
          <div className="cad-frame__title">{data.title}</div>
          <div className="cad-frame__sub">{data.subtitle}</div>
        </div>
      </div>
    </div>
  );
}

function LaneNodeView({ data }: NodeProps<LaneNode>) {
  return <div className="cad-lane">{data.label}</div>;
}

export const nodeTypes = {
  source: SourceNodeView,
  fleet: FleetNodeView,
  syslog: SyslogNodeView,
  loadBalancer: LoadBalancerNodeView,
  workerGroup: GroupNodeView,
  leader: LeaderNodeView,
  destination: DestinationNodeView,
  frame: FrameNodeView,
  lane: LaneNodeView,
} satisfies NodeTypes;
