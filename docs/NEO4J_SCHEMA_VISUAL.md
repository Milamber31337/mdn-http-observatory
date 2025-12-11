# Neo4j Graph Schema - Visual Guide

## Simple Data Model Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Neo4j Observatory                     │
├─────────────────────────────────────────────────────────┤
│                                                           │
│    ┌────────────────┐                                    │
│    │     Site       │                                    │
│    ├────────────────┤                                    │
│    │ id: String     │                                    │
│    │ domain: String │  UNIQUE                            │
│    │ creation_time  │                                    │
│    └────────┬───────┘                                    │
│             │                                            │
│             │ [:HAS_SCAN] 1:N                            │
│             │                                            │
│    ┌────────▼──────────────────────────────┐             │
│    │            Scan                        │             │
│    ├─────────────────────────────────────────┤           │
│    │ id: UUID                                │           │
│    │ siteId: String                          │           │
│    │ state: RUNNING|FINISHED|FAILED          │           │
│    │ startTime: Long (epoch ms)              │           │
│    │ endTime: Long                           │           │
│    │ grade: String (A+, A, B+, ... F)        │           │
│    │ score: Integer (0-105+)                 │           │
│    │ testsFailed: Integer                    │           │
│    │ testsPassed: Integer                    │           │
│    │ statusCode: Integer (200, 404, etc)     │           │
│    │ error: String (if failed)               │           │
│    └────────┬──────────────────────────────┘           │
│             │                                            │
│             │ [:HAS_TEST] 1:N (10 tests per scan)       │
│             │                                            │
│    ┌────────▼───────────────────────────┐               │
│    │       TestResult                    │               │
│    ├─────────────────────────────────────┤              │
│    │ id: UUID                            │              │
│    │ scanId: String                      │              │
│    │ name: String (csp, hsts, sri, ...)  │              │
│    │ expectation: String (enum)          │              │
│    │ result: String (enum)               │              │
│    │ pass: Boolean                       │              │
│    │ scoreModifier: Integer (-20 to +5)  │              │
│    │ output: String (JSON)               │              │
│    └─────────────────────────────────────┘              │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

## Detailed Node Structure

### Site Node
```
(:Site)
  ├── Properties:
  │   ├── id: "example_com_1702366800000"
  │   ├── domain: "example.com" [UNIQUE INDEX]
  │   └── creationTime: 1702366800000
  │
  └── Relationships:
      └── [:HAS_SCAN]→ (:Scan) × N
```

### Scan Node
```
(:Scan)
  ├── Properties:
  │   ├── id: "550e8400-e29b-41d4-a716-446655440000"
  │   ├── siteId: "example_com_1702366800000"
  │   ├── state: "FINISHED" [INDEX]
  │   ├── startTime: 1702367000000 [INDEX]
  │   ├── endTime: 1702367015000 [INDEX]
  │   ├── grade: "A+" [INDEX]
  │   ├── score: 105 [INDEX]
  │   ├── testsFailed: 0
  │   ├── testsPassed: 10
  │   ├── testsQuantity: 10
  │   ├── algorithmVersion: 4 [INDEX]
  │   ├── statusCode: 200
  │   ├── error: null
  │   └── responseHeaders: "{...}"
  │
  └── Relationships:
      ├── ←[:HAS_SCAN]─ (:Site)
      └── [:HAS_TEST]→ (:TestResult) × 10
```

### TestResult Node
```
(:TestResult)
  ├── Properties:
  │   ├── id: "660f9511-f30c-52e5-b827-557766551111"
  │   ├── scanId: "550e8400-e29b-41d4-a716-446655440000" [INDEX]
  │   ├── name: "content-security-policy" [INDEX]
  │   ├── expectation: "csp-implemented-with-no-unsafe"
  │   ├── result: "csp-implemented-with-no-unsafe"
  │   ├── pass: true
  │   ├── scoreModifier: 0
  │   └── output: "{\"headerValue\": \"...\"}"
  │
  └── Relationships:
      └── ←[:HAS_TEST]─ (:Scan)
```

## Complete Example Instance

```
SITE: example.com
│
├─ SCAN #1 (2025-01-01)
│  │ State: FINISHED
│  │ Grade: A+
│  │ Score: 105
│  │
│  ├─ content-security-policy    ✅ PASS (0 pts)
│  ├─ x-frame-options            ✅ PASS (0 pts)
│  ├─ x-content-type-options     ✅ PASS (0 pts)
│  ├─ strict-transport-security  ✅ PASS (0 pts)
│  ├─ subresource-integrity      ✅ PASS (0 pts)
│  ├─ referrer-policy            ✅ PASS (0 pts)
│  ├─ cookies                    ✅ PASS (0 pts)
│  ├─ cross-origin-resource-policy ✅ PASS (0 pts)
│  ├─ redirection                ✅ PASS (0 pts)
│  └─ cors                       ✅ PASS (0 pts)
│
├─ SCAN #2 (2025-01-02)
│  │ State: FINISHED
│  │ Grade: B+
│  │ Score: 85
│  │
│  ├─ content-security-policy    ❌ FAIL (-10 pts)
│  ├─ x-frame-options            ✅ PASS (0 pts)
│  ├─ x-content-type-options     ✅ PASS (0 pts)
│  ├─ strict-transport-security  ✅ PASS (0 pts)
│  ├─ subresource-integrity      ✅ PASS (0 pts)
│  ├─ referrer-policy            ✅ PASS (0 pts)
│  ├─ cookies                    ✅ PASS (0 pts)
│  ├─ cross-origin-resource-policy ✅ PASS (0 pts)
│  ├─ redirection                ✅ PASS (0 pts)
│  └─ cors                       ✅ PASS (0 pts)
│
└─ SCAN #3 (2025-01-03)
   │ State: RUNNING
   │ (Currently executing)
```

