import { Alert, Text } from '@capra/core';
import { Lightbulb, WarningOutlined } from '@capra/icons';
import type { Insight, Warning } from '../../../model/types';
import { Section } from '../../../ui/layout';

export function WarningsSection({ warnings }: { warnings: Warning[] }) {
  const warnCount = warnings.filter((w) => w.severity === 'warning').length;
  return (
    <Section
      title="Recommendations & warnings"
      icon={<WarningOutlined size="sm" />}
      description={
        warnings.length === 0
          ? 'No open issues: the design follows Cribl guidance for the inputs provided.'
          : `${warnings.length} item${warnings.length === 1 ? '' : 's'} to review · ${warnCount} warning${warnCount === 1 ? '' : 's'}, ${warnings.length - warnCount} informational.`
      }
    >
      {warnings.length === 0 ? (
        <Alert appearance="success" title="Nothing to flag">
          Sizing, HA and routing checks all passed.
        </Alert>
      ) : (
        <div className="stack">
          {[...warnings]
            .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warning' ? -1 : 1))
            .map((w, i) => (
              <Alert key={`${w.title}-${i}`} appearance={w.severity === 'warning' ? 'warning' : 'info'} title={w.title}>
                <div className="stack stack--sm">
                  <span>{w.message}</span>
                  {w.recommendation && (
                    <span>
                      <b>Recommendation:</b> {w.recommendation}
                    </span>
                  )}
                </div>
              </Alert>
            ))}
        </div>
      )}
    </Section>
  );
}

export function InsightsSection({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <Section title="Insights" icon={<Lightbulb size="sm" />}>
      <div className="arch-insights">
        {insights.map((ins) => (
          <div key={ins.title} className="arch-insight">
            <span className="arch-insight__icon" aria-hidden>
              <Lightbulb size="sm" />
            </span>
            <div className="stack stack--sm">
              <Text as="div" variant="body-sm-semibold">
                {ins.title}
              </Text>
              <Text as="p" variant="body-sm-normal" color="secondary">
                {ins.content}
              </Text>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
