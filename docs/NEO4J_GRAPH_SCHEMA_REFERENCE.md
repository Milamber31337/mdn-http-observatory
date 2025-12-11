# Neo4j Graph Schema - Complete Reference

## Quick Reference

### Three Core Node Types

| Node Type | Purpose | Key Properties |
|-----------|---------|-----------------|
| **Site** | Website being scanned | `id`, `domain` (UNIQUE), `creationTime` |
| **Scan** | Individual security audit | `id` (UNIQUE), `state`, `grade`, `score`, timestamps |
| **TestResult** | Result of one security test | `id` (UNIQUE), `name`, `pass`, `expectation`, `result` |

### Two Relationship Types

| Relationship | Direction | Meaning |
|--------------|-----------|---------|
| **HAS_SCAN** | Site → Scan | "This site has this scan" |
| **HAS_TEST** | Scan → TestResult | "This scan has this test result" |

---

## Complete Node Schemas

### Site Node Schema

```javascript
// Node Label: :Site
{
  id: String,           // Unique ID (generated from domain + timestamp)
  domain: String,       // Website domain (UNIQUE constraint)
  creationTime: Long    // Timestamp when first scanned (milliseconds)
}

// Constraints
// UNIQUE: domain
// Index: creationTime

// Example
{
  id: "mozilla_org_1702366800000",
  domain: "mozilla.org",
  creationTime: 1702366800000
}
```

### Scan Node Schema

```javascript
// Node Label: :Scan
{
  id: String,                 // UUID for this scan
  siteId: String,             // Reference to parent Site.id
  state: String,              // 'PENDING'|'RUNNING'|'FINISHED'|'FAILED'|'ABORTED'
  startTime: Long,            // Scan start time (milliseconds epoch)
  endTime: Long,              // Scan end time (null if still running)
  testsFailed: Integer,       // Count of tests that failed
  testsPassed: Integer,       // Count of tests that passed
  testsQuantity: Integer,     // Total tests run
  grade: String,              // 'A+'|'A'|'A-'|'B+'|'B'|'B-'|'C+'|'C'|'C-'|'D+'|'D'|'D-'|'F'
  score: Integer,             // 0-105+ (null if not finished)
  error: String,              // Error message (null if successful)
  algorithmVersion: Integer,  // Version of scoring algo (e.g., 4)
  responseHeaders: String,    // JSON string of HTTP response headers
  statusCode: Integer         // HTTP status code (200, 404, 503, etc.)
}

// Constraints
// UNIQUE: id

// Indexes
// state, startTime, endTime, grade, score, algorithmVersion

// Example
{
  id: "550e8400-e29b-41d4-a716-446655440000",
  siteId: "mozilla_org_1702366800000",
  state: "FINISHED",
  startTime: 1702366900000,
  endTime: 1702366915000,
  testsFailed: 0,
  testsPassed: 10,
  testsQuantity: 10,
  grade: "A+",
  score: 105,
  error: null,
  algorithmVersion: 4,
  responseHeaders: "{\"content-type\": \"text/html; charset=utf-8\"}",
  statusCode: 200
}
```

### TestResult Node Schema

```javascript
// Node Label: :TestResult
{
  id: String,           // UUID for this test result
  scanId: String,       // Reference to parent Scan.id
  name: String,         // Test name (indexed)
                        // Options: 'content-security-policy',
                        //          'cookies',
                        //          'cross-origin-resource-policy',
                        //          'redirection',
                        //          'referrer-policy',
                        //          'strict-transport-security',
                        //          'subresource-integrity',
                        //          'x-content-type-options',
                        //          'x-frame-options',
                        //          'cors'
  expectation: String,  // Expected result (enum value)
  result: String,       // Actual result (enum value, matches expectation)
  pass: Boolean,        // true if result matches expectation
  scoreModifier: Integer, // Points: -20 to +5 typically
  output: String        // JSON string with additional test data
}

// Constraints
// UNIQUE: id

// Indexes
// name, scanId

// Example
{
  id: "660f9511-f30c-52e5-b827-557766551111",
  scanId: "550e8400-e29b-41d4-a716-446655440000",
  name: "content-security-policy",
  expectation: "csp-implemented-with-no-unsafe",
  result: "csp-implemented-with-no-unsafe",
  pass: true,
  scoreModifier: 0,
  output: "{\"headerValue\": \"default-src 'self'\", \"directive\": \"default-src\"}"
}
```

