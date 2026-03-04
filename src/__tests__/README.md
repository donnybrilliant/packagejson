# Test Structure

This directory contains all tests for the packagejson API, organized following best practices.

## Structure

```
src/__tests__/
├── helpers/
│   ├── test-utils.ts    # Shared test utilities and helpers
│   └── fixtures.ts      # Test data and mock fixtures
└── routes/
    ├── root.test.ts           # Root routes (/, /docs, /health)
    ├── deployments.test.ts    # Netlify, Vercel, Render endpoints
    ├── npm.test.ts            # NPM package endpoints
    ├── package.test.ts        # Package.json aggregation endpoints
    ├── files.test.ts          # File structure endpoints
    └── repos.test.ts          # GitHub repository endpoints
```

## Test Organization

### By Feature/Service
Tests are organized by service/feature area:
- **Root routes**: Basic app routes (/, /docs, /health, 404)
- **Deployments**: Netlify, Vercel, Render services
- **NPM**: Package search, downloads, versions
- **Package**: Aggregated package.json data
- **Files**: Repository file structure navigation
- **Repos**: GitHub repository data and nested resources

### Test Utilities (`helpers/test-utils.ts`)

Reusable utilities for all tests:
- `createRequest()` - Creates test requests with optional headers
- `handleRequest()` - Handles requests through the app
- `expectStatus()` - Asserts response status codes
- `expectJsonContent()` - Asserts JSON content type
- `expectHtmlContent()` - Asserts HTML content type
- `parseJson()` - Parses JSON responses with type safety
- `parseText()` - Parses text responses

### Test Fixtures (`helpers/fixtures.ts`)

Shared test data:
- `testRepos` - Mock repository data
- `testFilesData` - Mock file structure data
- `testPackageData` - Mock package.json data
- `testNpmPackage` - Mock NPM package data

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/__tests__/routes/npm.test.ts

# Run with coverage (if available)
bun test --coverage
```

## Test Patterns

### Using describe blocks
Tests are grouped using `describe()` blocks for better organization:
```typescript
describe("Service Name", () => {
  describe("GET /endpoint", () => {
    test("should return data", async () => {
      // test implementation
    });
  });
});
```

### Type-safe assertions
All JSON parsing uses TypeScript generics for type safety:
```typescript
const body = await parseJson<{ data: { name: string } }>(response);
expect(body.data.name).toBe("expected");
```

### Status code validation
Use `expectStatus()` for flexible status code checking:
```typescript
expectStatus(response, 200);           // Exact match
expectStatus(response, [404, 500]);     // Multiple valid options
```

## Best Practices

1. **Group related tests** using `describe()` blocks
2. **Use shared utilities** from `test-utils.ts` for consistency
3. **Type all responses** using TypeScript generics
4. **Test both success and error cases**
5. **Test query parameters** and edge cases
6. **Keep tests focused** - one assertion per test when possible
7. **Use descriptive test names** that explain what is being tested

## Adding New Tests

1. Create a new test file in `routes/` if testing a new service
2. Import utilities from `helpers/test-utils.ts`
3. Use fixtures from `helpers/fixtures.ts` when appropriate
4. Follow the existing patterns and structure
5. Ensure all tests pass and type checking succeeds

