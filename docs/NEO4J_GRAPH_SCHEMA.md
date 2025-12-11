# Neo4j Graph Schema for MDN HTTP Observatory

## Overview

The Neo4j schema implements a **property graph model** that represents the hierarchical relationship between sites, scans, and test results. This design is optimized for traversing scan history and exploring test relationships.

## Node Types & Properties

### 1. Site Node

Represents a website being scanned.

```
(:Site {
  id: String,           // Unique identifier (domain-based)
  domain: String,       // Domain name (UNIQUE constraint)
  creationTime: Long    // Epoch milliseconds when site was first scanned
})
```

**Example**:
```cypher
CREATE (s:Site {
  id: "example_com_1702366800000",
  domain: "example.com",
  creationTime: 1702366800000
})
```

**Constraints**:
- `domain` is UNIQUE (ensures one node per domain)
- `id` is UNIQUE (prevents duplicates)

**Indexes**:
- `creationTime` (for temporal queries)

---

### 2. Scan Node

Represents a single security scan of a site.

```
(:Scan {
  id: String,                    // UUID for scan
  siteId: String,                // Reference to parent Site
  state: String,                 // 'PENDING'|'RUNNING'|'FINISHED'|'FAILED'|'ABORTED'
  startTime: Long,               // Epoch milliseconds when scan started
  endTime: Long,                 // Epoch milliseconds when scan completed (null if running)
  testsFailed: Integer,          // Number of tests that failed
  testsPassed: Integer,          // Number of tests that passed
  testsQuantity: Integer,        // Total number of tests run
  grade: String,                 // 'A+'|'A'|'A-'|'B+'|...|'F' (null if not finished)
  score: Integer,                // Final score 0-105+ (null if not finished)
  error: String,                 // Error message if state='FAILED' (null otherwise)
  algorithmVersion: Integer,     // Version of scoring algorithm (e.g., 4)
  responseHeaders: String,       // JSON stringified response headers
  statusCode: Integer            // HTTP status code (200, 404, etc.)
})
```

**Example**:
```cypher
CREATE (scan:Scan {
  id: "550e8400-e29b-41d4-a716-446655440000",
  siteId: "example_com_1702366800000",
  state: "FINISHED",
  startTime: 1702367000000,
  endTime: 1702367015000,
  testsFailed: 0,
  testsPassed: 10,
  testsQuantity: 10,
  grade: "A+",
  score: 105,
  error: null,
  algorithmVersion: 4,
  responseHeaders: "{\"content-security-policy\": \"...\"}",
  statusCode: 200
})
```

**Indexes**:
- `state` (for finding scans by status)
- `startTime` (for chronological queries)
- `endTime` (for result age queries)
- `algorithmVersion` (for version filtering)
- `grade` (for statistics)
- `score` (for range queries)

---

### 3. TestResult Node

Represents the result of a single security test within a scan.

```
(:TestResult {
  id: String,           // UUID for test result
  scanId: String,       // Reference to parent Scan
  name: String,         // Test name (e.g., 'content-security-policy')
  expectation: String,  // Expected result (e.g., 'csp-implemented-with-no-unsafe')
  result: String,       // Actual result (matches expectation enum)
  pass: Boolean,        // Whether test passed
  scoreModifier: Integer, // Points added/subtracted (-20 to +5)
  output: String        // JSON stringified additional test data
})
```

**Example**:
```cypher
CREATE (test:TestResult {
  id: "660f9511-f30c-52e5-b827-557766551111",
  scanId: "550e8400-e29b-41d4-a716-446655440000",
  name: "content-security-policy",
  expectation: "csp-implemented-with-no-unsafe",
  result: "csp-implemented-with-no-unsafe",
  pass: true,
  scoreModifier: 0,
  output: "{\"headerValue\": \"default-src 'self'\"}"
})
```

**Indexes**:
- `name` (for filtering by test type)
- `scanId` (for finding tests belonging to a scan)

---

## Relationship Types

### 1. HAS_SCAN

**Direction**: Site → Scan

Links a Site to all scans performed on that site.

```
(Site)-[:HAS_SCAN]->(Scan)
```

**Properties**: None (relationship has no properties)

