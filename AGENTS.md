<!-- @cribl/apps:managed:begin -->
# Cribl App Platform Developer Guide

## Versioning

`npm run package` increments your app version before creating the archive. By default, it increments the patch version, for example `1.0.0` to `1.0.1`.

Use these flags to choose a different version bump:

- `npm run package -- --minor` increments the minor version and resets patch to `0`.
- `npm run package -- --major` increments the major version and resets minor and patch to `0`.
- `npm run package -- --version X.Y.Z` sets the exact version.


## Global Variables

The following are set on `window` automatically when your app runs inside Cribl. They are read-only and always present — do **NOT** define, assign, or polyfill them in your app code, Vite config, or environment files.

| Variable | Example | Description |
|---|---|---|
| `CRIBL_API_URL` | `https://localhost:9000/api/v1` | Base URL for all Cribl API calls |
| `CRIBL_BASE_PATH` | `/app-ui/my-app` | The base path your app is mounted at |

## How to Get User Info

Your app can read basic identity and profile info for the currently signed-in Cribl user via `window.getCriblUser()`. It returns a Promise that resolves to:

| Field | Type | Always present? |
|---|---|---|
| `id` | `string` | yes |
| `username` | `string` | yes |
| `email` | `string` | no |
| `firstName` | `string` | no |
| `lastName` | `string` | no |
| `initials` | `string` | no |

Example:

```js
const user = await window.getCriblUser();
console.log(`Hello, ${user.firstName ?? user.username}!`);
```

The result is memoized — subsequent calls return the same resolved Promise. `getCriblUser` is read-only; do not redefine it.

## How API Calls Work (Fetch Proxy)

Your app runs inside a sandboxed iframe. The platform **automatically intercepts all `fetch()` calls** to `CRIBL_API_URL` and proxies them through the parent window. This is transparent to your code — just use `fetch()` normally.

**What the proxy does for you:**
- Injects authentication headers (your app never sees or handles auth tokens)
- Rewrites URLs to scope requests to your app
- Streams responses back to your app

**What this means for your code:**
- Use `fetch()` as normal — it just works
- You do NOT need to handle authentication
- You cannot override or replace `window.fetch` (it is locked)
- Requests that don't target `CRIBL_API_URL` are passed through directly (no proxy)

### URL Rewriting Rules

The proxy applies these rewrites automatically:

| What you call | What actually happens | Why |
|---|---|---|
| `fetch(CRIBL_API_URL + '/kvstore/my-key')` | Rewritten to `/api/v1/a/{yourAppId}/kvstore/my-key` | Scopes KV store access to your app |
| `fetch(CRIBL_API_URL + '/proxy/some/path')` | Rewritten to `/api/v1/a/{yourAppId}/proxy/some/path` | Scopes proxy calls to your app |
| `fetch('https://api.example.com/data')` | Rewritten to `/api/v1/a/{yourAppId}/proxy/api.example.com/data` | External calls are routed through the platform proxy |
| `fetch(CRIBL_API_URL + '/search/jobs')` | Passed through as-is | Standard API calls are not rewritten |

**Important:** Your app cannot access other apps' resources. Any request targeting a different app ID will be rejected.

### Request Timeout

Proxied requests time out after **30 seconds** if no response is received. Use `AbortController` if you need to cancel requests earlier.

## Confirming Destructive Operations

Cribl API calls act on real customer configuration and data. Some are **volatile** — they remove or irreversibly overwrite state — and have caused apps to delete things users did not expect. **Always confirm with the user before performing a volatile operation, and never trigger one automatically (e.g. on page load, render, or a background timer).**

**Volatile operations that require confirmation:**
- **`DELETE` requests** — always. This includes deleting KV store keys, config resources (inputs, outputs, pipelines, routes, lookups, etc.), and any collection or child resource.
- **`PUT` / `POST` / `PATCH` requests that overwrite or replace** existing configuration or data (e.g. replacing a pipeline definition, bulk-updating routes).

**How to confirm:**
- Require an explicit, deliberate user action (a button click) to start the operation — do not act on implicit signals.
- Before calling the API, show a confirmation prompt that names **exactly what will be affected** (the resource name/id and the action) and warns when the action cannot be undone.
- After the operation, report the outcome (success or failure) back to the user.

Read-only operations (`GET`) never need confirmation.

## Platform APIs

API endpoint definitions are available in `openapi.json` (if downloaded during project setup).

### Key-Value Store

