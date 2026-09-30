import { Text } from '@capra/core';
import { CalendarOutlined, Flag, NodesOutlined, Packs, RocketLaunch, Sliders, Sources } from '@capra/icons';
import { STEPS } from '../../ui/steps';

type Icon = typeof Flag;

const STEP_DETAILS: Record<number, { icon: Icon; description: string }> = {
  1: { icon: Flag, description: 'POC or Production. Production sets the HA rules and the 3-node minimum per Worker Group.' },
  2: { icon: Sources, description: 'Source groups with volume, complexity and PQ, mapped to their Destinations. Import from your workspace.' },
  3: { icon: Sliders, description: 'Deployment model, Worker Group strategy, node size, x86 or ARM, peak factor and filtering.' },
  4: { icon: Packs, description: 'Cribl Lake, Search and Guard, plus the outage window Persistent Queues must absorb.' },
  5: { icon: NodesOutlined, description: 'Sized Worker Groups, Edge Fleets, ports and every decision with the reason behind it.' },
  6: { icon: CalendarOutlined, description: 'A phased deployment timeline with owners, progress tracking and PDF export.' },
  7: { icon: RocketLaunch, description: 'A preview of the Cribl REST config for every group, Source, Destination and Route.' },
};

export function HowItWorks() {
  return (
    <ol className="how-it-works" aria-label="How it works">
      {STEPS.map((s) => {
        const d = STEP_DETAILS[s.n];
        const I = d.icon;
        return (
          <li key={s.n} className="how-step">
            <div className="how-step__top">
              <span className="how-step__icon" aria-hidden>
                <I size="md" />
              </span>
              <span className="how-step__n">{s.n}</span>
            </div>
            <Text as="h3" variant="body-md-semibold">
              {s.title}
            </Text>
            <Text as="p" variant="body-sm-normal" color="secondary">
              {d.description}
            </Text>
          </li>
        );
      })}
    </ol>
  );
}
