# AI Coding Agent Instructions for MDN HTTP Observatory

## Project Overview

The MDN HTTP Observatory is a security analysis tool that scans websites for HTTP security-related headers (CSP, HSTS, SRI, X-Frame-Options, etc.) and provides a grade/score based on implemented best practices.

**Architecture**: CLI tool + Fastify API server + PostgreSQL database
**Type**: Node.js (ES modules) security scanner  
**Key Entry Points**: 
- CLI: `bin/wrapper.js` → `src/scanner/index.js`
- API: `src/api/index.js` → `src/api/server.js`

## Core Data Flow

```
Input (hostname) → Site parsing → HTTP Retrieval (http+https) 
→ Test Execution (10 security tests) → Scoring & Grading → JSON Output
```

### Critical Components

1. **Site (`src/site.js`)**: Parses hostnames with optional port/path (e.g., `example.com:8080/api`)
2. **Retriever (`src/retriever/`)**: Fetches responses via HTTP/HTTPS, handles redirects, cookies, CORS preflight, parses meta tags
3. **Scanner (`src/scanner/index.js`)**: Orchestrates test execution and calculates final score/grade
4. **Analyzer/Tests (`src/analyzer/tests/`)**: 10 individual security tests (CSP, SRI, HSTS, etc.) that examine headers and content
5. **Database (`src/database/`)**: Stores scans, sites, test results (using pg pool + Postgrator migrations)
6. **API V2 (`src/api/v2/`)**: REST endpoints for analyze/scan operations with caching logic

## Essential Workflows

### Running & Testing

```bash
npm test                    # Run mocha tests (uses config-test.json)
npm run dev               # Start API server with nodemon (port 8080)
npm start                 # Start API server
npm run migrate           # Apply DB migrations (required before API use)
npx @mdn/mdn-http-observatory <hostname>  # CLI scan
```

**Config Management**: Uses convict schema (`src/config.js`). Load from:
- `conf/config.json` (production)
- `conf/config-test.json` (test env, via `CONFIG_FILE` env var)

### Database Setup

Two database backends are supported: **PostgreSQL** (default) or **Neo4j AuraDB**

#### PostgreSQL (Default)
```bash
# Environment variables
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=httpobservatory
export PGUSER=postgres
export PGPASSWORD=password

# Run migrations and start
npm run migrate
npm start
```

#### Neo4j AuraDB
```bash
# Environment variables
export HTTPOBS_DATABASE_TYPE=neo4j
export NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=password
export NEO4J_DATABASE=neo4j

# Initialize schema and start
npm run migrate
npm start
```

See `docs/NEO4J_SETUP.md` for detailed Neo4j setup instructions.

**Key Config Details**:
- Pool config: max 40 connections, idle timeout 60s
- Always call `npm run migrate` when code is updated
- Database type determined by `HTTPOBS_DATABASE_TYPE` environment variable

## Code Patterns & Conventions

### Database Adapter Pattern

The codebase uses an **adapter pattern** to support multiple database backends:

```javascript
// Factory function selects adapter based on configuration
import { createDatabaseAdapter } from "./database/adapter.js";
const db = await createDatabaseAdapter(CONFIG);
db.createPool();

// All adapters implement the same interface
await db.ensureSite(pool, "example.com");
const scan = await db.insertScan(pool, siteId);
```

**Adapters**:
- `src/database/adapters/postgresql.js` - SQL-based (default, production)
- `src/database/adapters/neo4j.js` - Graph-based (AuraDB)
- `src/database/adapter.js` - Factory and interface definition

**Key Insight**: Adding database support requires:
1. Creating new adapter class implementing all interface methods
2. Returning consistent data types (map to PostgreSQL row format)
3. Implementing both sync operations (ensureSite) and async batching (insertTestResults)

### Testing Approach
- **Framework**: Mocha + Chai
- **Pattern**: Test helpers in `test/helpers.js` create mock `Requests` objects with fake responses
- **Example**: 
  ```javascript
  const req = emptyRequests();
  req.responses.auto.headers.set("content-security-policy", "default-src 'none'");
  const result = contentSecurityPolicyTest(req);
  ```
- **DB Tests**: Conditional on `CONFIG.tests.enableDBTests` flag

### Type Hints & JSDoc
- **Uses JSDoc for all types** (no TypeScript, but JSDoc with type hints)
- Typedef patterns: `@typedef {Object} TypeName` with `@property` fields
- All exports use detailed JSDoc with param/return types

### Test Class Pattern
Security tests export a class extending `BaseOutput`:
```javascript
export class CspOutput extends BaseOutput {
  static name = "content-security-policy";
  static title = "Content Security Policy";
  static possibleResults = [/* expectations */];
}
export function contentSecurityPolicyTest(requests) {
  // analyze, return CspOutput instance with expectation/pass/result set
}
```

### Expectations System
- Defined in `src/types.js` as `Expectation` enum
- Each test maps conditions to specific expectations (e.g., CSP can be "implemented-with-no-unsafe" or "not-implemented")
- Expectations drive scoring via `src/grader/grader.js`

