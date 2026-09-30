import { useMemo, useState } from 'react';
import { Text, ToggleButtonGroup, type Key } from '@capra/core';
import { BranchesOutlined } from '@capra/icons';
import type { Decision, DecisionType } from '../../../model/types';
import { Section } from '../../../ui/layout';

const DECISION_META: Record<DecisionType, { label: string; chip: string }> = {
  recommended: { label: 'Recommended', chip: 'chip--success' },
  best_practice: { label: 'Best Practice', chip: 'chip--info' },
  required: { label: 'Required', chip: 'chip--warning' },
  optional: { label: 'Optional', chip: '' },
};

const ORDER: DecisionType[] = ['recommended', 'best_practice', 'required', 'optional'];

type Filter = 'all' | DecisionType;

export function DecisionsSection({ decisions }: { decisions: Decision[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const counts = useMemo(() => {
    const c: Record<DecisionType, number> = { recommended: 0, best_practice: 0, required: 0, optional: 0 };
    for (const d of decisions) c[d.type] += 1;
    return c;
  }, [decisions]);
  const shown = filter === 'all' ? decisions : decisions.filter((d) => d.type === filter);

  const items = [
    { key: 'all', text: `All (${decisions.length})` },
    ...ORDER.map((t) => ({ key: t, text: `${DECISION_META[t].label} (${counts[t]})`, disabled: counts[t] === 0 })),
  ];

  return (
    <Section
      title="Architecture design decisions"
      icon={<BranchesOutlined size="sm" />}
      description="Each component in the architecture, why it is included, and what it does."
      actions={
        <ToggleButtonGroup
          aria-label="Filter decisions by type"
          size="sm"
          items={items}
          selectedKeys={[filter]}
          disallowEmptySelection
          onSelectionChange={(keys: Set<Key>) => {
            const next = [...keys][0];
            if (next) setFilter(String(next) as Filter);
          }}
        />
      }
    >
      <ol className="arch-decisions">
        {shown.map((d, i) => {
          const meta = DECISION_META[d.type];
          return (
            <li key={`${d.decision}-${i}`} className={`arch-decision arch-decision--${d.type}`}>
              <div className="arch-decision__head">
                <Text as="div" variant="body-md-semibold">
                  {d.decision}
                </Text>
                <span className={`chip ${meta.chip}`}>{meta.label}</span>
              </div>
              <Text as="div" variant="body-sm-semibold" color="primary">
                ▸ {d.outcome}
              </Text>
              <Text as="div" variant="body-sm-normal" color="secondary">
                <b>Why:</b> {d.reason}
              </Text>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
