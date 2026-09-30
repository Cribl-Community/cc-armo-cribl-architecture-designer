import { useMemo, useState } from 'react';
import { Button, IconButton, Link, Pill, Table, Tooltip, defineColumns, type TableProps } from '@capra/core';
import { CopyOutlined, DeleteOutlined } from '@capra/icons';
import type { DesignSummary } from '../../state/DesignStore';
import { STEPS } from '../../ui/steps';
import { absoluteTime, relativeTime } from './relativeTime';

type Row = {
  id: string;
  name: string;
  customer: string;
  mode: string;
  deployment: string;
  sources: number;
  destinations: number;
  inboundGB: number;
  updatedAt: string;
  progress: number;
  busy: boolean;
};

type Sort = NonNullable<TableProps<Row>['sortDescriptor']>;

const DEPLOYMENT_SHORT: Record<DesignSummary['deploymentModel'], string> = {
  'on-prem': 'On-premises',
  hybrid: 'Hybrid (Cloud Leader)',
  cloud: 'Fully Cloud',
};

const TOTAL_STEPS = STEPS.length;

const columns = defineColumns<Row>([
  {
    id: 'name',
    label: 'Name',
    allowsSorting: true,
    render: (_v, item) => (
      <span className="designs-name">
        <Link href={`/designs/${item.id}`}>{item.name || 'Untitled design'}</Link>
      </span>
    ),
  },
  { id: 'customer', label: 'Customer', allowsSorting: true },
  {
    id: 'mode',
    label: 'Mode',
    allowsSorting: true,
    render: (v) => (
      <Pill variant="muted" appearance={v === 'production' ? 'info' : 'highlight'} inline>
        {v === 'production' ? 'Production' : 'POC'}
      </Pill>
    ),
  },
  { id: 'deployment', label: 'Deployment', allowsSorting: true },
  { id: 'sources', label: 'Sources', allowsSorting: true, render: (v) => <span className="num-cell">{String(v)}</span> },
  { id: 'destinations', label: 'Destinations', allowsSorting: true, render: (v) => <span className="num-cell">{String(v)}</span> },
  {
    id: 'inboundGB',
    label: 'Inbound GB/day',
    allowsSorting: true,
    render: (v) => <span className="num-cell mono">{Math.round(Number(v)).toLocaleString()}</span>,
  },
  {
    id: 'updatedAt',
    label: 'Last updated',
    allowsSorting: true,
    render: (v) => <span title={absoluteTime(String(v))}>{relativeTime(String(v))}</span>,
  },
  {
    id: 'progress',
    label: 'Progress',
    allowsSorting: true,
    render: (v) => {
      const n = Math.min(TOTAL_STEPS, Math.max(1, Number(v)));
      return (
        <span className="progress-cell" aria-label={`Step ${n} of ${TOTAL_STEPS} reached`}>
          <span className="progress-cell__track" aria-hidden>
            <span className="progress-cell__fill" style={{ width: `${(n / TOTAL_STEPS) * 100}%` }} />
          </span>
          <span className="mono">{`${n}/${TOTAL_STEPS}`}</span>
        </span>
      );
    },
  },
]);

const VISIBLE: (keyof Row & string)[] = ['name', 'customer', 'mode', 'deployment', 'sources', 'destinations', 'inboundGB', 'updatedAt', 'progress'];

function compare(a: Row, b: Row, column: string): number {
  const x = a[column as keyof Row];
  const y = b[column as keyof Row];
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  if (column === 'updatedAt') return new Date(String(x)).getTime() - new Date(String(y)).getTime();
  return String(x ?? '').localeCompare(String(y ?? ''), undefined, { sensitivity: 'base', numeric: true });
}

export function DesignsTable({
  summaries,
  busyId,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  summaries: DesignSummary[];
  busyId: string | null;
  onOpen: (id: string) => void;
  onDuplicate: (s: DesignSummary) => void;
  onDelete: (s: DesignSummary) => void;
}) {
  const [sort, setSort] = useState<Sort>({ column: 'updatedAt', direction: 'descending' });

  const rows = useMemo(() => {
    const list: Row[] = summaries.map((s) => ({
      id: s.id,
      name: s.name,
      customer: s.customer,
      mode: s.mode,
      deployment: DEPLOYMENT_SHORT[s.deploymentModel] ?? s.deploymentModel,
      sources: s.sources,
      destinations: s.destinations,
      inboundGB: s.inboundGB,
      updatedAt: s.updatedAt,
      progress: s.maxStepReached,
      busy: s.id === busyId,
    }));
    const dir = sort.direction === 'descending' ? -1 : 1;
    return list.sort((a, b) => compare(a, b, String(sort.column)) * dir);
  }, [summaries, busyId, sort]);

  const byId = useMemo(() => new Map(summaries.map((s) => [s.id, s])), [summaries]);

  return (
    <div className="designs-table">
      <Table
        aria-label="Saved designs"
        items={rows}
        columns={columns}
        visibleColumns={VISIBLE}
        sortDescriptor={sort}
        onSortChange={setSort}
        density="compact"
        renderActionColumn={(item) => {
          const s = byId.get(item.id);
          if (!s) return null;
          return (
            <span className="designs-actions">
              <Button size="sm" variant="secondary" onClick={() => onOpen(item.id)}>
                Open
              </Button>
              <Tooltip title="Duplicate">
                <IconButton size="sm" variant="tertiary" icon={CopyOutlined} aria-label={`Duplicate ${s.name}`} pending={item.busy} disabled={busyId !== null} onClick={() => onDuplicate(s)} />
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="sm" variant="tertiary" appearance="danger" icon={DeleteOutlined} aria-label={`Delete ${s.name}`} disabled={busyId !== null} onClick={() => onDelete(s)} />
              </Tooltip>
            </span>
          );
        }}
      />
    </div>
  );
}
