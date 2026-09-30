import { useState } from 'react';
import { Button, Tag, Text, TextField } from '@capra/core';
import { Plus } from '@capra/icons';
import type { PlanState } from '../../../model/types';
import { partyColor } from './planUtils';

interface Props {
  planState: PlanState;
  onChange: (patch: Partial<PlanState>) => void;
}

export function PartyPanel({ planState, onChange }: Props) {
  const { parties, categoryParties } = planState;
  const [draft, setDraft] = useState('');
  const name = draft.trim();
  const duplicate = name !== '' && parties.some((p) => p.toLowerCase() === name.toLowerCase());

  const add = () => {
    if (!name || duplicate) return;
    onChange({ parties: [...parties, name] });
    setDraft('');
  };

  const remove = (party: string) => {
    const nextAssignments: PlanState['categoryParties'] = {};
    for (const [catId, list] of Object.entries(categoryParties)) {
      const kept = list.filter((p) => p !== party);
      if (kept.length) nextAssignments[catId] = kept;
    }
    onChange({ parties: parties.filter((p) => p !== party), categoryParties: nextAssignments });
  };

  const assignedCount = (party: string) => Object.values(categoryParties).filter((l) => l.includes(party)).length;

  return (
    <div className="party-panel">
      <div className="row">
        {parties.map((p) => (
          <Tag key={p} color={partyColor(parties, p)} onDelete={() => remove(p)} title={`${p} · ${assignedCount(p)} categor${assignedCount(p) === 1 ? 'y' : 'ies'} assigned — remove to unassign everywhere`}>
            {p}
          </Tag>
        ))}
        {parties.length === 0 && (
          <Text variant="body-sm-normal" color="secondary">
            No parties yet — add the teams responsible for delivery.
          </Text>
        )}
      </div>
      <div className="party-panel__add">
        <div className="party-panel__input">
          <TextField
            label="Add party"
            placeholder="e.g. Security Team"
            value={draft}
            maxLength={40}
            onChange={setDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            appearance={duplicate ? 'danger' : 'default'}
            helperText={duplicate ? `"${name}" already exists` : undefined}
          />
        </div>
        <Button variant="secondary" leadingIcon={Plus} disabled={!name || duplicate} onClick={add}>
          Add
        </Button>
      </div>
      <Text variant="body-xs-normal" color="secondary">
        Click a party on each category card below to assign or unassign it. Assignments appear in the overview table, the Gantt chart and every export. Removing a party also removes all of its assignments.
      </Text>
    </div>
  );
}