---

## Relationship Schemas

### HAS_SCAN Relationship

```
(Site)-[relationship: HAS_SCAN]->(Scan)

Properties: None (pure structural relationship)

Cardinality: 1:N (one Site has many Scans)

Semantics: "This website has been scanned (this many times)"

Query Example:
MATCH (site:Site {domain: "example.com"})-[:HAS_SCAN]->(scan:Scan)
RETURN scan
```

### HAS_TEST Relationship

```
(Scan)-[relationship: HAS_TEST]->(TestResult)

Properties: None (pure structural relationship)

Cardinality: 1:N (one Scan has 10 TestResults)

Semantics: "This scan includes this test result"

Query Example:
MATCH (scan:Scan {id: "..."})-[:HAS_TEST]->(test:TestResult)
WHERE test.pass = false
RETURN test
```

---

## Complete Constraints & Indexes

### Uniqueness Constraints (3 total)

```cypher
CREATE CONSTRAINT site_domain_unique FOR (s:Site) REQUIRE s.domain IS UNIQUE
CREATE CONSTRAINT scan_id_unique FOR (scan:Scan) REQUIRE scan.id IS UNIQUE
CREATE CONSTRAINT test_id_unique FOR (test:TestResult) REQUIRE test.id IS UNIQUE
```

### Performance Indexes (10 total)

```cypher
// Site indexes
CREATE INDEX site_creation_time FOR (s:Site) ON (s.creationTime)

// Scan indexes
CREATE INDEX scan_state FOR (scan:Scan) ON (scan.state)
CREATE INDEX scan_start_time FOR (scan:Scan) ON (scan.startTime)
CREATE INDEX scan_end_time FOR (scan:Scan) ON (scan.endTime)
CREATE INDEX scan_algorithm_version FOR (scan:Scan) ON (scan.algorithmVersion)
CREATE INDEX scan_grade FOR (scan:Scan) ON (scan.grade)
CREATE INDEX scan_score FOR (scan:Scan) ON (scan.score)

// TestResult indexes
CREATE INDEX test_name FOR (test:TestResult) ON (test.name)
```

---

## Schema Hierarchy & Relationships

```
Site (1)
 └─ [:HAS_SCAN] (1:N)
     └─ Scan (N)
         └─ [:HAS_TEST] (1:N)
             └─ TestResult (N=10 per Scan)
```

**Cardinality Examples**:
- 1 Site → 1000s of Scans (one per scan run)
- 1 Scan → 10 TestResults (always exactly 10 tests)
- Total per Site: domain → scans × 10 test results

---

## Temporal Data Model

### Timestamps as Epoch Milliseconds

All timestamps stored as **Long** (64-bit) millisecond values:

```javascript
// JavaScript
const now = Date.now();  // Returns: 1702366900000

// Neo4j
{startTime: 1702366900000}  // Same value

// Conversion
new Date(1702366900000).toISOString()
// "2023-12-12T07:01:40.000Z"
```

### Time-Based Queries

```cypher
// Recent scans (last 24 hours)
MATCH (scan:Scan)
WHERE scan.startTime >= (1702366900000 - 86400000)
RETURN scan

// Scans on specific date
MATCH (scan:Scan)
WHERE scan.startTime >= 1702324800000  // 2023-12-11 00:00:00 UTC
AND scan.startTime < 1702411200000     // 2023-12-12 00:00:00 UTC
RETURN scan
```

---

## Test Result Enumerations

### Test Names (10 fixed)