## Query Visualization

### Query 1: Get Recent Scans for a Site

```cypher
MATCH (s:Site {domain: "example.com"})-[:HAS_SCAN]->(scan:Scan)
WHERE scan.state = "FINISHED"
RETURN scan ORDER BY scan.startTime DESC LIMIT 5
```

**Visualization**:
```
Site("example.com")
    ↓ [:HAS_SCAN]
    ├─→ Scan(startTime: 1702367200000, grade: A+) ← MOST RECENT
    ├─→ Scan(startTime: 1702280800000, grade: B+)
    ├─→ Scan(startTime: 1702194400000, grade: A)
    ├─→ Scan(startTime: 1702108000000, grade: A-)
    └─→ Scan(startTime: 1702021600000, grade: B+) ← 5th MOST RECENT
```

### Query 2: Get All Tests for a Scan

```cypher
MATCH (scan:Scan {id: "550e8400-..."})-[:HAS_TEST]->(test:TestResult)
RETURN test ORDER BY test.name
```

**Visualization**:
```
Scan(id: "550e8400-...")
    ├─[:HAS_TEST]→ TestResult(name: "content-security-policy", pass: true)
    ├─[:HAS_TEST]→ TestResult(name: "cookies", pass: false)
    ├─[:HAS_TEST]→ TestResult(name: "cors", pass: true)
    ├─[:HAS_TEST]→ TestResult(name: "redirection", pass: true)
    ├─[:HAS_TEST]→ TestResult(name: "referrer-policy", pass: true)
    ├─[:HAS_TEST]→ TestResult(name: "sri", pass: true)
    ├─[:HAS_TEST]→ TestResult(name: "strict-transport-security", pass: true)
    ├─[:HAS_TEST]→ TestResult(name: "x-content-type-options", pass: true)
    ├─[:HAS_TEST]→ TestResult(name: "x-frame-options", pass: true)
    └─[:HAS_TEST]→ TestResult(name: "cors", pass: true)
```

## Constraint & Index Schema

```
Constraints (Uniqueness):
├─ Site.domain UNIQUE
├─ Scan.id UNIQUE
└─ TestResult.id UNIQUE

Indexes (Performance):
├─ Site.creationTime
├─ Scan.state
├─ Scan.startTime
├─ Scan.endTime
├─ Scan.grade
├─ Scan.score
├─ Scan.algorithmVersion
└─ TestResult.name
```

## Data Flow

### Creating a New Scan

```
1. API receives request
   POST /api/v2/analyze?host=example.com

2. Adapter creates/retrieves Site
   (:Site {domain: "example.com"})

3. Adapter creates Scan node
   (:Scan {id: UUID, siteId: ..., state: "RUNNING"})

4. Adapter creates relationship
   (Site)-[:HAS_SCAN]→(Scan)

5. Adapter runs 10 security tests
   For each test result:
   - Create (:TestResult) node
   - Create (Scan)-[:HAS_TEST]→(TestResult) relationship

6. Adapter updates Scan
   SET state = "FINISHED", grade = "A+", score = 105

7. API returns scan results
   { scan: {...}, tests: {...} }
```

## Comparison: PostgreSQL vs Neo4j Structure

### PostgreSQL (Relational)
```
sites
├─ id: SERIAL PRIMARY KEY
├─ domain: VARCHAR UNIQUE
└─ creation_time: TIMESTAMP

scans
├─ id: SERIAL PRIMARY KEY
├─ site_id: INTEGER FOREIGN KEY → sites(id)
├─ state: VARCHAR
├─ start_time: TIMESTAMP
├─ grade: VARCHAR
├─ score: SMALLINT
└─ ... (16 columns total)

tests
├─ id: SERIAL PRIMARY KEY
├─ scan_id: INTEGER FOREIGN KEY → scans(id)
├─ site_id: INTEGER FOREIGN KEY → sites(id)
├─ name: VARCHAR
├─ result: VARCHAR
├─ pass: BOOLEAN
└─ ... (8 columns total)
```

### Neo4j (Graph)
```
(:Site)
├─ id: String
├─ domain: String [UNIQUE]
└─ creationTime: Long

(:Scan)
├─ id: String [UNIQUE]
├─ siteId: String
├─ state: String
├─ startTime: Long
├─ grade: String
├─ score: Integer
└─ ... (12 properties total)

(:TestResult)
├─ id: String [UNIQUE]
├─ scanId: String
├─ name: String
├─ result: String
├─ pass: Boolean
└─ ... (8 properties total)

Relationships:
├─ (Site)-[:HAS_SCAN]→(Scan)
└─ (Scan)-[:HAS_TEST]→(TestResult)
```

## Why This Structure?

### ✅ Natural Hierarchy
- Sites contain scans
- Scans contain tests
- Structure matches domain model

### ✅ Efficient Traversal
- Direct path: Site → Scan → Test
- No JOINs required
- Built for graph traversal

### ✅ Relationship Queries
- "Get all scans for a site"
- "Get test history across scans"
- "Find related failing tests"

### ✅ Aggregations
- Count scans per site: Single MATCH + COUNT
- Grade distribution: Single aggregation
- Test pass rates: Direct property queries

### ✅ Future Extensions
- Easy to add (:TestCategory) nodes
- Link tests to security standards
- Add (:Vulnerability) nodes
- Create (:SecurityPractice) reference nodes

---

**Next**: See `docs/NEO4J_GRAPH_SCHEMA.md` for detailed schema documentation.
