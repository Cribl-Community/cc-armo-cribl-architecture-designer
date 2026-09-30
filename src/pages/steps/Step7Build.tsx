import { useMemo, useState } from 'react';
import { Button, Collapse, CollapseGroup, Link, Text } from '@capra/core';
import { Download, FleetOutlined, Routes as RoutesIcon, SwapOutlined, WorkersOutlined } from '@capra/icons';
import { PORTS } from '../../model/catalog';
import { useDesign } from '../../state/DesignStore';
import { Callout, Section, StatTile, WizardFooter } from '../../ui/layout';
import { ProductLogo, SourceLogo } from '../../ui/logos';
import { useStepNav } from '../../ui/useStepNav';
import { downloadText } from './build/clipboard';
import { buildBundle, buildConfigPreview, bundleFileName, type ConfigRequest, type GroupConfigPreview } from './build/configPreview';
import { CurrentVsRecommended } from './build/CurrentVsRecommended';
import { RequestCard } from './build/RequestCard';
import './build/build.css';

const APPLY_ORDER = ['Worker Groups & Fleets', 'Worker Process settings', 'Pipelines', 'Destinations', 'Sources & Collectors', 'Routes', 'Commit & Deploy'];

const GROUP_SECTIONS: { title: string; kinds: ConfigRequest['kind'][] }[] = [
  { title: 'Worker Group', kinds: ['group', 'settings'] },
  { title: 'Pipelines', kinds: ['pipeline'] },
  { title: 'Destinations', kinds: ['output'] },
  { title: 'Sources & Collectors', kinds: ['input', 'collector'] },
  { title: 'Routes', kinds: ['routes'] },
];

