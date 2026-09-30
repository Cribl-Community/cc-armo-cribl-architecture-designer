import { useState } from 'react';
import { Button } from '@capra/core';
import { ArrowsMaximize, ArrowsMinimize, NodesOutlined } from '@capra/icons';
import { ArchitectureDiagram } from '../../features/diagram/ArchitectureDiagram';
import { DEPLOYMENT_MODEL_OPTIONS, WORKER_GROUP_STRATEGY_OPTIONS } from '../../model/catalog';
import { useDesign } from '../../state/DesignStore';
import { PageHeader, Section, WizardFooter } from '../../ui/layout';
import { useStepNav } from '../../ui/useStepNav';
import { DecisionsSection } from './architecture/DecisionsSection';
import { FeaturesSection } from './architecture/FeaturesSection';
import { InsightsSection, WarningsSection } from './architecture/FindingsSection';
import { InfrastructureSection } from './architecture/InfrastructureSection';
import { KpiStrip } from './architecture/KpiStrip';
import { SizingSection } from './architecture/SizingSection';
import './architecture/architecture.css';

export default function Step5Architecture() {
  const { design, result } = useDesign();
  const { next, back } = useStepNav(5);
  const [tall, setTall] = useState(false);

  const deployment = DEPLOYMENT_MODEL_OPTIONS.find((o) => o.value === design.drivers.deploymentModel)?.label ?? design.drivers.deploymentModel;
  const strategy = WORKER_GROUP_STRATEGY_OPTIONS.find((o) => o.value === design.drivers.workerGroupStrategy)?.label ?? '';
  const warningCount = result.warnings.filter((w) => w.severity === 'warning').length;

  return (
    <div className="arch-page">
      <PageHeader
        eyebrow={
          <>
            <span className="chip chip--brand">{strategy}</span>
            <span className="chip">
              {result.architecture.workerGroups.length} Worker Group{result.architecture.workerGroups.length === 1 ? '' : 's'} · {deployment}
            </span>
            {warningCount > 0 && <span className="chip chip--warning">{warningCount} to review</span>}
          </>
        }
        title="Architecture"
        description="Your Cribl architecture, sized from the sources, Destinations and drivers you entered: the diagram, the math behind every number, and the reasoning behind every component."
      />

      <KpiStrip design={design} result={result} />

      <Section
        title="Architecture diagram"
        icon={<NodesOutlined size="sm" />}
        description="Sources flow left to right through collection, load balancing and the Worker Groups to Destinations. The Leader manages every Worker Group and Edge Fleet over the control plane."
        actions={
          <Button variant="secondary" size="sm" leadingIcon={tall ? ArrowsMinimize : ArrowsMaximize} onClick={() => setTall((t) => !t)}>
            {tall ? 'Compact view' : 'Expand'}
          </Button>
        }
      >
        <ArchitectureDiagram key={tall ? 'tall' : 'compact'} design={design} result={result} height={tall ? 980 : 720} />
      </Section>

      <SizingSection design={design} result={result} />
      <FeaturesSection design={design} result={result} />
      <InfrastructureSection design={design} result={result} />
      <DecisionsSection decisions={result.decisions} />
      <WarningsSection warnings={result.warnings} />
      <InsightsSection insights={result.insights} />

      <WizardFooter onBack={back} next={{ label: 'Generate Deployment Plan', onClick: next }} />
    </div>
  );
}