**Do NOT use browser storage — `localStorage`, `sessionStorage`, `IndexedDB`, or cookies — for app data.** Your app runs in a sandboxed iframe where browser storage is unreliable (it can be partitioned, cleared, or blocked by the browser or platform) and is never shared across users, devices, or sessions. **Use the app-scoped KV store below for all persistence** — user preferences, app state, cached results, and any data that must survive a reload.

Each app has a scoped KV store. Use `CRIBL_API_URL` as the base — the proxy handles scoping.

| Operation | Method | URL | Body |
|---|---|---|---|
| Get | GET | `CRIBL_API_URL + '/kvstore/the/path/to/key'` | — |
| Set | PUT | `CRIBL_API_URL + '/kvstore/the/path/to/key'` | value |
| Delete | DELETE | `CRIBL_API_URL + '/kvstore/the/path/to/key'` | — |
| List keys | POST | `CRIBL_API_URL + '/kvstore/keys'` | `{ prefix: 'my/key/prefix' }` |

### Config Group Context

Cribl REST API endpoints that don't begin with `/system/` are contextual and can be called in the context of a config group using the prefix `/m/:groupId`. Config groups can be listed using the `/master/groups` endpoint.

Endpoints beginning with `/search/` should ALWAYS use `groupId` set to `default_search` — for example: `/m/default_search/search/jobs`. Never use any other group ID for search endpoints.

When asked to build a feature, always inspect Cribl REST APIs and understand the context of the request before starting to build.

### External API Calls

To call external APIs, just use `fetch()` with the full URL. The platform will automatically route these through your app's proxy endpoint. The external domain must be declared in your app's `config/proxies.yml`.

### proxies.yml — External Domain Configuration

Your app must declare every external domain it needs to access in `config/proxies.yml`. This file lives in your project's `config/` directory and gets packaged with your app. Admins can see exactly which external endpoints your app communicates with at install time.

**Schema:**

```yaml
# config/proxies.yml
# Top-level keys are domain:port pairs (port optional, defaults to 443)

api.openai.com:
  timeout: 10000          # Optional: request timeout in ms (1000–120000, default 30000)

  # Optional: verify the upstream TLS certificate chain. Defaults to `true`.
  # Set to `false` only when targeting trusted internal endpoints that present
  # self-signed or otherwise untrusted certificates.
  rejectUnauthorized: true

  paths:                   # Optional: control which URL paths are allowed
    allowlist:             # Prefix match — request path must start with one of these
      - /v1/chat/
      - /v1/models
    blocklist:             # Prefix match — these paths are always blocked (takes precedence over allowlist)
      - /v1/admin/

  headers:                 # Optional: control header forwarding and injection
    inject:                # Headers to add to every outgoing request to this domain
      x-api-key: "'static-key'"
      Authorization: "'Bearer ' + kv.openaiApiKey"
      x-custom: kv.myHeaderValue
    allowlist:             # Only forward these headers from the original request (supports wildcards)
      - content-type
      - accept
      - x-custom-*
    blocklist:             # Never forward these headers (takes precedence, supports wildcards)
      - x-internal-*
```

**Header injection expressions** support:
- String literals: `"'my-static-value'"`
- KV store lookups: `kv.mySecretKey` (resolves encrypted KV values at request time)
- Concatenation: `"'Bearer ' + kv.apiToken"`

**Security notes:**
- Sensitive headers (`cookie`, `authorization`, `proxy-authorization`, `host`, `connection`, `transfer-encoding`) are always stripped from the original request before forwarding — use `headers.inject` to set auth headers instead
- The platform validates target domains against SSRF protections (private/reserved IPs are blocked)
- Requests are rate-limited per app (100 requests/minute)
- All proxied requests use HTTPS
- Upstream TLS certificates are verified by default (`rejectUnauthorized: true`). Disable only for trusted internal endpoints with self-signed certs.

**Example — minimal config for a single API:**

```yaml
# config/proxies.yml
api.example.com:
  headers:
    inject:
      Authorization: "'Bearer ' + kv.apiKey"
```

**Example — multiple domains with path restrictions:**

```yaml
# config/proxies.yml
api.openai.com:
  timeout: 60000
  paths:
    allowlist:
      - /v1/chat/completions
      - /v1/embeddings
  headers:
    inject:
      Authorization: "'Bearer ' + kv.openaiKey"

hooks.slack.com:
  paths:
    allowlist:
      - /services/
  headers:
    inject:
      Content-Type: "'application/json'"
```

