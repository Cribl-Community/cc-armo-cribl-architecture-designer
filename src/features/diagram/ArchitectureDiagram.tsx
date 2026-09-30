import { useCallback, useMemo, useState } from 'react';
import { Background, BackgroundVariant, Controls, ReactFlow, type NodeMouseHandler } from '@xyflow/react';
import type { ArchitectureResult, Design } from '../../model/types';
import { useHostTheme } from '../../platform/hostTheme';
import { EDGE_VARIANTS, buildDiagram, markerId, type DiagramEdge, type DiagramNode, type EdgeVariant } from './buildDiagram';
import { edgeTypes } from './edges';
import { nodeTypes } from './nodes';
import './diagram.css';

const PASSIVE_TYPES = new Set(['frame', 'lane']);

const LEGEND_EDGES: Record<EdgeVariant, string> = {
  endpoint: 'Edge → Stream (Cribl TCP, push)',
  network: 'Syslog (push)',
  cloud: 'Cloud API (pull)',
  mixed: 'Load-balanced push',
  out: 'Routed to Destination',
  lake: 'Routed to Cribl Lake',
  control: 'Control plane (4200)',
};

/** Arrow markers referenced by edges via `markerEnd: 'cad-arrow-<variant>'`; filled by CSS tokens. */
function MarkerDefs() {
  return (
    <svg className="cad-markers" aria-hidden focusable="false">
      <defs>
        {EDGE_VARIANTS.map((v) => (
          <marker key={v} id={markerId(v)} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M 1 1.5 L 11 6 L 1 10.5 Z" className={`cad-marker cad-marker--${v}`} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}

function hasOverlap(a: string[], b: Set<string>) {
  return a.some((x) => b.has(x));
}

export function ArchitectureDiagram({ design, result, height = 640 }: { design: Design; result: ArchitectureResult; height?: number }) {
  const theme = useHostTheme();
  const model = useMemo(() => buildDiagram(design, result), [design, result]);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const onEnter = useCallback<NodeMouseHandler<DiagramNode>>((_, node) => {
    if (!PASSIVE_TYPES.has(node.type ?? '')) setHoverId(node.id);
  }, []);
  const onLeave = useCallback(() => setHoverId(null), []);

  /* Hover lineage: highlight every edge that carries data of the hovered element's source groups. */
  const { nodes, edges } = useMemo((): { nodes: DiagramNode[]; edges: DiagramEdge[] } => {
    const hovered = hoverId ? model.nodes.find((n) => n.id === hoverId) : undefined;
    if (!hovered) return model;
    const flows = new Set<string>('flows' in hovered.data ? (hovered.data.flows as string[]) : []);
    const isDest = hovered.type === 'destination';
    const hotEdges = new Set<string>();
    const hotNodes = new Set<string>([hovered.id]);
    for (const e of model.edges) {
      const touches = e.source === hovered.id || e.target === hovered.id;
      let hot: boolean;
      if (e.data?.variant === 'control') hot = touches;
      else if (isDest && e.target.startsWith('dest-')) hot = e.target === hovered.id;
      else hot = touches || hasOverlap(e.data?.flows ?? [], flows);
      if (hot) {
        hotEdges.add(e.id);
        hotNodes.add(e.source);
        hotNodes.add(e.target);
      }
    }
    return {
      nodes: model.nodes.map((n) =>
        PASSIVE_TYPES.has(n.type ?? '') ? n : ({ ...n, className: hotNodes.has(n.id) ? 'cad-node--hot' : 'cad-node--dim' } as DiagramNode),
      ),
      edges: model.edges.map((e) => {
        const hot = hotEdges.has(e.id);
        return { ...e, className: `${e.className ?? ''} ${hot ? 'cad-edge--hot' : 'cad-edge--dim'}`, data: e.data ? { ...e.data, dim: !hot } : e.data };
      }),
    };
  }, [model, hoverId]);

  const legendNodes: { tone: string; label: string }[] = [
    { tone: 'endpoint', label: 'Endpoint' },
    { tone: 'network', label: 'Network' },
    { tone: 'cloud', label: 'Cloud' },
    { tone: 'cribl', label: 'Cribl component' },
  ];

  return (
    <div className="cad-diagram">
      <MarkerDefs />
      <div className="cad-flow" style={{ height }}>
        <ReactFlow<DiagramNode, DiagramEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode={theme}
          fitView
          fitViewOptions={{ padding: 0.06 }}
          minZoom={0.15}
          maxZoom={1.75}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          zoomOnScroll={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          onNodeMouseEnter={onEnter}
          onNodeMouseLeave={onLeave}
          attributionPosition="bottom-right"
          aria-label="Cribl architecture diagram"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      </div>
      <div className="cad-legend" aria-label="Diagram legend">
        <div className="cad-legend__group">
          {model.variants.map((v) => (
            <span key={v} className="cad-legend__item">
              <svg className="cad-legend__line" width="34" height="10" aria-hidden>
                <line x1="1" y1="5" x2="26" y2="5" className={`cad-legend__stroke cad-legend__stroke--${v}`} />
                <path d="M 26 1 L 33 5 L 26 9 Z" className={`cad-marker cad-marker--${v}`} />
              </svg>
              {LEGEND_EDGES[v]}
            </span>
          ))}
        </div>
        <div className="cad-legend__group">
          {legendNodes.map((n) => (
            <span key={n.tone} className="cad-legend__item">
              <span className={`cad-legend__swatch cad-accent--${n.tone}`} aria-hidden />
              {n.label}
            </span>
          ))}
          <span className="cad-legend__item cad-muted">Hover any card to trace its data path · Ctrl/⌘ + scroll to zoom</span>
        </div>
      </div>
    </div>
  );
}