### Database Patterns
- Repository functions in `src/database/repository.js`
- Query construction using `pg-format` library for safe parameterization
- Pool provided via Fastify plugin (`@fastify/postgres`)
- ScanState enum for state machine: PENDING → RUNNING → FINISHED/FAILED/ABORTED

**Adapter-Specific Notes**:
- PostgreSQL: Uses parameterized queries with `$1, $2, ...` placeholders
- Neo4j: Uses Cypher query language with map-based parameters `{param: value}`
- Both return normalized row objects with consistent field names (`scan_id`, not `scanId`)

### API Response Structure
```javascript
{
  scan: {
    algorithmVersion: 4,
    grade: "A+",
    score: 105,
    testsFailed: 0,
    testsPassed: 10,
    responseHeaders: { ... }
  },
  tests: {
    "test-name": {
      expectation: "...",
      pass: true/false,
      result: "...",
      scoreModifier: 0,
      data: null
    }
  }
}
```

## Critical Technical Details

### Retrieval Process
- Makes parallel HTTP + HTTPS requests (via Axios)
- Follows redirects, collects cookies/headers across chain
- Performs CORS preflight (OPTIONS) request  
- Parses HTML for `<meta http-equiv>` headers
- Handles HSTS preload list from JSON config file

### Scoring Logic
- Base score: 100
- Tests add/subtract via `scoreModifier` (-20 to +5 range)
- Extra credit allowed if uncurved score ≥ threshold (MINIMUM_SCORE_FOR_EXTRA_CREDIT)
- Grade ("A+", "A", "B", etc.) derived from final score via grader

### Caching (API Only)
- GET `/analyze`: Cache age 24 hours (respects `cacheTimeForGet` config)
- POST `/analyze`: Cache age 60 seconds (respects `cooldown` config)
- Queries database for recent scan before re-scanning

### Configuration Hierarchy
Environment variables override defaults in `src/config.js`:
- Database: `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGPORT`, `PGDATABASE`
- API: `HTTPOBS_API_PORT`, `HTTPOBS_API_COOLDOWN`, `HTTPOBS_API_GET_CACHE`
- Retriever: `RETRIEVER_USER_AGENT`, `ABORT_TIMEOUT`, `CLIENT_TIMEOUT`
- Sentry: `SENTRY_DSN`

### Migration System
- Postgrator-based with `/do` and `/undo` SQL files
- Version format: `NNN.{do,undo}.description.sql` (e.g., `001.do.sites.sql`)
- Apply with: `npm run migrate` or direct call to `migrateDatabase()`

## Common Task Patterns

### Adding a New Security Test
1. Create `src/analyzer/tests/test-name.js` with test function + Output class
2. Add to `src/constants.js` in `ALL_TESTS` and `ALL_RESULTS`
3. Define expectations in `src/types.js` Expectation enum
4. Add score modifiers in `src/grader/grader.js`
5. Create unit test in `test/test-name.test.js` using `emptyRequests()` helper

### Modifying Database Schema
1. Create migration files in `migrations/` (numbered sequentially)
2. Include both `.do.sql` and `.undo.sql` versions
3. Run `npm run migrate` locally to test
4. Never modify existing migration files

### API Endpoint Changes
1. Add/update schema in `src/api/v2/schemas.js`
2. Register route in `src/api/v2/<feature>/index.js` via Fastify plugin pattern
3. Use utility functions from `src/api/v2/utils.js` (executeScan, checkSitename, etc.)
4. Validate queries/bodies against schema before processing

## Critical Do's and Don'ts

✅ **DO**:
- Use JSDoc for all exports and complex functions
- Create tests before modifying scanner logic
- Use `emptyRequests()` helper to mock request objects
- Run `npm test` before committing
- Use environment variables for configuration
- Call migrations explicitly when DB schema changes

❌ **DON'T**:
- Modify existing migration files; create new ones
- Hardcode credentials or secrets (use config.js)
- Add new dependencies without discussion (project has specific choices)
- Use TypeScript syntax (this is pure JS with JSDoc)
- Add tests without CONFIG.tests.enableDBTests guards if they need database
- Mix http+https response handling without checking `retrievals.responses.auto`

## File Reference Guide

| File | Purpose |
|------|---------|
| `src/index.js` | Scanner export point |
| `src/constants.js` | Test registry (ALL_TESTS) |
| `src/types.js` | Expectation enum, Response/Requests classes |
| `src/config.js` | Configuration schema (convict) |
| `src/site.js` | Site parsing and validation |
| `src/scanner/index.js` | Main scan orchestration |
| `src/retriever/retriever.js` | HTTP fetching and redirect handling |
| `src/analyzer/tests/*.js` | Individual security tests |
| `src/api/server.js` | Fastify server setup |
| `src/api/v2/schemas.js` | Request/response validation schemas |
| `src/database/repository.js` | Database queries and pool config |
| `test/helpers.js` | Mock request builders |
| `migrations/` | SQL migration files |
| `src/database/adapter.js` | Database adapter factory and interface |
| `src/database/adapters/postgresql.js` | PostgreSQL adapter implementation |
| `src/database/adapters/neo4j.js` | Neo4j adapter implementation |
| `src/database/adapters/README.md` | Database adapter documentation |
| `docs/NEO4J_SETUP.md` | Neo4j AuraDB setup and configuration |