**How it connects to fetch:** When your app calls `fetch('https://api.openai.com/v1/chat/completions', ...)`, the platform rewrites this to `/api/v1/a/{yourAppId}/proxy/api.openai.com/v1/chat/completions`, looks up `api.openai.com` in your `proxies.yml`, validates the path, injects headers, and forwards the request.

### policies.yml — Product API Access Configuration

Your app can declare which Cribl product API paths it needs to access in `config/policies.yml`. This file lives in your project's `config/` directory and gets packaged with your app. Admins can see exactly which platform resources your app requires at install time.

When an admin shares your app with a user, the declared policies are automatically granted to that user for the duration of any request made through your app. Users with existing role permissions can also access those paths through your app without needing an explicit grant.

**Schema:**

```yaml
# config/policies.yml
policies:
  - object: '/system/lookups'       # Cribl product API path
    actions: ['GET']                 # HTTP methods: GET, POST, PUT, PATCH, DELETE, or ['*'] for all
  - object: '/products/stream/groups'
    actions: ['GET']
```

**Rules:**
- Only declare paths your app genuinely needs — admins review these at install time
- App-scoped paths (`/a/${appId}/kvstore/*`, `/a/${appId}/proxy/*`) are granted automatically via the AppUser role when an admin shares your app — do not redeclare them here

**Worker (`/w/:wid`) vs group (`/m/:gid`) paths:** Some APIs are available at both `/w/:wid/...` and `/m/:gid/...`. Each prefix is a separate policy `object`.

- **App calls `/m/:gid/...`:** Declare those paths only.
- **App calls `/w/:wid/...`:** Declare those paths **and** the matching `/m/:gid/...` paths. Worker API requests are authorized against the group-equivalent path.

**Example:**

```yaml
# config/policies.yml
policies:
  - object: '/system/lookups'
    actions: ['GET']
  - object: '/products/stream/groups'
    actions: ['GET']
  - object: '/products/stream/groups/*'
    actions: ['GET'] # Required for matching child group paths
  - object: '/m/:gid/system/projects/*'
    actions: ['*'] # Wildcard: all methods for matching project paths
```

**Path matching:** Declaring `/products/stream/groups` covers that exact collection path only. If your app reads individual groups, include `/products/stream/groups/*` or `/products/stream/groups/:gid`; otherwise group results can be empty.

**How it works:** When your app calls `fetch('/api/v1/system/lookups')`, the platform rewrites this to `/api/v1/a/{yourAppId}/system/lookups`, checks that `GET /system/lookups` is declared in your `policies.yml`, and grants access if the requesting user was shared the app by an admin.

**Live preview:** editing `config/policies.yml`, `config/proxies.yml`, `config/schedules.yml`, or `package.json` while running `npm run dev` reloads the app automatically so your changes take effect without a manual refresh.

## Backend Endpoints

Your app can ship server-side HTTP handlers that run on the Cribl platform, alongside (or instead of) the frontend. Declare them in `config/backend.yml`:

```yaml
# config/backend.yml
runtime: js
endpoints:
  - name: hello
    script: backend/hello.ts
    # timeout: 30   # optional execution timeout in seconds (1–900, default 30)
    # memory: 256   # optional memory ceiling in MB (1–1024, default 256)
```

Each `script` is an ESM module exporting an async `onRequest(request, context)` that returns a `Response`:

```ts
// backend/hello.ts
import { greeting } from './net.js';

export async function onRequest(request: Request, context: { appId: string }): Promise<Response> {
  const res = await fetch('/api/v1/system/info'); // Cribl API — must be granted in policies.yml
  const info = await res.json();
  return new Response(JSON.stringify({ message: greeting(context.appId), info }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
```

Write endpoints as modern ESM — npm dependencies and relative imports (`./net.js`) are welcome. `npm run build` runs **`apps build`**, which bundles each endpoint into one self-contained CommonJS file under `backend-build/`. This is required: the platform fuses each endpoint at deploy time and does **not** resolve npm packages or relative files itself, so an unbundled `import` would fail at invocation. `node:*` builtins are left external and are available at runtime. Each bundle must stay under 5 MB.

Endpoints are type-checked by `tsconfig.backend.json`, which `tsconfig.json` references — so `npm run build`'s `tsc -b` catches type errors in `backend/` before bundling. The bundle is always emitted as `.js` (a `backend/hello.ts` builds to `backend-build/backend/hello.js`) because it is generated CommonJS, not TypeScript; `apps package` rewrites the packed manifest's `script` to match. `backend-build/` is git-ignored build output — never edit it.

