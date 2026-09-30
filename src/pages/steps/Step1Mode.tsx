import { Text, TextField } from '@capra/core';
import { BadgeCheck, Bolt, CheckOutlined, EditOutlined, TriangleExclamation } from '@capra/icons';
import { MODE_OPTIONS } from '../../model/catalog';
import type { Mode } from '../../model/types';
import { useDesign } from '../../state/DesignStore';
import { Callout, InfoTip, PageHeader, Section, WizardFooter } from '../../ui/layout';
import { useStepNav } from '../../ui/useStepNav';
import { ChoiceTile } from './inputs/shared';
import './inputs/inputs.css';

const MODE_ICONS: Record<Mode, typeof Bolt> = { poc: Bolt, production: BadgeCheck };

export default function Step1Mode() {
  const { design, set } = useDesign();
  const { next } = useStepNav(1);
  const isPoc = design.mode === 'poc';

  return (
    <>
      <PageHeader
        eyebrow={<span className="chip chip--brand">Step 1 of 7</span>}
        title="Step 1: Select Deployment Mode"
        description="This determines the baseline architecture requirements and high availability considerations"
      />

      <Section title="Design details" description="Name this design and the customer it is for. Both appear on the architecture, deployment plan and exports." icon={<EditOutlined size="sm" />}>
        <div className="grid-2">
          <TextField label="Design name" value={design.name} placeholder="e.g. Acme Corp — SOC modernization" onChange={(v) => set({ name: v })} />
          <TextField label="Customer" value={design.customer} placeholder="e.g. Acme Corp" helperText="Optional" onChange={(v) => set({ customer: v })} />
        </div>
      </Section>

      <Section
        title={
          <span className="in-inline-heading">
            Deployment mode
            <InfoTip text="Choose whether this is a proof-of-concept or production deployment. This affects architecture requirements and best practices." />
          </span>
        }
        description="Pick the target for this design. You can change it at any time; sizing and recommendations update automatically."
      >
        <div className="in-mode-grid" role="group" aria-label="Deployment mode">
          {MODE_OPTIONS.map((opt) => {
            const Icon = MODE_ICONS[opt.value];
            return (
              <ChoiceTile
                key={opt.value}
                className="in-mode-tile"
                selected={design.mode === opt.value}
                onSelect={() => set({ mode: opt.value })}
                icon={<Icon size="lg" />}
                title={opt.label}
                description={opt.description}
              >
                <span className="in-tile__bullets" role="list">
                  {opt.bullets.map((b) => {
                    const caution = /not production/i.test(b);
                    return (
                      <span role="listitem" key={b} className={`in-tile__bullet ${caution ? 'is-caution' : ''}`}>
                        {caution ? <TriangleExclamation size="sm" /> : <CheckOutlined size="sm" />}
                        <Text variant="body-sm-normal">{b}</Text>
                      </span>
                    );
                  })}
                </span>
              </ChoiceTile>
            );
          })}
        </div>

        <Callout tone={isPoc ? 'warning' : 'accent'} title={`Current Selection: ${isPoc ? 'POC' : 'Production'} Mode`}>
          {isPoc
            ? 'POC mode allows simplified architectures for testing. Not recommended for production workloads.'
            : 'Production mode enforces distributed architecture and high availability best practices.'}
        </Callout>
      </Section>

      <WizardFooter next={{ label: 'Next: Define Sources & Destinations', onClick: next }} />
    </>
  );
}
