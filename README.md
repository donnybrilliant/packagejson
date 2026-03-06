# packagejson (Bun + Elysia)

A simplified v1-aligned API for:
- aggregated `package.json` data across GitHub repos,
- full repo VFS traversal,
- repo search + enrichment (README, languages, stars, deployments, npm package info).

## Scripts

- `bun run dev` – watch mode for `src/index.ts`
- `bun start` – run the server
- `bun test` – test suite
- `bun lint` – Biome lint
- `bun format` – Biome formatter
- `bun x tsc --noEmit` – type-check

## Core Endpoints

- `GET /` – HTML links (browser) or JSON links
- `GET /health` – health probe
- `GET /docs` – OpenAPI docs

### Package Aggregation

- `GET /package.json?version=max|min|minmax`
- `GET /package.json/refresh?version=max|min|minmax`

### Files / VFS

- `GET /files` – default v1-style nested object tree
- `GET /files?format=terminal` – terminal-friendly `FileSystemItem` tree:
  - root: `~`
  - children: `github`, `projects`
  - each contains converted repo directories/files
- `GET /files/refresh`
- `GET /files/*` – traverse directories/files in the VFS

### Repositories

- `GET /repos`
  - query: `type`, `q`, `include`, `fields`, `sort`, `limit`, `offset`
  - **Default include:** when `include` is omitted, responses include full enrichment: `readme`, `languages`, `deployments`, `npm`, `deployment-links`. Use `include=readme` (etc.) to request only specific fields.
  - **Search:** `q` filters repos by substring match (case-insensitive) in `name`, `full_name`, `description`, `topics`, and README body.
  - List responses are cached server-side by query (5 min); responses also send `Cache-Control` and `ETag` for client/HTTP caching.
- `GET /repos/:owner/:repo` – when `include` is omitted, uses the same full default set as the list.
- `GET /repos/:owner/:repo/readme`
- `GET /repos/:owner/:repo/languages`
- `GET /repos/:owner/:repo/deployments`
- `GET /repos/:owner/:repo/npm`
- `GET /repos/:owner/:repo/deployment-links`

## Deployment + npm behavior

- Deployments are resolved with fallback:
  1. GitHub deployments
  2. If none, external matches (Vercel/Netlify/Render) by exact repo URL match
- npm package lookup is exact and uses only root `package.json` `name`.

## Env

- `PORT` (default `3000`)
- `NODE_ENV` (default `development`)
- `API_KEYS` (comma-separated accepted API keys)
- `API_KEY_REQUIRED` (default `true` in production, `false` otherwise)
- `API_KEY_ALLOW_X_HEADER` (default `true`; allows `x-api-key` fallback)
- `TRUST_PROXY_HEADERS` (default `false`; trust `x-forwarded-for` family only behind trusted ingress)
- `RATE_LIMIT_ENABLED` (default `true` in production, `false` otherwise)
- `RATE_LIMIT_MAX` (default `120`)
- `RATE_LIMIT_WINDOW_MS` (default `60000`)
- `RATE_LIMIT_HEADERS` (default `true`)
- `USERNAME`
- `GITHUB_TOKEN`
- `NETLIFY_TOKEN`, `VERCEL_TOKEN`, `RENDER_TOKEN` (optional fallback sources)
- `CORS_ORIGIN` (default `*`; comma-separated allowlist supported)
- `CORS_METHODS` (default `GET,POST,PUT,PATCH,DELETE,OPTIONS`)
- `CORS_HEADERS` (default `Content-Type,Authorization,Accept`)
- `CORS_EXPOSE_HEADERS` (optional)
- `CORS_ALLOW_CREDENTIALS` (default `false`)
- `CORS_MAX_AGE` (default `86400`)
- `USE_LOCAL_DATA` (optional) – if true, `/files` reads local `data.json`
- `SAVE_FILE` (optional) – if true, fetched VFS data is persisted to `data.json`
- `ONLY_SAVE_LINKS` (optional) – when fetching live GitHub content, store links for binary/large files
- `DATA_JSON_PATH` defaults to `<repo>/data.json`

## Elysia plugins

- `@elysiajs/openapi` for `/docs`
- `@elysiajs/static` for static assets
- `@elysiajs/cors` for CORS/preflight handling
- `@elysiajs/bearer` for `Authorization: Bearer` API-key extraction
- `elysia-rate-limit` for request throttling on API routes
- Cache is intentionally custom (`src/cache.ts`) because we need TTL + development persistence into `data.json.cache`.

## Auth and rate limiting

- Protected API prefixes: `/package.json`, `/files`, `/repos`
- Public routes: `/`, `/health`, `/docs`, static assets
- Send API key using:
  - `Authorization: Bearer <key>` (primary)
  - `x-api-key: <key>` (optional fallback, controlled by env)
- If `API_KEY_REQUIRED=true` and `API_KEYS` is empty, the server fails fast at startup.
- `OPTIONS` preflight requests bypass API-key auth so browser CORS preflight is never blocked.
- Rate limit key is `pathname + client IP` and only applies to protected API prefixes.
- Browser note: API keys in React/browser clients are visible to users, so treat them as client identifiers, not secrets.
- Backend note: API keys are appropriate for server-to-server clients because secrets remain on the server side.

## Caching

- Memory cache is always primary (process-local), with TTLs from `src/env.ts`.
- HTTP responses for core JSON endpoints include `Cache-Control` + `ETag` and support conditional requests (`If-None-Match` -> `304`).
- In development (`NODE_ENV=development`), generic cache is also persisted to `data.json.cache` for inspection.
- On restart/redeploy, memory cache is cleared; development cache can be rehydrated from `data.json.cache`.
- Current cache keys:
  - `packageData-*` (`/package.json`) – 1 week
  - `files` (`/files`) – 1 week
  - `repos-list:*` (`GET /repos` by query params) – 5 min
  - `deployment-platforms` (external deployment matching) – 1 hour
- `data.json` namespaces:
  - `cache`: generic cache entries (development persistence).
  - `vfs`: files tree snapshot used by `/files`.
- Files service behavior:
  - `USE_LOCAL_DATA=true`: read VFS snapshot from `data.json.vfs`.
  - `SAVE_FILE=true`: write fetched VFS snapshot to `data.json.vfs`.

## Manual check

1. `bun install`
2. `bun run dev`
3. Open [http://localhost:3000](http://localhost:3000)
4. Check docs at [http://localhost:3000/docs](http://localhost:3000/docs)
5. Quick API checks:
   - `curl -H "Accept: application/json" http://localhost:3000/files`
   - `curl -H "Accept: application/json" "http://localhost:3000/files?format=terminal"`
   - `curl -H "Accept: application/json" http://localhost:3000/repos` (full list with default enrichment)
   - `curl -H "Accept: application/json" "http://localhost:3000/repos?q=nebula"` (search)