function GroupBody({ preview }: { preview: GroupConfigPreview }) {
  const g = preview.group;
  return (
    <div className="build-group">
      <div className="build-group__facts">
        <span className={`chip ${g.managedBy === 'cribl' ? 'chip--brand' : 'chip--info'}`}>{g.managedBy === 'cribl' ? 'Cribl-managed' : 'Customer-managed'}</span>
        {g.managedBy === 'cribl' ? (
          <span className="chip">{`~${g.cloudTierTBPerDay} TB/day tier`}</span>
        ) : (
          <span className="chip">{`${g.nodes} × ${g.profile.vcpus} vCPU · ${g.totalWorkerProcesses} Worker Processes`}</span>
        )}
        {g.sources.map((s) => (
          <span key={s.id} className="chip build-group__source">
            <SourceLogo type={s.type} size="xs" />
            {s.label || s.type}
          </span>
        ))}
      </div>
      {preview.notes.length > 0 && (
        <Callout tone="info">
          {preview.notes.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </Callout>
      )}
      {GROUP_SECTIONS.map((sec) => {
        const reqs = preview.requests.filter((r) => sec.kinds.includes(r.kind));
        if (reqs.length === 0) return null;
        return (
          <div key={sec.title} className="stack stack--sm">
            <Text as="h3" variant="body-xs-semibold" color="secondary">
              {`${sec.title.toUpperCase()} · ${reqs.length}`}
            </Text>
            {reqs.map((r) => (
              <RequestCard key={r.key} request={r} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function Step7Build() {
  const { design, result } = useDesign();
  const { back } = useStepNav(7);
  const preview = useMemo(() => buildConfigPreview(design, result), [design, result]);
  const [downloaded, setDownloaded] = useState<string | null>(null);
  const { totals } = preview;
  const hasSources = design.sources.length > 0;
  const managedCount = result.architecture.workerGroups.filter((g) => g.managedBy === 'cribl').length;

  const downloadAll = () => {
    const bundle = buildBundle(design, preview);
    const name = bundleFileName(design);
    try {
      downloadText(name, JSON.stringify(bundle, null, 2));
      setDownloaded(`Downloaded ${name}`);
    } catch {
      setDownloaded('Download was blocked by the browser');
    }
  };

  return (
    <div className="stack build-page">
      <Callout tone="accent" title="Preview only: nothing is written to your workspace">
        These are the Cribl REST API requests that would build this design, generated from the sizing in step 5. Review them, copy what you need, or download the bundle. Credentials are never
        generated: replace every <code className="mono">&lt;set-in-cribl&gt;</code> and <code className="mono">&lt;…&gt;</code> placeholder in Cribl.{' '}
        <Link href="https://docs.cribl.io/api-reference/" target="_blank" rel="noopener noreferrer">
          Cribl API reference
        </Link>
      </Callout>

      <div className="stat-grid">
        <StatTile label="Worker Groups" value={totals.groups} sub={managedCount > 0 ? `${managedCount} Cribl-managed` : 'Customer-managed'} tone="accent" />
        <StatTile label="Sources" value={totals.sources} sub="Sources and Collectors" />
        <StatTile label="Destinations" value={totals.destinations} sub="Across all groups" />
        <StatTile label="Routes" value={totals.routes} sub="Plus a catch-all per group" />
        <StatTile label="Edge Fleets" value={totals.fleets} sub={totals.fleets > 0 ? `${result.metrics.totalEdgeNodes.toLocaleString()} Edge Nodes` : 'No endpoint Sources'} />
      </div>

      {!hasSources && (
        <Callout tone="warning" title="No Sources yet">
          Add Sources and Destinations in step 2 to generate Sources, Destinations and Routes. Only the Worker Group definition is shown for now.
        </Callout>
      )}

      <Section
        title="Config bundle"
        description={`${totals.requests} API requests in apply order, ready for review or scripting.`}
        icon={<ProductLogo product="stream" size="sm" />}
        actions={
          <Button variant="primary" leadingIcon={Download} onClick={downloadAll}>
            Download all as JSON
          </Button>
        }
      >
        <ol className="apply-order" aria-label="Apply order">
          {APPLY_ORDER.map((step, i) => (
            <li key={step}>
              <span className="apply-order__n">{i + 1}</span>
              <Text variant="body-sm-normal">{step}</Text>
            </li>
          ))}
        </ol>
        <div className="apply-row">
          <Button variant="secondary" disabled>
            Apply to workspace
          </Button>
          <Text variant="body-sm-normal" color="secondary">
            Coming soon: requires explicit confirmation per resource.
          </Text>
          {downloaded && (
            <span className="chip chip--success" role="status">
              {downloaded}
            </span>
          )}
        </div>
        <Text variant="body-xs-normal" color="secondary">
          After applying, commit and deploy each Worker Group and Fleet (<code className="mono">POST /version/commit</code>, then{' '}
          <code className="mono">PATCH /products/stream/groups/&#123;id&#125;/deploy</code>) so Worker Nodes pick up the new configuration.
        </Text>
      </Section>

      {design.importSnapshot && (
        <Section title="Current vs Recommended" description="Your imported workspace compared with this design's sizing." icon={<SwapOutlined />}>
          <CurrentVsRecommended snapshot={design.importSnapshot} result={result} />
        </Section>
      )}

      <Section title="Worker Groups" description="One section per Worker Group. Expand a group to review its requests." icon={<WorkersOutlined />}>
        <CollapseGroup defaultExpandedKeys={preview.groups.length > 0 ? [preview.groups[0].groupId] : []}>
          {preview.groups.map((p) => (
            <Collapse
              key={p.groupId}
              id={p.groupId}
              title={`Group ${p.group.letter}: ${p.group.name} (${p.groupId})`}
              headerTrailingContentSlot={
                <span className="build-collapse-meta">
                  <span className="chip">{`${p.counts.sources} Sources`}</span>
                  <span className="chip">{`${p.counts.destinations} Destinations`}</span>
                  <span className="chip">{`${p.counts.routes} Routes`}</span>
                </span>
              }
            >
              <GroupBody preview={p} />
            </Collapse>
          ))}
        </CollapseGroup>
      </Section>

      {preview.fleets.length > 0 && (
        <Section title="Edge Fleets" description={`One Fleet per endpoint Source, forwarding to its Worker Group over Cribl TCP ${PORTS.CRIBL_TCP}.`} icon={<FleetOutlined />}>
          <CollapseGroup>
            {preview.fleets.map((f) => (
              <Collapse
                key={f.fleetId}
                id={f.fleetId}
                title={`${f.name} (${f.fleetId})`}
                headerTrailingContentSlot={
                  <span className="build-collapse-meta">
                    <span className="chip">{`${f.nodes.toLocaleString()} Edge Nodes`}</span>
                    {f.targetGroupName && <span className="chip chip--brand">{`→ ${f.targetGroupName}`}</span>}
                  </span>
                }
              >
                <div className="build-group">
                  <div className="build-group__facts">
                    <span className="chip build-group__source">
                      <ProductLogo product="edge" size="xs" />
                      Cribl Edge
                    </span>
                    <span className="chip build-group__source">
                      <SourceLogo type={f.type} size="xs" />
                      {f.type}
                    </span>
                    <span className="chip build-group__source">
                      <RoutesIcon size="xs" />
                      <span className="mono">{`${f.targetAddress}:${PORTS.CRIBL_TCP}`}</span>
                    </span>
                  </div>
                  {f.requests.map((r) => (
                    <RequestCard key={r.key} request={r} />
                  ))}
                </div>
              </Collapse>
            ))}
          </CollapseGroup>
        </Section>
      )}

      <WizardFooter onBack={back} />
    </div>
  );
}
