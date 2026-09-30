import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps, type EdgeTypes } from '@xyflow/react';
import type { DiagramEdgeData } from './buildDiagram';

type Pt = [number, number];

/** Orthogonal polyline with rounded corners. Corner radius shrinks on short segments. */
export function roundedOrthogonalPath(points: Pt[], radius = 10): string {
  const pts = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const ax = cx - ((cx - px) / inLen) * r;
    const ay = cy - ((cy - py) / inLen) * r;
    const bx = cx + ((nx - cx) / outLen) * r;
    const by = cy + ((ny - cy) / outLen) * r;
    d += ` L ${ax},${ay} Q ${cx},${cy} ${bx},${by}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last[0]},${last[1]}`;
}

/**
 * Control-plane edge (Leader → Worker Group / Edge Fleet, port 4200).
 * Routed as a bus under the Leader and a vertical channel beside the target,
 * so it never cuts through other cards.
 */
function ControlEdge({ id, sourceX, sourceY, targetX, targetY, data, markerEnd, label }: EdgeProps<Edge<DiagramEdgeData, 'control'>>) {
  const busY = data?.busY ?? sourceY + 30;
  const channelX = data?.channelX ?? targetX - 20;
  const path = roundedOrthogonalPath(
    [
      [sourceX, sourceY],
      [sourceX, busY],
      [channelX, busY],
      [channelX, targetY],
      [targetX, targetY],
    ],
    10,
  );
  const labelY = Math.max(busY + 14, targetY - 30);
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className={`cad-control-label nodrag nopan${data?.dim ? ' cad-control-label--dim' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${channelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const edgeTypes = { control: ControlEdge } satisfies EdgeTypes;
