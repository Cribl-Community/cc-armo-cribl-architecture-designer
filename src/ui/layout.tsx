import type { ReactNode } from 'react';
import { Button, CustomTooltipTrigger, Text, Tooltip } from '@capra/core';
import { ArrowLeft, ArrowRight, CheckOutlined, CircleInfo } from '@capra/icons';
import { useNavigate } from 'react-router-dom';
import { STEPS, stepPath } from './steps';

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        {eyebrow && <div className="page-header__eyebrow">{eyebrow}</div>}
        <Text as="h1" variant="heading-lg">
          {title}
        </Text>
        {description && (
          <Text as="p" variant="body-md-normal" color="secondary">
            {description}
          </Text>
        )}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

/** A titled content section. Use instead of hand-rolled cards so spacing stays consistent. */
export function Section({ title, description, icon, actions, children, tone }: { title: ReactNode; description?: ReactNode; icon?: ReactNode; actions?: ReactNode; children: ReactNode; tone?: 'default' | 'accent' }) {
  return (
    <section className={`section ${tone === 'accent' ? 'section--accent' : ''}`}>
      <div className="section__header">
        <div className="section__title">
          {icon && <span className="section__icon">{icon}</span>}
          <div>
            <Text as="h2" variant="heading-sm">
              {title}
            </Text>
            {description && (
              <Text as="p" variant="body-sm-normal" color="secondary">
                {description}
              </Text>
            )}
          </div>
        </div>
        {actions && <div className="section__actions">{actions}</div>}
      </div>
      <div className="section__body">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, sub, tone = 'default', hint }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'accent' | 'success' | 'warning'; hint?: string }) {
  return (
    <div className={`stat-tile stat-tile--${tone}`}>
      <div className="stat-tile__label">
        <Text variant="body-xs-semibold" color="secondary">
          {label}
        </Text>
        {hint && <InfoTip text={hint} />}
      </div>
      <Text variant="metric-md">{value}</Text>
      {sub && (
        <Text variant="body-xs-normal" color="secondary">
          {sub}
        </Text>
      )}
    </div>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip title={text}>
      <CustomTooltipTrigger>
        <span className="info-tip" role="button" tabIndex={0} aria-label="More information">
          <CircleInfo size="xs" />
        </span>
      </CustomTooltipTrigger>
    </Tooltip>
  );
}

export function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'success' | 'accent'; title?: ReactNode; children: ReactNode }) {
  return (
    <div className={`callout callout--${tone}`}>
      {title && (
        <Text as="div" variant="body-sm-semibold">
          {title}
        </Text>
      )}
      <Text as="div" variant="body-sm-normal">
        {children}
      </Text>
    </div>
  );
}

export function Stepper({ designId, current, maxReached }: { designId: string; current: number; maxReached: number }) {
  const navigate = useNavigate();
  return (
    <nav className="stepper" aria-label="Design steps">
      <ol>
        {STEPS.map((s) => {
          const reachable = s.n <= maxReached;
          const state = s.n === current ? 'current' : s.n < current || (reachable && s.n !== current) ? 'done' : 'todo';
          return (
            <li key={s.n} className={`stepper__item stepper__item--${state}`}>
              <button type="button" disabled={!reachable} aria-current={s.n === current ? 'step' : undefined} onClick={() => reachable && navigate(stepPath(designId, s.n))}>
                <span className="stepper__dot">{state === 'done' ? <CheckOutlined size="xs" /> : s.n}</span>
                <span className="stepper__label">{s.short}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function WizardFooter({ onBack, backLabel = 'Back', next, extra }: { onBack?: () => void; backLabel?: string; next?: { label: string; onClick: () => void; disabled?: boolean; appearance?: 'default' | 'danger' }; extra?: ReactNode }) {
  return (
    <div className="wizard-footer">
      <div>{onBack && <Button variant="secondary" leadingIcon={ArrowLeft} onClick={onBack}>{backLabel}</Button>}</div>
      <div className="wizard-footer__right">
        {extra}
        {next && (
          <Button variant="primary" trailingIcon={ArrowRight} disabled={next.disabled} onClick={next.onClick}>
            {next.label}
          </Button>
        )}
      </div>
    </div>
  );
}

export const fmtGB = (gb: number) => (gb >= 1024 * 10 ? `${(gb / 1024).toFixed(1)} TB/day` : `${Math.round(gb).toLocaleString()} GB/day`);
export const fmtNum = (n: number) => Math.round(n).toLocaleString();