**Example**:
```cypher
CREATE (site:Site {domain: "example.com"})-[:HAS_SCAN]->(scan:Scan {id: "..."})
```

**Use Cases**:
- Find all scans for a site: `MATCH (s:Site)-[:HAS_SCAN]->(scan) WHERE s.domain = "example.com"`
- Get scan history: `MATCH (s:Site)-[:HAS_SCAN]->(scan) ORDER BY scan.startTime DESC`
- Calculate site statistics: `MATCH (s:Site)-[:HAS_SCAN]->(scan) RETURN COUNT(scan)`

---

### 2. HAS_TEST

**Direction**: Scan → TestResult

Links a Scan to all test results from that scan.

```
(Scan)-[:HAS_TEST]->(TestResult)
```

**Properties**: None (relationship has no properties)

**Example**:
```cypher
CREATE (scan:Scan {id: "..."})-[:HAS_TEST]->(test:TestResult {name: "content-security-policy"})
```

**Use Cases**:
- Find all test results for a scan: `MATCH (scan:Scan)-[:HAS_TEST]->(test) WHERE scan.id = "..."`
- Get specific test result: `MATCH (scan:Scan)-[:HAS_TEST]->(test) WHERE scan.id = "..." AND test.name = "csp"`
- Count passed/failed tests: `MATCH (scan:Scan)-[:HAS_TEST]->(test) WHERE test.pass = true RETURN COUNT(test)`

---

## Complete Graph Structure

```
     Site (domain = "example.com")
       |
       | [:HAS_SCAN]
       |
     Scan (id=scan1, grade="A+", score=105)
       |
       +--[:HAS_TEST]---> TestResult (name="csp", pass=true)
       |
       +--[:HAS_TEST]---> TestResult (name="hsts", pass=true)
       |
       +--[:HAS_TEST]---> TestResult (name="sri", pass=false)
       |
       
     Scan (id=scan2, grade="B+", score=85)
       |
       +--[:HAS_TEST]---> TestResult (name="csp", pass=false)
       |
       +--[:HAS_TEST]---> TestResult (name="hsts", pass=true)
```

## Constraints & Indexes Summary

### Uniqueness Constraints

```cypher
CREATE CONSTRAINT unique_site_domain FOR (s:Site) REQUIRE s.domain IS UNIQUE
CREATE CONSTRAINT unique_scan_id FOR (scan:Scan) REQUIRE scan.id IS UNIQUE
CREATE CONSTRAINT unique_test_id FOR (test:TestResult) REQUIRE test.id IS UNIQUE
```

### Performance Indexes

| Node | Property | Purpose |
|------|----------|---------|
| Site | creationTime | Timeline queries |
| Scan | state | Status filtering |
| Scan | startTime | Chronological ordering |
| Scan | endTime | Age-based filtering |
| Scan | algorithmVersion | Version filtering |
| Scan | grade | Grade distribution |
| Scan | score | Score range queries |
| TestResult | name | Test type filtering |

## Query Patterns

### 1. Get Most Recent Scan for a Site

```cypher
MATCH (s:Site {domain: "example.com"})-[:HAS_SCAN]->(scan:Scan)
WHERE scan.state = "FINISHED"
RETURN scan
ORDER BY scan.startTime DESC
LIMIT 1
```

### 2. Get All Tests for a Scan

```cypher
MATCH (scan:Scan {id: "550e8400-..."})-[:HAS_TEST]->(test:TestResult)
RETURN test
ORDER BY test.name
```

### 3. Find Sites with Low Grades

```cypher
MATCH (s:Site)-[:HAS_SCAN]->(scan:Scan)
WHERE scan.state = "FINISHED" AND scan.grade IN ["D", "D-", "F"]
RETURN s.domain, scan.grade, scan.score
ORDER BY scan.score ASC
```

### 4. Get Score History for a Site

```cypher
MATCH (s:Site {domain: "example.com"})-[:HAS_SCAN]->(scan:Scan)
WHERE scan.state = "FINISHED"
WITH scan
ORDER BY scan.startTime DESC
RETURN scan.startTime, scan.grade, scan.score
```

### 5. Grade Distribution