`apps build` loads each finished bundle to verify it really exports `onRequest`, which means your endpoint's **module top-level code runs during the build**. Keep top-level scope to declarations and imports; do the work that needs config, network, or secrets inside `onRequest`, not at module scope.

Inside a handler, `fetch()` reaches the Cribl API with relative paths (e.g. `/api/v1/system/info`) and any external domain declared in `proxies.yml`. Invoke a deployed endpoint at `/api/v1/a/{yourAppId}/endpoints/{name}`.

**Permissions are not declared in `backend.yml`** — it is compute-shape only. Cribl API access lives in `config/policies.yml` and external egress in `config/proxies.yml`; both apply app-wide, to the frontend and every backend endpoint alike. Grant a backend endpoint's Cribl API calls the same way you grant the frontend's.

**If your app is frontend-only, delete:**
- `config/backend.yml`
- `backend/*`
- `tsconfig.backend.json`, and its entry in root `tsconfig.json`'s `references`
- `config/schedules.yml` — schedules are only ever cron calls to a backend endpoint; with no backend the platform never reads this file

Leave the `apps build` step in `package.json` — it's a no-op without a manifest, and removing it breaks a backend added later.

### Scheduled Functions (schedules.yml)

Backend endpoints can also run on a cron, via the platform Schedule API. Schedules require a
backend — if your app is frontend-only, delete `config/schedules.yml` too. There is no `onSchedule`
handler and no `schedule:` field on an endpoint in `config/backend.yml` — a schedule is just an
automatic call to an endpoint you already declared there. The platform POSTs a JSON body to the
endpoint's `onRequest` at fire time, the same handler it uses for HTTP requests.

Three paths, do not mix them up:
- **Authoring / scaffold:** `config/schedules.yml` — same pattern as `config/policies.yml` and `config/proxies.yml`.
- **Pack `.tgz`:** `default/schedules.yml` (the packer copies `config/schedules.yml` here automatically).
- **Installed on the Leader:** `default/<appId>/schedules.yml`. This is the Leader's installed view — never write this path in your project.

Top-level keys in `config/schedules.yml` are schedule ids. Each record has `endpoint`, `cronSchedule`
(five-field UTC cron), and an optional `bodyExpression` (a JS expression evaluated at fire time; its
result is POSTed as the body). Do **not** nest an `id:` field inside a record — the top-level key is
the id. Up to 10 schedules per app.

```yaml
# config/schedules.yml
tick:
  endpoint: tick
  cronSchedule: '0 * * * *'
  # bodyExpression: '{ scheduleId, scheduledFor }'
```

**Do NOT:**
- Add an `onSchedule` handler — endpoints export only `onRequest`.
- Add `schedule:` (or cron) to an endpoint in `config/backend.yml` — it stays compute-shape only.
- Write `default/<appId>/schedules.yml` in your project — that path belongs to the installed app on the Leader.

## React Router

When using React Router, set the basename to `window.CRIBL_BASE_PATH`:

```jsx
<BrowserRouter basename={window.CRIBL_BASE_PATH}>
```

## Navigation

The platform synchronizes navigation between your app and the parent Cribl UI. If you use `history.pushState()` or `history.replaceState()`, the parent URL bar will update to reflect your app's current route. Navigation changes from the parent are also forwarded to your app as `popstate` events.

### Linking Out of Your App

Your app runs in a sandboxed iframe, so to leave the app, set `target="_top"` (current tab) or `target="_blank"` (new tab) explicitly.

**Recommended for internal navigation: use a client-side router** (React Router, Vue Router, TanStack Router, etc.) configured with `basename={window.CRIBL_BASE_PATH}`, and navigate with the router's `<Link>` (or equivalent). You get SPA-style transitions, automatic integration with the platform's URL sync, and no risk of the absolute-path pitfall in **Avoid** plain `<a>` tags.

| Intent | Markup |
|---|---|
| Stay inside your app (recommended) | `<Link to="/page">` from your router, with `basename={window.CRIBL_BASE_PATH}` |
| Leader UI, current tab | `<a href="/search/jobs/123" target="_top">` |
| Leader UI, new tab | `<a href="/search/jobs/123" target="_blank">` |
| External URL, current tab | `<a href="https://docs.cribl.io/..." target="_top">` |
| External URL, new tab | `<a href="https://docs.cribl.io/..." target="_blank">` |

**Live preview (`npm run dev`):** absolute paths resolve against your dev server, not the Leader UI, so `target="_top"` won't reach Cribl. Test those in installed mode.

