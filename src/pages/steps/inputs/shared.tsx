import type { ReactNode } from 'react';
import { Label, Text } from '@capra/core';
import { Check } from '@capra/icons';
import { InfoTip } from '../../../ui/layout';
import './inputs.css';

/** A Capra label with an info tooltip, placed above a field that is labelled via `aria-label`. */
export function TipField({ label, tip, children, narrow }: { label: string; tip: string; children: ReactNode; narrow?: boolean }) {
  return (
    <div className={`in-field ${narrow ? 'in-field--narrow' : ''}`}>
      <Label trailingSlot={<InfoTip text={tip} />}>{label}</Label>
      {children}
    </div>
  );
}

/** Heading text followed by an info tooltip. */
export function TipHeading({ children, tip, variant = 'body-md-semibold' }: { children: string; tip: string; variant?: 'body-md-semibold' | 'body-sm-semibold' | 'heading-xs' }) {
  return (
    <div className="in-inline-heading">
      <Text as="h3" variant={variant}>
        {children}
      </Text>
      <InfoTip text={tip} />
    </div>
  );
}

/** Large selectable tile built on the shared `.choice-tile` button style. */
export function ChoiceTile({
  selected,
  onSelect,
  disabled,
  icon,
  title,
  description,
  children,
  className = '',
  compactIcon,
}: {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  compactIcon?: boolean;
}) {
  return (
    <button type="button" className={`choice-tile in-tile ${className}`} aria-pressed={selected} disabled={disabled} onClick={onSelect}>
      <span className="in-tile__check" aria-hidden>
        <Check size="xs" />
      </span>
      <span className="in-tile__head">
        {icon && <span className={`in-tile__icon ${compactIcon ? 'in-tile__icon--sm' : ''}`}>{icon}</span>}
        <span className="in-tile__text">
          <Text as="span" variant="body-md-semibold">
            {title}
          </Text>
          {description && (
            <Text as="span" variant="body-sm-normal" color="secondary">
              {description}
            </Text>
          )}
        </span>
      </span>
      {children}
    </button>
  );
}
