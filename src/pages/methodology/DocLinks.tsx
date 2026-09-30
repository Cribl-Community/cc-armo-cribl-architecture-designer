import { Link, Text } from '@capra/core';
import { ArrowUpRightFromSquare } from '@capra/icons';
import { DOCS, type DocKey } from './docs';

/** "Cribl docs:" footer for a group of claims. External links always open in a new tab. */
export function DocLinks({ keys }: { keys: DocKey[] }) {
  return (
    <div className="doc-links">
      <Text variant="body-xs-semibold" color="secondary">
        CRIBL DOCS
      </Text>
      {keys.map((k) => (
        <span key={k} className="doc-links__item">
          <Link href={DOCS[k].href} target="_blank" rel="noopener noreferrer">
            {DOCS[k].label}
          </Link>
          <ArrowUpRightFromSquare size="xs" aria-hidden />
        </span>
      ))}
    </div>
  );
}
