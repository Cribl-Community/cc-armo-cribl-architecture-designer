/**
 * Read-only discovery of the user's Cribl workspace.
 *
 * Only calls the GET paths declared in config/policies.yml. Every call is independent: a failure
 * (403, timeout, unexpected body) is recorded as a `CallError` and discovery carries on with whatever
 * it could read. Requests run at most `CONCURRENCY` at a time, each with its own timeout, and all of
 * them are cancelled when the caller's AbortSignal fires (e.g. the modal closes).
 */
import { ApiError, criblGet } from '../../platform/cribl';
import { streamGroupIds, type RawWorkspace } from './mapping';

export const REQUEST_TIMEOUT_MS = 25_000;
const CONCURRENCY = 4;

export type Getter = (path: string, signal: AbortSignal) => Promise<unknown>;

export interface CallError {
  /** Stable key, e.g. "inputs:default". */
  key: string;
  /** What we were trying to read, e.g. "Sources in Worker Group default". */
  what: string;
  path: string;
  status?: number;
  message: string;
}

export interface Progress {
  done: number;
  total: number;
  current: string;
}

export class TimeoutError extends Error {
  constructor(path: string) {
    super(`Timed out after ${REQUEST_TIMEOUT_MS / 1000} s: ${path}`);
    this.name = 'TimeoutError';
  }
}

export const isAbortError = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** GET through the platform proxy with a per-request timeout, chained to the parent signal. */
export const liveGet: Getter = async (path, parent) => {
  const ctrl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctrl.abort();
  if (parent.aborted) ctrl.abort();
  else parent.addEventListener('abort', onAbort, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    return await criblGet<unknown>(path, ctrl.signal);
  } catch (e) {
    if (timedOut && !parent.aborted) throw new TimeoutError(path);
    throw e;
  } finally {
    window.clearTimeout(timer);
    parent.removeEventListener('abort', onAbort);
  }
};

/** Human-readable reason for a failed call. `forbidden` overrides the 403 wording where Cribl has a known reason. */
export function describeError(e: unknown, what: string, forbidden?: string): { status?: number; message: string } {
  if (e instanceof ApiError) {
    const s = e.status;
    if (s === 401) return { status: s, message: `Your session isn't authorized to read ${what}.` };
    if (s === 403) return { status: s, message: forbidden ?? `Your role can't read ${what}.` };
    if (s === 404) return { status: s, message: `${capitalize(what)} isn't available on this deployment.` };
    if (s === 429) return { status: s, message: `Rate-limited while reading ${what}. Try again in a minute.` };
    if (s >= 500) return { status: s, message: `Cribl returned an error (${s}) while reading ${what}.` };
    return { status: s, message: `Couldn't read ${what} (HTTP ${s}).` };
  }
  if (e instanceof TimeoutError) return { message: `Timed out after ${REQUEST_TIMEOUT_MS / 1000} s reading ${what}.` };
  if (e instanceof SyntaxError) return { message: `Cribl returned an unexpected (non-JSON) response for ${what}.` };
  if (e instanceof TypeError) return { message: `Couldn't reach the Cribl API while reading ${what}.` };
  return { message: `Couldn't read ${what}${e instanceof Error && e.message ? `: ${e.message}` : '.'}` };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Run async tasks with bounded concurrency. Tasks must handle their own errors. */
async function runPool(tasks: (() => Promise<void>)[], limit: number, signal: AbortSignal) {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      if (signal.aborted) return;
      const task = tasks[next++];
      await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

interface Call {
  key: string;
  what: string;
  path: string;
  forbidden?: string;
  assign: (value: unknown) => void;
}

/**
 * Discover groups, nodes, license usage and — for every Stream Worker Group — its Sources and
 * Destinations. Throws only on abort; every other failure is returned in `errors`.
 */
export async function discoverWorkspace(get: Getter, signal: AbortSignal, onProgress?: (p: Progress) => void): Promise<{ raw: RawWorkspace; errors: CallError[] }> {
  const raw: RawWorkspace = { groups: null, workers: null, license: null, inputs: {}, outputs: {} };
  const errors: CallError[] = [];
  let done = 0;
  let total = 3;

  const toTask = (c: Call) => async () => {
    if (signal.aborted) return;
    onProgress?.({ done, total, current: c.what });
    try {
      c.assign(await get(c.path, signal));
    } catch (e) {
      if (signal.aborted || isAbortError(e)) return;
      errors.push({ key: c.key, what: c.what, path: c.path, ...describeError(e, c.what, c.forbidden) });
    } finally {
      done += 1;
      if (!signal.aborted) onProgress?.({ done, total, current: c.what });
    }
  };

  const phase1: Call[] = [
    { key: 'groups', what: 'Worker Groups and Fleets', path: '/master/groups', assign: (v) => (raw.groups = v) },
    { key: 'workers', what: 'Worker Nodes', path: '/master/workers', assign: (v) => (raw.workers = v) },
    {
      key: 'license',
      what: 'license usage',
      path: '/system/licenses/usage',
      forbidden: "License usage isn't available: this API is on-prem only, or your role can't read it. Enter the daily volume manually.",
      assign: (v) => (raw.license = v),
    },
  ];
  await runPool(phase1.map(toTask), CONCURRENCY, signal);
  throwIfAborted(signal);

  const gids = streamGroupIds(raw);
  const phase2: Call[] = gids.flatMap((gid) => {
    const enc = encodeURIComponent(gid);
    return [
      { key: `inputs:${gid}`, what: `Sources in Worker Group ${gid}`, path: `/m/${enc}/system/inputs`, assign: (v: unknown) => (raw.inputs[gid] = v) },
      { key: `outputs:${gid}`, what: `Destinations in Worker Group ${gid}`, path: `/m/${enc}/system/outputs`, assign: (v: unknown) => (raw.outputs[gid] = v) },
    ];
  });
  total += phase2.length;
  await runPool(phase2.map(toTask), CONCURRENCY, signal);
  throwIfAborted(signal);

  const order = ['groups', 'workers', 'license'];
  errors.sort((a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.key.localeCompare(b.key);
  });
  return { raw, errors };
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Import cancelled', 'AbortError');
}

/** A short label for the connected workspace, e.g. "main-happy-lion.cribl.cloud". */
export function workspaceLabelFromUrl(apiUrl: string | undefined): string {
  if (!apiUrl) return 'Cribl workspace';
  try {
    const host = new URL(apiUrl, window.location.href).host;
    return host || 'Cribl workspace';
  } catch {
    return 'Cribl workspace';
  }
}
