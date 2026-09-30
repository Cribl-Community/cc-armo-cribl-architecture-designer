import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { calculateArchitecture } from '../engine/architecture';
import { applyStepEffort, generateDeploymentPlan, type DeploymentPlan } from '../engine/deploymentPlan';
import { blankDesign, makeDestination, makeSource, newId, sampleDesign } from '../model/factory';
import type { ArchitectureResult, Design, Destination, Drivers, SourceGroup } from '../model/types';
import { getUser, isInCribl, kv, kvDegraded } from '../platform/cribl';

export interface DesignSummary {
  id: string;
  name: string;
  customer: string;
  mode: Design['mode'];
  deploymentModel: Drivers['deploymentModel'];
  sources: number;
  destinations: number;
  inboundGB: number;
  updatedAt: string;
  maxStepReached: number;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface StoreValue {
  ready: boolean;
  connected: boolean;
  userName: string;
  summaries: DesignSummary[];
  current: Design | null;
  loadingId: string | null;
  saveState: SaveState;
  error: string | null;
  openDesign: (id: string) => Promise<void>;
  createDesign: (seed?: Design) => Promise<string>;
  duplicateDesign: (id: string) => Promise<string>;
  deleteDesign: (id: string) => Promise<void>;
  update: (updater: (d: Design) => Design) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const summarize = (d: Design): DesignSummary => ({
  id: d.id,
  name: d.name,
  customer: d.customer,
  mode: d.mode,
  deploymentModel: d.drivers.deploymentModel,
  sources: d.sources.length,
  destinations: d.destinations.length,
  inboundGB: d.sources.reduce((a, s) => a + (s.volumeGBPerDay || 0), 0),
  updatedAt: d.updatedAt,
  maxStepReached: d.maxStepReached,
});

export function DesignStoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userName, setUserName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [summaries, setSummaries] = useState<DesignSummary[]>([]);
  const [current, setCurrent] = useState<Design | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const summariesRef = useRef<DesignSummary[]>([]);
  summariesRef.current = summaries;

  const indexKey = `${prefix}/index`;
  const designKey = (id: string) => `${prefix}/design/${id}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await getUser();
        if (cancelled) return;
        // Cribl user ids look like "auth0|66fd…"; KV keys must be path-safe.
        const p = `designs/${user.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
        setPrefix(p);
        setUserName(user.firstName ?? user.username);
        let index = await kv.getJson<DesignSummary[]>(`${p}/index`);
        if (!Array.isArray(index)) {
          // First run: seed a sample design so the App is explorable immediately.
          const sample = { ...sampleDesign(), id: 'sample-acme' };
          await kv.putJson(`${p}/design/${sample.id}`, sample);
          index = [summarize(sample)];
          await kv.putJson(`${p}/index`, index);
        }
        if (!cancelled) {
          setSummaries(index);
          const degraded = kvDegraded();
          if (degraded) setError(`Designs are kept for this session only: Cribl storage rejected the save. ${degraded}`);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load saved designs');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const writeIndex = useCallback(
    async (next: DesignSummary[]) => {
      setSummaries(next);
      await kv.putJson(indexKey, next);
    },
    [indexKey],
  );

  const persist = useCallback(
    async (d: Design) => {
      setSaveState('saving');
      try {
        await kv.putJson(designKey(d.id), d);
        const others = summariesRef.current.filter((s) => s.id !== d.id);
        await writeIndex([summarize(d), ...others]);
        const degraded = kvDegraded();
        if (degraded) {
          setSaveState('error');
          setError(`Session only: ${degraded}`);
        } else {
          setSaveState('saved');
        }
      } catch (e) {
        setSaveState('error');
        setError(e instanceof Error ? e.message : 'Save failed');
      }
    },
    [prefix, writeIndex],
  );

  const openDesign = useCallback(
    async (id: string) => {
      if (current?.id === id) return;
      setLoadingId(id);
      setError(null);
      try {
        const d = await kv.getJson<Design>(designKey(id));
        if (!d) throw new Error('Design not found. It may have been deleted.');
        setCurrent(d);
        setSaveState('idle');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not open design');
        setCurrent(null);
      } finally {
        setLoadingId(null);
      }
    },
    [current?.id, prefix],
  );

  const createDesign = useCallback(
    async (seed?: Design) => {
      const d = seed ?? blankDesign();
      const now = new Date().toISOString();
      const fresh = { ...d, createdAt: d.createdAt ?? now, updatedAt: now };
      setCurrent(fresh);
      await persist(fresh);
      return fresh.id;
    },
    [persist],
  );

  const duplicateDesign = useCallback(
    async (id: string) => {
      const d = await kv.getJson<Design>(designKey(id));
      if (!d) throw new Error('Design not found');
      const copy: Design = { ...structuredClone(d), id: newId(), name: `${d.name} (copy)`, createdAt: new Date().toISOString() };
      await persist(copy);
      return copy.id;
    },
    [persist, prefix],
  );

  const deleteDesign = useCallback(
    async (id: string) => {
      await kv.delete(designKey(id));
      await writeIndex(summariesRef.current.filter((s) => s.id !== id));
      if (current?.id === id) setCurrent(null);
    },
    [current?.id, prefix, writeIndex],
  );

  const update = useCallback(
    (updater: (d: Design) => Design) => {
      setCurrent((prev) => {
        if (!prev) return prev;
        const next = { ...updater(prev), updatedAt: new Date().toISOString() };
        window.clearTimeout(saveTimer.current);
        setSaveState('saving');
        saveTimer.current = window.setTimeout(() => void persist(next), 700);
        return next;
      });
    },
    [persist],
  );

  const value = useMemo<StoreValue>(
    () => ({ ready, connected: isInCribl(), userName, summaries, current, loadingId, saveState, error, openDesign, createDesign, duplicateDesign, deleteDesign, update }),
    [ready, userName, summaries, current, loadingId, saveState, error, openDesign, createDesign, duplicateDesign, deleteDesign, update],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within DesignStoreProvider');
  return ctx;
}

/** The open design plus its computed architecture and deployment plan. Only use under a route with an open design. */
export function useDesign() {
  const { current, update } = useStore();
  if (!current) throw new Error('No design is open');
  const design = current;
  const result: ArchitectureResult = useMemo(() => calculateArchitecture(design), [design]);
  const plan: DeploymentPlan = useMemo(() => applyStepEffort(generateDeploymentPlan(result, design), design.plan), [result, design]);

  const actions = useMemo(
    () => ({
      set: (patch: Partial<Design>) => update((d) => ({ ...d, ...patch })),
      setDrivers: (patch: Partial<Drivers>) => update((d) => ({ ...d, drivers: { ...d.drivers, ...patch } })),
      setPlan: (patch: Partial<Design['plan']>) => update((d) => ({ ...d, plan: { ...d.plan, ...patch } })),
      addSource: (partial: Partial<SourceGroup> & { type: string }) => update((d) => ({ ...d, sources: [...d.sources, makeSource(partial)] })),
      updateSource: (id: string, patch: Partial<SourceGroup>) => update((d) => ({ ...d, sources: d.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
      removeSource: (id: string) => update((d) => ({ ...d, sources: d.sources.filter((s) => s.id !== id) })),
      addDestination: (partial: Partial<Destination> & { type: string }) => update((d) => ({ ...d, destinations: [...d.destinations, makeDestination(partial)] })),
      updateDestination: (id: string, patch: Partial<Destination>) => update((d) => ({ ...d, destinations: d.destinations.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      removeDestination: (id: string) =>
        update((d) => ({
          ...d,
          destinations: d.destinations.filter((x) => x.id !== id),
          sources: d.sources.map((s) => ({ ...s, destinationIds: s.destinationIds.filter((x) => x !== id) })),
        })),
      toggleRoute: (sourceId: string, destId: string) =>
        update((d) => ({
          ...d,
          sources: d.sources.map((s) =>
            s.id !== sourceId ? s : { ...s, destinationIds: s.destinationIds.includes(destId) ? s.destinationIds.filter((x) => x !== destId) : [...s.destinationIds, destId] },
          ),
        })),
      reachStep: (step: number) => update((d) => (d.maxStepReached >= step ? d : { ...d, maxStepReached: step })),
    }),
    [update],
  );

  return { design, result, plan, ...actions };
}