1. `content-security-policy` - CSP header analysis
2. `cookies` - Cookie security analysis
3. `cross-origin-resource-policy` - CORP header analysis
4. `redirection` - HTTP redirect chain analysis
5. `referrer-policy` - Referrer-Policy header analysis
6. `strict-transport-security` - HSTS header analysis
7. `subresource-integrity` - SRI implementation analysis
8. `x-content-type-options` - X-Content-Type-Options analysis
9. `x-frame-options` - X-Frame-Options analysis
10. `cors` - CORS configuration analysis

### Expectation Values (50+ possible)

Examples for CSP test:
- `csp-implemented-with-no-unsafe`
- `csp-implemented-with-no-unsafe-default-src-none`
- `csp-implemented-with-unsafe-inline-in-style-src-only`
- `csp-not-implemented`
- `csp-header-invalid`
- ... (many more per test)

See `src/types.js` for complete enumeration.

---

## Data Storage Estimates

Per Scan:
- Site node: ~100 bytes
- Scan node: ~500 bytes
- TestResult nodes (×10): ~200 bytes each = 2,000 bytes
- Relationships (×11): ~50 bytes each = 550 bytes
- **Total per scan**: ~3.2 KB

Estimated capacity (Neo4j Free tier, 2GB):
- ~625,000 scans
- ~62,500 sites (assuming 10 scans each)

For larger deployments, upgrade to paid AuraDB tier.

---

## Comparison Table: PostgreSQL vs Neo4j

| Aspect | PostgreSQL | Neo4j |
|--------|-----------|-------|
| **Sites Table** | 1 row per domain | 1 node per domain |
| **Scans Table** | 1 row per scan | 1 node per scan |
| **Tests Table** | 10 rows per scan | 10 nodes per scan |
| **Relationships** | Foreign keys | Explicit [:HAS_SCAN], [:HAS_TEST] |
| **Get all scans for site** | SELECT with JOIN | MATCH (site)-[:HAS_SCAN]->(scan) |
| **Get tests for scan** | SELECT with JOIN | MATCH (scan)-[:HAS_TEST]->(test) |
| **Site history** | Window functions | Ordered MATCH with relationships |
| **Indexes** | Per column | Per (Node:label, property) |

---

## Design Rationale

### Why This Structure?

1. **Natural Hierarchy**: Matches real-world domain (site → scans → tests)
2. **Relationship-First**: Relationships are first-class, not implicit
3. **Property Graph**: Flexible properties on all nodes
4. **Scalable**: No need for complex JOINs
5. **Temporal**: Easy to track changes over time
6. **Queryable**: Natural Cypher for "find sites with pattern X"

### Why These Properties?

1. **Scan.state**: State machine for tracking progress
2. **Scan.grade & score**: Aggregated results immediately available
3. **TestResult.pass boolean**: Fast filtering for pass/fail
4. **TestResult.scoreModifier**: Fine-grained scoring visible at test level
5. **Timestamps as epoch**: Language-agnostic, sortable

### Why These Constraints?

1. **UNIQUE domain**: One logical site per domain
2. **UNIQUE scan id**: Prevent duplicate scan records
3. **UNIQUE test id**: Prevent duplicate test results

### Why These Indexes?

1. **Scan.state**: Quick filtering by RUNNING/FINISHED/FAILED
2. **Scan.startTime**: Chronological ordering (most common query)
3. **Scan.grade/score**: Statistics and filtering
4. **TestResult.name**: Group tests by type

---

## Implementation in Code

See actual implementation in:
- `src/database/adapters/neo4j.js` - Query execution
- `src/database/adapters/neo4j.js` - initializeSchema() method
- `docs/NEO4J_GRAPH_SCHEMA.md` - Query patterns
- `docs/NEO4J_SCHEMA_VISUAL.md` - Visual examples

---

**Schema Version**: 1.0
**Last Updated**: December 2025
**Database**: Neo4j 5.x / AuraDB
