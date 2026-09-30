import { Text } from '@capra/core';
import type { ArchitectureResult, ImportSnapshot } from '../../../model/types';
import { fmtGB, fmtNum } from '../../../ui/layout';

interface Row {
  label: string;
  current: number | null;
  recommended: number | null;
  format: (n: number) => string;
  recommendedNote?: string;
}

function Delta({ current, recommended, format }: { current: number | null; recommended: number | null; format: (n: number) => string }) {
  if (current === null || recommended === null) return <span className="muted">--</span>;
  const d = recommended - current;
  if (Math.abs(d) < 0.5) return <span className="chip chip--success">No change</span>;
  const pct = current > 0 ? ` (${d > 0 ? '+' : ''}${Math.round((d / current) * 100)}%)` : '';
  return <span className={`chip ${d > 0 ? 'chip--warning' : 'chip--info'}`}>{`${d > 0 ? '+' : '−'}${format(Math.abs(d))}${pct}`}</span>;
}

export function CurrentVsRecommended({ snapshot, result }: { snapshot: ImportSnapshot; result: ArchitectureResult }) {
  const stream = snapshot.groups.filter((g) => !g.isFleet);
  const fleets = snapshot.groups.filter((g) => g.isFleet);
  const wgs = result.architecture.workerGroups;
  const customer = wgs.filter((g) => g.managedBy === 'customer');
  const allManaged = customer.length === 0;
  const currentCustomer = stream.filter((g) => g.onPrem);
  const compareNodes = currentCustomer.length > 0 ? currentCustomer : stream;

  const rows: Row[] = [
    { label: 'Worker Groups', current: stream.length, recommended: wgs.length, format: fmtNum },
    {
      label: currentCustomer.length > 0 ? 'Worker Nodes (customer-managed)' : 'Worker Nodes',
      current: compareNodes.reduce((a, g) => a + g.workerCount, 0),
      recommended: allManaged ? null : customer.reduce((a, g) => a + g.nodes, 0),
      format: fmtNum,
      recommendedNote: allManaged ? 'Managed by Cribl.Cloud' : undefined,
    },
    {
      label: 'vCPUs',
      current: compareNodes.reduce((a, g) => a + g.totalVcpus, 0),
      recommended: allManaged ? null : customer.reduce((a, g) => a + g.totalVcpus, 0),
      format: fmtNum,
      recommendedNote: allManaged ? 'Managed by Cribl.Cloud' : undefined,
    },
    { label: 'Edge Fleets', current: fleets.length, recommended: result.architecture.edgeFleets.length, format: fmtNum },
    { label: 'Inbound volume', current: snapshot.dailyInGB, recommended: result.metrics.totalInboundGB, format: fmtGB, recommendedNote: undefined },
  ];

  return (
    <div className="stack">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col" className="num">
                Current ({snapshot.workspaceLabel})
              </th>
              <th scope="col" className="num">
                Recommended
              </th>
              <th scope="col">Delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="row-head">
                  {r.label}
                </th>
                <td className="num mono">{r.current === null ? <span className="muted">--</span> : r.format(r.current)}</td>
                <td className="num mono">{r.recommended === null ? <span className="muted">{r.recommendedNote ?? '--'}</span> : r.format(r.recommended)}</td>
                <td>
                  <Delta current={r.current} recommended={r.recommended} format={r.format} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {stream.length > 0 && (
        <div className="stack stack--sm">
          <Text variant="body-xs-semibold" color="secondary">
            CURRENT WORKER GROUPS
          </Text>
          <div className="row">
            {stream.map((g) => (
              <span key={g.id} className="chip">
                {`${g.name || g.id} · ${g.onPrem ? `${g.workerCount} nodes · ${g.totalVcpus} vCPU` : 'Cribl-managed'}`}
              </span>
            ))}
          </div>
        </div>
      )}
      <Text variant="body-xs-normal" color="secondary">
        {`Imported ${new Date(snapshot.importedAt).toLocaleString()}${snapshot.sample ? ' (sample workspace data)' : ''}. Recommended values come from this design's sizing; a positive delta means more capacity is recommended than is deployed today.`}
      </Text>
    </div>
  );
}