```cypher
MATCH (scan:Scan)
WHERE scan.state = "FINISHED" AND scan.grade IS NOT NULL
WITH scan.grade as grade, COUNT(*) as count
RETURN grade, count
ORDER BY 
  CASE grade
    WHEN "A+" THEN 0
    WHEN "A" THEN 1
    WHEN "A-" THEN 2
    WHEN "B+" THEN 3
    WHEN "B" THEN 4
    WHEN "B-" THEN 5
    WHEN "C+" THEN 6
    WHEN "C" THEN 7
    WHEN "C-" THEN 8
    WHEN "D+" THEN 9
    WHEN "D" THEN 10
    WHEN "D-" THEN 11
    WHEN "F" THEN 12
  END
```

### 6. Test Result Statistics

```cypher
MATCH (scan:Scan {id: "..."})-[:HAS_TEST]->(test:TestResult)
WITH SUM(CASE WHEN test.pass THEN 1 ELSE 0 END) as passed,
     COUNT(test) as total
RETURN passed, total, (passed * 100 / total) as pass_rate
```

## Data Types & Encoding

| Cypher Type | Storage | Example |
|-------------|---------|---------|
| String | UTF-8 | "example.com", "A+", "FINISHED" |
| Integer | 64-bit | 105, 200, 1702367000000 |
| Long | 64-bit | Epoch milliseconds for timestamps |
| Boolean | 1 byte | true, false |
| JSON String | Text | Stringified headers/output objects |

## Temporal Handling

Timestamps are stored as **millisecond epoch values** (Long):

```javascript
// JavaScript
const now = Date.now(); // 1702367000000

// Neo4j Cypher
CREATE (scan:Scan {startTime: 1702367000000})

// Query by time range
MATCH (scan:Scan)
WHERE scan.startTime >= 1702366800000 AND scan.startTime <= 1702367000000
```

## Storage Estimates

For reference, Neo4j storage per scan:

- **Site node**: ~100 bytes
- **Scan node**: ~500 bytes (including JSON headers)
- **TestResult node** (×10 per scan): ~200 bytes each = 2KB
- **Relationships** (×11 per scan): ~50 bytes each = 550 bytes
- **Total per scan**: ~3.2 KB

For 1 million scans: ~3.2 GB storage

## Why This Schema?

### Advantages

1. **Natural Hierarchy**: Graph structure mirrors real-world relationships
2. **Efficient Traversal**: Easy navigation from site → scans → tests
3. **Relationship Queries**: Direct pattern matching for "show me all failed tests"
4. **History Exploration**: Natural chronological ordering via relationships
5. **Scalability**: Relationships don't require joins like SQL

### Trade-offs

| Aspect | Neo4j | PostgreSQL |
|--------|-------|-----------|
| Traversal Speed | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| Aggregations | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Update Speed | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Memory Usage | Higher | Lower |
| Complex Queries | Simpler | More Complex |

## Compatibility Layer

The adapter returns data in **PostgreSQL row format** for API compatibility:

```javascript
{
  id: string,
  site_id: string,          // Neo4j siteId → PostgreSQL site_id
  state: string,
  start_time: Date,         // Neo4j startTime → PostgreSQL start_time
  end_time: Date,           // Neo4j endTime → PostgreSQL end_time
  tests_failed: number,     // Neo4j testsFailed → PostgreSQL tests_failed
  tests_passed: number,
  tests_quantity: number,
  grade: string,
  score: number,
  error: string,
  algorithm_version: number
}
```

This ensures **100% API compatibility** between PostgreSQL and Neo4j.

## Migration Path

The schema supports data migration from PostgreSQL:

1. **Export** sites, scans, tests from PostgreSQL
2. **Transform** field names (siteId ← site_id)
3. **Create** Site nodes and relationships
4. **Create** Scan nodes and relationships
5. **Create** TestResult nodes
6. **Verify** constraints and indexes are applied

See `docs/DATABASE_MIGRATION.md` for implementation.

---

**Next Steps**:
- Review queries in `src/database/adapters/neo4j.js`
- See `docs/NEO4J_SETUP.md` for AuraDB setup
- Check `INSTALLATION_NEO4J.md` for quick start
