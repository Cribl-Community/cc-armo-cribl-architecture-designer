import { useEffect, useRef, useState } from 'react';
import { Button, Text } from '@capra/core';
import { CheckOutlined, CopyOutlined } from '@capra/icons';
import { copyOrDownload, type CopyOutcome } from './clipboard';
import { slugId, type ConfigRequest } from './configPreview';
import { JsonView } from './JsonView';

const KIND_LABEL: Record<ConfigRequest['kind'], string> = {
  group: 'Worker Group',
  settings: 'Settings',
  pipeline: 'Pipeline',
  output: 'Destination',
  input: 'Source',
  collector: 'Collector',
  routes: 'Routes',
  fleet: 'Edge Fleet',
  fleetPipeline: 'Pipeline',
  fleetOutput: 'Destination',
};

export function RequestCard({ request }: { request: ConfigRequest }) {
  const [outcome, setOutcome] = useState<CopyOutcome | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const result = await copyOrDownload(JSON.stringify(request.body, null, 2), `${slugId(request.key, '-')}.json`);
    setOutcome(result);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOutcome(null), 4000);
  };

  return (
    <article className="req-card">
      <header className="req-card__header">
        <div className="req-card__title">
          <div className="row">
            <span className={`req-method req-method--${request.method.toLowerCase()}`}>{request.method}</span>
            <code className="mono req-card__path">{request.path}</code>
          </div>
          <div className="row">
            <span className="chip">{KIND_LABEL[request.kind]}</span>
            <Text variant="body-sm-semibold">{request.title}</Text>
          </div>
        </div>
        <div className="req-card__actions">
          <span className="req-card__status" aria-live="polite">
            {outcome === 'copied' && (
              <>
                <CheckOutlined size="xs" />
                <Text variant="body-xs-normal">Copied</Text>
              </>
            )}
            {outcome === 'downloaded' && <Text variant="body-xs-normal">Clipboard blocked, downloaded instead</Text>}
          </span>
          <Button size="sm" variant="tertiary" leadingIcon={CopyOutlined} onClick={() => void copy()}>
            Copy
          </Button>
        </div>
      </header>
      {request.notes.length > 0 && (
        <ul className="req-card__notes">
          {request.notes.map((n) => (
            <li key={n}>
              <Text variant="body-xs-normal" color="secondary">
                {n}
              </Text>
            </li>
          ))}
        </ul>
      )}
      <JsonView value={request.body} label={`${request.method} ${request.path} request body`} />
    </article>
  );
}
