# Test Structure

This test suite validates the simplified core API contract and supporting helpers.

## Structure

```
src/__tests__/
├── env.test.ts
├── helpers/
│   ├── fixtures.ts
│   └── test-utils.ts
├── routes/
│   ├── root.test.ts          # /, /docs, /health, 404, CORS
│   ├── package.test.ts       # /package.json, /package.json/refresh
│   ├── files.test.ts         # /files, /files?format=terminal, /files/*
│   ├── repos.test.ts         # /repos and nested repo resources
│   ├── security.test.ts      # API key auth + rate limiting behavior
│   ├── security-contract.test.ts # full createApp() auth contract under production env
│   ├── deployments.test.ts   # removed deployment routes => strict 404
│   └── npm.test.ts           # removed standalone npm routes => strict 404
├── services/
│   ├── cache.test.ts
│   ├── files.test.ts
│   ├── repos-helpers.test.ts
│   └── security.test.ts
├── utils/
│   └── github.test.ts
└── semver.test.ts
```

## Coverage focus

- Route contracts are deterministic: no permissive `200 or 500` assertions.
- Core `/repos` behavior: query search, default full include (when omit), enrichment, pagination, field selection, list response server-side cache.
- Core `/files` behavior: default v1 object tree + terminal `FileSystemItem` mode.
- Security behavior:
  - protected vs public route access
  - bearer and optional `x-api-key` fallback
  - preflight (`OPTIONS`) bypass
  - route-scoped rate limiting
- HTTP caching behavior:
  - `Cache-Control` + `ETag` headers on core JSON routes
  - conditional GET returning `304` on matching `If-None-Match`
- Persistence behavior:
  - generic cache persistence in development (`data.json.cache`) + rehydration
  - VFS resolution from `data.json.vfs` and legacy fallback
- Removed route surface returns strict `404`.

## Running tests

```bash
bun test
bun test src/__tests__/routes/security.test.ts
```

## Adding tests

1. Add route-level tests for API contracts and status/body shape.
2. Add service/helper tests for parsing, matching, filtering, and edge cases.
3. Prefer exact status assertions and explicit payload assertions.
4. Run `bun test`, `bun run lint`, and `bun run typecheck` before merging.