## Theming (Light and Dark Mode)

The Cribl shell owns the theme — the user toggles light/dark in the Cribl account menu, and your app follows. **Do NOT build your own theme switcher, and do not persist a theme of your own.** Your app must work in both themes.

Your app runs in a cross-origin sandboxed iframe and cannot read the host's DOM, so the platform pushes the theme to you:

| Channel | What it is | When it arrives |
|---|---|---|
| `CRIBL_APP_LAYOUT` postMessage, `theme: 'light' \| 'dark'` | The source of truth. Theme your UI from this. | Shortly after your document loads, and again on every toggle |
| `prefers-color-scheme` inside your iframe | The host makes this track the **Cribl** theme instead of the OS. A first-paint hint only. | At first paint, before your JS runs |

### Apply the theme from `CRIBL_APP_LAYOUT`

`@capra/theme` puts the light tokens on `:root` and the dark overrides under a `.dark` class, so re-theming the whole app is a single class toggle. Install this once at startup, before you render:

```ts
// src/host-theme.ts
export type HostTheme = 'light' | 'dark';

/** Applies the Cribl shell's theme to this document. Returns a teardown fn. */
export function installThemeBridge(onTheme?: (theme: HostTheme) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent) return; // any frame can post to yours
    const data = event.data as { type?: string; theme?: HostTheme } | null;
    if (data?.type !== 'CRIBL_APP_LAYOUT') return;
    if (data.theme !== 'light' && data.theme !== 'dark') return;
    document.body.classList.toggle('dark', data.theme === 'dark');
    onTheme?.(data.theme);
  };

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
```

Call `installThemeBridge()` from `src/main.tsx`, before `createRoot(...).render(...)`. Rules:

- Use `classList.toggle('dark', ...)` — never assign `className`, that wipes any other class on the element.
- Scope the class at `<body>` (or `<html>`): Capra portals overlays such as drawers and toasts outside your component tree, so a class on an inner wrapper leaves them light.
- Need the theme in React (an illustration, a chart palette, a canvas color)? Pass `onTheme` and keep it in state — do not read the class back out of the DOM.
- Libraries other than Capra (antd, MUI, a charting lib) do not see `.dark`. Hand them the theme yourself — e.g. antd's `ConfigProvider` dark algorithm.

### First paint

`CRIBL_APP_LAYOUT` cannot arrive before your first paint, so markup that renders before your JS — a loading skeleton in `index.html`, a splash background — has to guess. Key it off `@media (prefers-color-scheme: dark)`, which the host points at the Cribl theme by setting `color-scheme` on your iframe. Never theme components off it: it is a fallback only, it does not reflect a toggle, and Safari (WebKit) ignores the embedder's color scheme, so it can be wrong for a frame. Also add `:root { color-scheme: light dark; }` so browser-painted surfaces (scrollbars, native form controls) follow the shell.

### Make both themes work

- Every color comes from a design token, via the `token()` function in CSS — a hardcoded `#fff` or `#1a2532` is wrong in one of the two themes.
- Do not hand-write `.dark` rules to patch a token that looks off; pick the semantically correct token instead.
- Before calling a UI change done, toggle dark mode in the Cribl account menu with your app open and check both themes.

## Cribl Marketplace listing

- Root `README.md` is the customer-facing Marketplace overview. Write it in Markdown; raw HTML is ignored.
- Use `AGENTS.md` for developer guidance that should not appear in the Marketplace.
- `tags.product` accepts `stream`, `edge`, `search`, `lake`, and `insights`. It defaults to an empty array.

## UI/UX

Use the Capra design system for all UI code unless the user explicitly opts out.

Before writing any UI or page code, fetch <https://capra.cribl.io/llms.txt> and follow the absolute links it lists — first to the Page Templates index, then to the specific template page for what you're building. Do not skip this fetch: Page Templates define how pages should be structured, and generic React/frontend patterns are not a substitute for them. If more than one template could apply, ask the user which one to use.

**Best Practices**

- In CSS, always use design tokens when available. Always use the custom `token()` function to reference design tokens. Never use a CSS variable directly. Tokens are what make light and dark mode work — see **Theming**.
- React components, both from `@capra/core` and `@capra/icons`, should rarely have CSS classes applied. Adding margins or spacing should happen outside the component with wrappers.
- Don't write CSS selectors that depend on Capra component internals, classes, or HTML structure.
<!-- @cribl/apps:managed:end -->
