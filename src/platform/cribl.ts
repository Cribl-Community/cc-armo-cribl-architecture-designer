declare global {
  interface Window {
    CRIBL_API_URL?: string;
    CRIBL_BASE_PATH?: string;
    getCriblUser?: () => Promise<CriblUser>;
  }
}

export interface CriblUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  initials?: string;
}

/** True when running inside Cribl (installed or Live Preview). Outside Cribl we run in local demo mode. */
export const isInCribl = () => typeof window.CRIBL_API_URL === 'string' && window.CRIBL_API_URL.length > 0;

export const apiUrl = (path: string) => `${window.CRIBL_API_URL}${path.startsWith('/') ? path : `/${path}`}`;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function criblGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(apiUrl(path), { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText} for ${path}`);
  return (await res.json()) as T;
}

export async function criblPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText} for ${path}`);
  return (await res.json()) as T;
}

let userPromise: Promise<CriblUser> | null = null;
export function getUser(): Promise<CriblUser> {
  if (!userPromise) {
    userPromise = window.getCriblUser ? window.getCriblUser() : Promise.resolve({ id: 'local', username: 'local-demo' });
  }
  return userPromise;
}

// ── KV store (app-scoped). Falls back to memory outside Cribl. ─────────
const memoryKv = new Map<string, string>();

async function kvError(res: Response, op: string, key: string) {
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 200);
  } catch {
    /* body unreadable */
  }
  return new ApiError(res.status, `KV ${op} ${key} failed (${res.status}${detail ? `: ${detail}` : ''})`);
}

/** Set when Cribl rejects a KV write; the App then keeps working with in-memory designs for this session. */
let kvDegradedReason: string | null = null;
export const kvDegraded = () => kvDegradedReason;

export const kv = {
  async get(key: string): Promise<string | null> {
    if (!isInCribl() || memoryKv.has(key)) return memoryKv.get(key) ?? null;
    try {
      const res = await fetch(apiUrl(`/kvstore/${key}`));
      if (res.status === 404) return null;
      if (!res.ok) throw await kvError(res, 'get', key);
      const text = await res.text();
      return text === '' ? null : text;
    } catch (e) {
      if (kvDegradedReason) return null;
      throw e;
    }
  },
  async put(key: string, value: string): Promise<void> {
    if (!isInCribl() || kvDegradedReason) {
      memoryKv.set(key, value);
      return;
    }
    const res = await fetch(apiUrl(`/kvstore/${key}`), { method: 'PUT', headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: value });
    if (!res.ok) {
      kvDegradedReason = (await kvError(res, 'put', key)).message;
      memoryKv.set(key, value);
    }
  },
  async delete(key: string): Promise<void> {
    memoryKv.delete(key);
    if (!isInCribl() || kvDegradedReason) return;
    const res = await fetch(apiUrl(`/kvstore/${key}`), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw await kvError(res, 'delete', key);
  },
  async getJson<T>(key: string): Promise<T | null> {
    const raw = await kv.get(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  putJson(key: string, value: unknown) {
    return kv.put(key, JSON.stringify(value));
  },
};
