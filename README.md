# packagejson (Bun + Elysia)

Elysia/Bun rewrite of the v1 service. Uses Elysia’s OpenAPI plugin, Bun-native logging, cache helpers, and Bun’s semver (with package fallback).

## Scripts

- `bun run dev` – watch mode for `src/index.ts`
- `bun start` – run the server
- `bun test` – Bun test runner (unit + OpenAPI smoke)
- `bun lint` – Biome lint (ignores `v1/**`)
- `bun format` – Biome formatter

## Endpoints (current)

- `/` – HTML links (default) or JSON when `Accept: application/json`
- `/health` – health probe
- `/docs` – OpenAPI UI (via `@elysiajs/openapi`)

## Env

- `PORT` (default `3000`)
- `NODE_ENV` (default `development`)
- `USERNAME`, `GITHUB_TOKEN`, `NETLIFY_TOKEN`, `VERCEL_TOKEN`, `RENDER_TOKEN` (optional for future migrated routes)
- `USE_LOCAL_DATA` (default `false`) – when true, `/files` can read from `/data.json` instead of live GitHub (to be wired when that route migrates)
- `DATA_JSON_PATH` defaults to `<repo>/data.json`

## Notes

- Logging uses Bun-native console output; suppressed in `NODE_ENV=test`.
- Cache helper wraps the Cache API and falls back to an in-memory cache when the Cache API is unavailable (e.g., tests).
- Semver helper prefers Bun built-in semver; falls back to the `semver` package automatically.

## Manual check (Bun 1.3.5)

1. Install deps: `bun install`
2. Run dev server: `bun run dev` (or `bun start`)
3. Visit `http://localhost:3000/` (HTML links) and `http://localhost:3000/docs` (OpenAPI UI)
4. JSON variant: `curl -H "Accept: application/json" http://localhost:3000/`
