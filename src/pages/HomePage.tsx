import { useMemo, useState } from 'react';
import { Alert, Button, EmptyState, Link, Modal, Spinner, Text } from '@capra/core';
import { BookOutlined, Plus, RocketLaunch, TableOutlined } from '@capra/icons';
import { useNavigate } from 'react-router-dom';
import { sampleDesign } from '../model/factory';
import { useHostTheme } from '../platform/hostTheme';
import { useStore, type DesignSummary } from '../state/DesignStore';
import { InfoTip, PageHeader, Section, StatTile, fmtGB } from '../ui/layout';
import { ProductLogo } from '../ui/logos';
import { stepPath } from '../ui/steps';
import { DesignsTable } from './home/DesignsTable';
import { HowItWorks } from './home/HowItWorks';
import { relativeTime } from './home/relativeTime';
import './home/home.css';

type Notice = { appearance: 'success' | 'danger'; title: string; message: string; openId?: string };

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function HomePage() {
  const { ready, connected, userName, summaries, createDesign, duplicateDesign, deleteDesign, error } = useStore();
  const theme = useHostTheme();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<'blank' | 'sample' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DesignSummary | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const stats = useMemo(() => {
    const latest = summaries.reduce<string | null>((a, s) => (!a || s.updatedAt > a ? s.updatedAt : a), null);
    return {
      count: summaries.length,
      production: summaries.filter((s) => s.mode === 'production').length,
      inbound: summaries.reduce((a, s) => a + (s.inboundGB || 0), 0),
      largest: summaries.reduce((a, s) => Math.max(a, s.inboundGB || 0), 0),
      latest,
    };
  }, [summaries]);

  if (!ready) {
    return (
      <div className="center-state">
        <Spinner size="lg" title="Loading your designs" />
      </div>
    );
  }

  const create = async (kind: 'blank' | 'sample') => {
    setCreating(kind);
    setNotice(null);
    try {
      const id = kind === 'sample' ? await createDesign(sampleDesign()) : await createDesign();
      navigate(stepPath(id, kind === 'sample' ? 5 : 1));
    } catch (e) {
      setNotice({ appearance: 'danger', title: 'Could not create the design', message: errMsg(e, 'Unknown error while saving.') });
      setCreating(null);
    }
  };

  const duplicate = async (s: DesignSummary) => {
    setBusyId(s.id);
    setNotice(null);
    try {
      const id = await duplicateDesign(s.id);
      setNotice({ appearance: 'success', title: 'Design duplicated', message: `Created “${s.name} (copy)”.`, openId: id });
    } catch (e) {
      setNotice({ appearance: 'danger', title: `Could not duplicate “${s.name}”`, message: errMsg(e, 'Unknown error.') });
    } finally {
      setBusyId(null);
    }
  };

  const askDelete = (s: DesignSummary) => {
    setDeleteTarget(s);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    setBusyId(target.id);
    try {
      await deleteDesign(target.id);
      setNotice({ appearance: 'success', title: 'Design deleted', message: `“${target.name}” was permanently deleted.` });
    } catch (e) {
      setNotice({ appearance: 'danger', title: `Could not delete “${target.name}”`, message: `${errMsg(e, 'Unknown error.')} The design was not removed.` });
    } finally {
      setDeleting(false);
      setBusyId(null);
      setDeleteOpen(false);
    }
  };

  const greeting = userName ? `Welcome, ${userName}` : 'Welcome';

  return (
    <div className="page home">
      <PageHeader
        eyebrow={
          <>
            <ProductLogo product="stream" size="sm" />
            {connected ? (
              <span className="chip chip--success home-status">
                <span className="home-status__dot" aria-hidden />
                Connected to your Cribl workspace
              </span>
            ) : (
              <span className="home-status-wrap">
                <span className="chip chip--warning home-status">
                  <span className="home-status__dot" aria-hidden />
                  Local demo mode
                </span>
                <InfoTip text="Running outside Cribl: designs are kept in memory and are lost when you reload. Install the App in Cribl to save designs to the app-scoped KV store." />
              </span>
            )}
          </>
        }
        title="ArMo - Cribl Architecture Designer"
        description="Design, size and plan Cribl deployments — grounded in Cribl's sizing guidance and your live workspace."
        actions={
          <>
            <Button variant="secondary" leadingIcon={RocketLaunch} pending={creating === 'sample'} disabled={creating !== null} onClick={() => void create('sample')}>
              Start from sample
            </Button>
            <Button variant="primary" leadingIcon={Plus} pending={creating === 'blank'} disabled={creating !== null} onClick={() => void create('blank')}>
              New design
            </Button>
          </>
        }
      />

      {error && (
        <Alert appearance="danger" title="Something went wrong">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert
          appearance={notice.appearance}
          title={notice.title}
          onDismiss={notice.appearance === 'success' ? () => setNotice(null) : undefined}
          action={notice.openId ? { label: 'Open copy', onClick: () => navigate(`/designs/${notice.openId}`) } : notice.appearance === 'danger' ? { label: 'Dismiss', onClick: () => setNotice(null) } : undefined}
        >
          {notice.message}
        </Alert>
      )}

      <section className="home-hero" aria-label={greeting}>
        <div className="home-hero__text">
          <Text as="h2" variant="heading-md">
            {greeting}
          </Text>
          <Text as="p" variant="body-md-normal" color="secondary">
            Turn a customer's Sources, Destinations and volumes into a Cribl architecture: Worker Groups sized per Cribl's published guidance, Edge Fleets, Persistent Queue disk, a deployment plan,
            and the config to build it.{' '}
            <Link href="/methodology">See the methodology</Link>
          </Text>
        </div>
        <div className="home-hero__products" aria-label="Cribl products covered">
          {(['stream', 'edge', 'lake', 'search'] as const).map((p) => (
            <span key={p} className="home-hero__product">
              <ProductLogo product={p} size="md" />
              <Text variant="body-sm-semibold">{p === 'stream' ? 'Stream' : p === 'edge' ? 'Edge' : p === 'lake' ? 'Lake' : 'Search'}</Text>
            </span>
          ))}
        </div>
      </section>

      {stats.count > 0 && (
        <div className="home-kpis">
          <StatTile label="Designs" value={stats.count} sub={connected ? 'Saved in Cribl' : 'This session'} tone="accent" />
          <StatTile label="Production" value={stats.production} sub={`${stats.count - stats.production} POC`} />
          <StatTile label="Inbound designed" value={fmtGB(stats.inbound)} sub={`Largest: ${fmtGB(stats.largest)}`} />
          <StatTile label="Last activity" value={stats.latest ? relativeTime(stats.latest) : '--'} sub="Most recent update" />
        </div>
      )}

      <Section title="How it works" description="Seven steps from discovery to a buildable Cribl configuration." icon={<BookOutlined />}>
        <HowItWorks />
      </Section>

      <Section
        title="Your designs"
        description={stats.count > 0 ? `${stats.count} design${stats.count === 1 ? '' : 's'}${connected ? ' saved to the Cribl KV store' : ' in local demo mode'}.` : undefined}
        icon={<TableOutlined />}
      >
        {summaries.length === 0 ? (
          <EmptyState
            illustration="EmptyFolder"
            theme={theme}
            size="lg"
            title="No designs yet"
            description="Start a blank design, or explore a realistic enterprise SOC sample that is already sized and planned."
          >
            <div className="row home-empty-actions">
              <Button variant="secondary" leadingIcon={RocketLaunch} pending={creating === 'sample'} disabled={creating !== null} onClick={() => void create('sample')}>
                Start from sample
              </Button>
              <Button variant="primary" leadingIcon={Plus} pending={creating === 'blank'} disabled={creating !== null} onClick={() => void create('blank')}>
                New design
              </Button>
            </div>
          </EmptyState>
        ) : (
          <DesignsTable summaries={summaries} busyId={busyId} onOpen={(id) => navigate(`/designs/${id}`)} onDuplicate={(s) => void duplicate(s)} onDelete={askDelete} />
        )}
      </Section>

      <Modal
        isOpen={deleteOpen}
        onIsOpenChange={(open) => {
          if (!open && !deleting) setDeleteOpen(false);
        }}
        isDismissible={!deleting}
        size="sm"
        title="Delete design?"
        footer={
          <Modal.FooterActions>
            <Button variant="secondary" disabled={deleting} onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" appearance="danger" pending={deleting} onClick={() => void confirmDelete()}>
              Delete design
            </Button>
          </Modal.FooterActions>
        }
      >
        {deleteTarget && (
          <div className="stack stack--sm">
            <Text as="p" variant="body-md-normal">
              This permanently deletes <strong>“{deleteTarget.name}”</strong>
              {deleteTarget.customer ? ` for ${deleteTarget.customer}` : ''}, including its Sources, sizing inputs and deployment plan progress, from{' '}
              {connected ? 'the App’s KV store in your Cribl workspace' : 'this demo session'}.
            </Text>
            <Text as="p" variant="body-md-semibold">
              This can’t be undone.
            </Text>
          </div>
        )}
      </Modal>
    </div>
  );
}
