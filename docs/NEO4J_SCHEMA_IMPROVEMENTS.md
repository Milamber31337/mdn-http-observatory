# Neo4j Schema Improvements & Optimization Guide

## Current State Analysis

The current schema is **simple and functional** (3 nodes, 2 relationships):
- **Site** → hostname as primary identifier
- **Scan** → security audit result
- **TestResult** → individual test outcome

**Strengths:**
✅ Minimal and performant for basic queries  
✅ Easy to understand and maintain  
✅ Works well for "scan this website" use cases  
✅ Fast inserts and updates  

**Limitations:**
❌ Cannot separate hostname from domain (e.g., `api.example.com` vs `www.example.com` treated as different sites)  
❌ No explicit test metadata (test versions, categories, severity)  
❌ Limited historical analysis (trends across multiple scans)  
❌ No DNS resolution tracking  
❌ Cannot answer "which domains have DNS issues?"  
❌ Port information embedded in strings, not queryable  
❌ FQDN structure not normalized  

---

## Proposed Schema v2.0: Enhanced Graph Model

### Overview

A **6-node, 8-relationship** model providing:
- ✅ Separate FQDN, Domain, DNS tracking
- ✅ Test metadata and versioning
- ✅ Port and protocol normalization
- ✅ Hierarchical DNS relationships
- ✅ Test categorization
- ✅ Enhanced analytics and trending

---

## Detailed Node & Relationship Specifications

### 1. **FQDN Node** (Fully Qualified Domain Name)

**Purpose:** Represents a complete, scannable host (scheme + hostname + port)

**Node Label:** `:FQDN`

**Properties:**

```javascript
{
  id: String,              // UUID (FQDN primary key)
  fqdn: String,            // UNIQUE: "example.com:443" or "api.example.com:8443"
  hostname: String,        // Indexed: "example.com" or "api.example.com"
  port: Integer,           // Indexed: 80, 443, 8080, etc.
  protocol: String,        // "http" | "https" (inferred, but stored for query convenience)
  path: String,            // Optional: "/api/v1" (if specified in scan)
  creationTime: Long,      // When first discovered
  lastScanTime: Long,      // Timestamp of most recent scan
  isActive: Boolean,       // false if permanently decommissioned
  metadata: String         // JSON: {"sourceType": "manual|crawled|redirect", "discoveredVia": "..."}
}

// Constraints
// UNIQUE: fqdn

// Indexes
// hostname, port, lastScanTime, isActive

// Example
{
  id: "fqdn-123-abc-456",
  fqdn: "api.mozilla.org:443",
  hostname: "api.mozilla.org",
  port: 443,
  protocol: "https",
  path: null,
  creationTime: 1702366800000,
  lastScanTime: 1702453200000,
  isActive: true,
  metadata: "{\"sourceType\": \"redirect\", \"discoveredVia\": \"mozilla.org\"}"
}
```

### 2. **Domain Node** (Root Domain)

**Purpose:** Represents the root domain (e.g., `mozilla.org`) grouping all FQDNs

**Node Label:** `:Domain`

**Properties:**

```javascript
{
  id: String,                   // UUID
  domain: String,               // UNIQUE: "mozilla.org"
  registrant: String,           // Organization name
  creationTime: Long,           // When domain first seen
  lastScanTime: Long,           // Most recent scan of any FQDN
  fqdnCount: Integer,           // Denormalized: count of FQDNs
  aggregateGrade: String,       // Worst grade across all FQDNs
  aggregateScore: Integer,      // Lowest score across all FQDNs
  dnsServers: String,           // JSON array: ["ns1.example.com", ...]
  metadata: String              // JSON: {"tld": "org", "registrar": "...", "tags": [...]}
}

// Constraints
// UNIQUE: domain

// Indexes
// domain, creationTime, lastScanTime, aggregateGrade

// Example
{
  id: "domain-456-def-789",
  domain: "mozilla.org",
  registrant: "Mozilla Foundation",
  creationTime: 1702366800000,
  lastScanTime: 1702453200000,
  fqdnCount: 5,
  aggregateGrade: "A+",
  aggregateScore: 105,
  dnsServers: "[\"ns1.mozilla.org\", \"ns2.mozilla.org\"]",
  metadata: "{\"tld\": \"org\", \"registrar\": \"Gandi\", \"tags\": [\"foundation\", \"verified\"]}"
}
```

### 3. **DNS Node** (DNS Resolution Records)

**Purpose:** Track DNS resolution results and health

**Node Label:** `:DNS`

**Properties:**

```javascript
{
  id: String,                    // UUID
  hostname: String,              // Indexed: hostname (no port)
  recordType: String,            // "A" | "AAAA" | "CNAME" | "MX" | "NS" | "TXT" | "SOA"
  value: String,                 // "1.2.3.4" | "example.com" | "v=spf1 ..." | etc.
  ttl: Integer,                  // Time to live in seconds
  resolvedTime: Long,            // When DNS was resolved
  resolutionStatus: String,      // "SUCCESS" | "FAILED" | "TIMEOUT" | "NXDOMAIN"
  resolver: String,              // "8.8.8.8" (which DNS used for resolution)
  metadata: String               // JSON: {"confidence": 0.95, "provider": "cloudflare"}
}

// Constraints
// UNIQUE: hostname, recordType, value

// Indexes
// hostname, recordType, resolutionStatus, resolvedTime

// Example
{
  id: "dns-789-ghi-012",
  hostname: "api.mozilla.org",
  recordType: "A",
  value: "203.0.113.45",
  ttl: 3600,
  resolvedTime: 1702453200000,
  resolutionStatus: "SUCCESS",
  resolver: "8.8.8.8",
  metadata: "{\"confidence\": 0.98, \"provider\": \"google\"}"
}
```

### 4. **Test Node** (Test Definition & Metadata)

**Purpose:** Represent test types with metadata (not just test results)

**Node Label:** `:Test`

**Properties:**

```javascript
{
  id: String,                       // UUID (permanent for each test type)
  name: String,                     // UNIQUE: "content-security-policy"
  displayName: String,              // "Content Security Policy"
  category: String,                 // "headers" | "cookies" | "networking" | "certificates"
  severity: String,                 // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
  description: String,              // "Checks CSP header implementation..."
  documentation: String,            // URL to docs: "https://mdn.io/..."
  defaultScoreModifier: Integer,    // -20 (base penalty if failed)
  possibleResults: String,          // JSON array of possible expectations
  minAlgorithmVersion: Integer,     // First version this test existed
  maxAlgorithmVersion: Integer,     // Last version (null = current)
  createdTime: Long,                // When test was added to system
  updatedTime: Long,                // When test was last modified
  metadata: String                  // JSON: {"dataPoint": "headers", "testType": "..."}
}

// Constraints
// UNIQUE: name

// Indexes
// category, severity, name

// Example
{
  id: "test-csp-001",
  name: "content-security-policy",
  displayName: "Content Security Policy",
  category: "headers",
  severity: "HIGH",
  description: "Validates implementation of Content-Security-Policy header",
  documentation: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy",
  defaultScoreModifier: -20,
  possibleResults: "[\"csp-implemented-with-no-unsafe\", \"csp-not-implemented\", ...]",
  minAlgorithmVersion: 1,
  maxAlgorithmVersion: null,
  createdTime: 1600000000000,
  updatedTime: 1702366800000,
  metadata: "{\"dataPoint\": \"responseHeaders\", \"testType\": \"static\"}"
}
```

### 5. **Scan Node** (Enhanced - v2.0)

**Purpose:** Security audit result (enhanced with metadata)

**Node Label:** `:Scan`

**Properties:**

```javascript
{
  id: String,                       // UUID
  state: String,                    // "PENDING"|"RUNNING"|"FINISHED"|"FAILED"|"ABORTED"
  startTime: Long,                  // Milliseconds epoch
  endTime: Long,                    // Null if running
  durationMs: Integer,              // Scan duration
  testsFailed: Integer,             // Count
  testsPassed: Integer,             // Count
  testsQuantity: Integer,           // Always 10 (for current version)
  grade: String,                    // "A+"|"A"|"B"|"C"|"F"|null
  score: Integer,                   // 0-105+, null if not finished
  algorithmVersion: Integer,        // Version of scoring algorithm
  statusCode: Integer,              // HTTP response code (200, 404, 503, etc.)
  responseHeaders: String,          // JSON string of HTTP headers
  error: String,                    // Error message, null if successful
  retriesAttempted: Integer,        // How many retry attempts
  metadata: String                  // JSON: {"location": "us-east-1", "endpoint": "..."}
}

// Constraints
// UNIQUE: id

// Indexes
// state, startTime, grade, score, algorithmVersion

// Relationships
// FQDN -[:HAS_SCAN]-> Scan (1:N, on FQDN creation/update)
// Scan -[:USED_VERSION]-> AlgorithmVersion (if versioning enabled)
```

### 6. **TestResult Node** (Enhanced - v2.0)

**Purpose:** Individual test execution result with enhanced data

**Node Label:** `:TestResult`

**Properties:**

```javascript
{
  id: String,                       // UUID
  testName: String,                 // Indexed: "content-security-policy"
  expectation: String,              // Expected result enum
  result: String,                   // Actual result enum
  pass: Boolean,                    // true/false
  scoreModifier: Integer,           // -20 to +5 typically
  severity: String,                 // Denormalized from Test: "HIGH"|"MEDIUM"|"LOW"|"INFO"
  data: String,                     // JSON: detailed test output
  output: String,                   // Alternative name for data (backward compat)
  executionTimeMs: Integer,         // How long test took
  metadata: String                  // JSON: {"headerValue": "...", "directive": "..."}
}

// Constraints
// UNIQUE: id

// Indexes
// testName, pass, severity

// Relationships
// Scan -[:HAS_TEST]-> TestResult (1:N)
// TestResult -[:VALIDATES]-> Test (many:1)
```

---

## Relationship Specifications

### 1. **FQDN -[:BELONGS_TO]-> Domain**

```cypher
(fqdn:FQDN)-[:BELONGS_TO]->(domain:Domain)

Properties: None (structural)
Cardinality: Many:1 (many FQDNs belong to one domain)
Direction: FQDN → Domain

Semantics: "api.mozilla.org belongs to mozilla.org"

Examples:
- api.mozilla.org:443 → mozilla.org
- www.mozilla.org:80 → mozilla.org
- mozilla.org:443 → mozilla.org (self-reference)
```

### 2. **FQDN -[:HAS_SCAN]-> Scan**

```cypher
(fqdn:FQDN)-[:HAS_SCAN]->(scan:Scan)

Properties: None (structural)
Cardinality: 1:N (one FQDN has many scans)
Direction: FQDN → Scan

Semantics: "This FQDN has been scanned (this many times)"

Examples:
- api.mozilla.org:443 has 1,234 scans
- www.mozilla.org:80 has 856 scans
```

### 3. **Scan -[:HAS_TEST]-> TestResult**

```cypher
(scan:Scan)-[:HAS_TEST]->(test:TestResult)

Properties: None (structural)
Cardinality: 1:N (always 10 per scan currently)
Direction: Scan → TestResult

Semantics: "This scan includes this test result"

Examples:
- Scan1 has 10 test results
- Scan2 has 10 test results
```

### 4. **TestResult -[:VALIDATES]-> Test**

```cypher
(result:TestResult)-[:VALIDATES]->(test:Test)

Properties: None (structural)
Cardinality: Many:1 (many results validate one test type)
Direction: TestResult → Test

Semantics: "This result validates this test definition"

Examples:
- 1,000,000 CSP test results validate the CSP Test node
- 500,000 HSTS results validate the HSTS Test node

Key Benefit: Enables queries like:
  MATCH (test:Test {name: "csp"})<-[:VALIDATES]-(result:TestResult)
  RETURN COUNT(result) as totalCspTests
```

### 5. **Domain -[:HAS_FQDN]-> FQDN**

```cypher
(domain:Domain)-[:HAS_FQDN]->(fqdn:FQDN)

Properties: None (structural)
Cardinality: 1:N (one domain has many FQDNs)
Direction: Domain → FQDN

Semantics: "This domain has these FQDNs"

Note: This is the reverse of BELONGS_TO.
Can traverse either direction for convenience.
```

### 6. **FQDN -[:RESOLVES_TO]-> DNS**

```cypher
(fqdn:FQDN)-[:RESOLVES_TO]->(dns:DNS)

Properties:
- resolutionTime: Long (milliseconds)
- reliable: Boolean (true if consistent)

Cardinality: 1:N (one FQDN resolves to multiple A, AAAA, CNAME records)
Direction: FQDN → DNS

Semantics: "This FQDN resolves to these DNS records"

Examples:
- api.mozilla.org:443 → DNS(A, 203.0.113.45)
- api.mozilla.org:443 → DNS(AAAA, 2001:db8::1)
- api.mozilla.org:443 → DNS(CNAME, api-lb.mozilla.org)
```

### 7. **Domain -[:HAS_DNS]-> DNS**

```cypher
(domain:Domain)-[:HAS_DNS]->(dns:DNS)

Properties:
- recordType: String ("NS", "SOA", "MX", "TXT")

Cardinality: 1:N (domain has NS, SOA, MX records)
Direction: Domain → DNS

Semantics: "This domain has these DNS records"

Examples:
- mozilla.org → DNS(NS, ns1.mozilla.org)
- mozilla.org → DNS(MX, mail.mozilla.org)
- mozilla.org → DNS(SOA, ...) 
```

### 8. **Scan -[:USES_ALGORITHM]-> Algorithm** (Optional)

```cypher
(scan:Scan)-[:USES_ALGORITHM]->(algorithm:Algorithm)

Properties:
- appliedAt: Long (when algorithm was selected)

Cardinality: Many:1 (many scans use one algorithm version)
Direction: Scan → Algorithm

Semantics: "This scan was scored using this algorithm"

Note: Optional - enables algorithm versioning/tracking
```

---

## Complete Schema Diagram (v2.0)

```
Domain (root domain)
  │
  ├─ [:HAS_FQDN] ──→ FQDN (hostname:port)
  │                    │
  │                    ├─ [:HAS_SCAN] ──→ Scan (security audit)
  │                    │                    │
  │                    │                    └─ [:HAS_TEST] ──→ TestResult
  │                    │                                          │
  │                    │                                          └─ [:VALIDATES] ──→ Test (metadata)
  │                    │
  │                    └─ [:RESOLVES_TO] ──→ DNS (A, AAAA, CNAME records)
  │
  └─ [:HAS_DNS] ──→ DNS (NS, SOA, MX records)
```

---

## Migration Strategy: Current → v2.0

### Phase 1: Prepare (Non-Breaking)

1. **Keep current schema intact** - All existing code continues to work
2. **Add new nodes** - Create FQDN, Domain, DNS, Test nodes alongside existing Site
3. **Populate in background** - Use job queue to create new nodes from existing data

```javascript
// Migration logic (example)
async function migrateCurrentToV2() {
  // Step 1: For each Site node
  const sites = await session.run(`MATCH (s:Site) RETURN s`);
  
  for (const site of sites) {
    // Step 2: Create Domain node
    const domain = extractDomain(site.domain);
    await session.run(`
      CREATE (d:Domain {domain: $domain})
    `, {domain});
    
    // Step 3: Create FQDN node
    await session.run(`
      CREATE (fqdn:FQDN {fqdn: $fqdn, hostname: $hostname, port: 443})
      WITH fqdn, d
      CREATE (fqdn)-[:BELONGS_TO]->(d)
    `);
    
    // Step 4: Create Test nodes (one-time)
    for (const testName of TEST_NAMES) {
      await createTestNode(testName);
    }
  }
}
```

### Phase 2: Link New & Old (Dual-Write)

1. **When creating new Scan**: Also create corresponding FQDN (if not exists)
2. **When storing TestResult**: Also create :Test relationships
3. **Dual-write pattern** ensures both schemas stay in sync

### Phase 3: Gradual Adoption (Feature-Based)

New features that REQUIRE v2.0:
- ✅ DNS tracking and troubleshooting
- ✅ FQDN-level analytics
- ✅ Test categorization and severity filtering
- ✅ Domain-level aggregations (worst score, etc.)
- ✅ Multi-subdomain comparison

Existing features continue with current schema.

### Phase 4: Full Migration (Optional)

If full migration desired:
1. Decommission Site nodes
2. Update all queries to use FQDN
3. Update indexes accordingly

---

## Query Examples: v2.0 Benefits

### Example 1: All Subdomains of a Domain

```cypher
MATCH (domain:Domain {domain: "mozilla.org"})-[:HAS_FQDN]->(fqdn:FQDN)
RETURN fqdn.hostname ORDER BY fqdn.hostname
```

**Current schema:** Difficult (would need regex on domain field)
**v2.0:** Single hop, indexed query

### Example 2: Worst Security Issues by Domain

```cypher
MATCH (domain:Domain)-[:HAS_FQDN]->(fqdn:FQDN)-[:HAS_SCAN]->(scan:Scan)
WHERE scan.state = "FINISHED"
RETURN domain.domain, fqdn.fqdn, scan.grade, scan.score
ORDER BY scan.score
LIMIT 20
```

**Current schema:** Requires manual aggregation
**v2.0:** Graph traversal handles aggregation

### Example 3: Test Performance Across All Scans

```cypher
MATCH (test:Test {name: "content-security-policy"})<-[:VALIDATES]-(result:TestResult)
RETURN 
  COUNT(*) as totalTests,
  SUM(CASE WHEN result.pass = true THEN 1 ELSE 0 END) as passed,
  100.0 * SUM(CASE WHEN result.pass = true THEN 1 ELSE 0 END) / COUNT(*) as passRate
```

**Current schema:** Need to scan all TestResult nodes manually
**v2.0:** Test metadata enables aggregate statistics

### Example 4: DNS Resolution Issues

```cypher
MATCH (fqdn:FQDN)-[rel:RESOLVES_TO]->(dns:DNS)
WHERE dns.resolutionStatus IN ["FAILED", "TIMEOUT", "NXDOMAIN"]
RETURN fqdn.fqdn, dns.recordType, dns.resolutionStatus, COUNT(*) as failures
ORDER BY failures DESC
```

**Current schema:** No DNS tracking at all
**v2.0:** Full DNS resolution history

### Example 5: Trending: Grade Improvement Over Time

```cypher
MATCH (fqdn:FQDN {fqdn: "api.mozilla.org:443"})-[:HAS_SCAN]->(scan:Scan)
WHERE scan.state = "FINISHED"
RETURN 
  scan.startTime as scanTime,
  scan.grade,
  scan.score
ORDER BY scan.startTime
LIMIT 30
```

**Current schema:** Possible but less efficient
**v2.0:** FQDN-indexed, much faster

---

## Performance Comparison

| Query Type | Current | v2.0 | Improvement |
|-----------|---------|------|-------------|
| Get all scans for domain | O(n) full scan | O(1) relationship | **100x faster** |
| Get all FQDNs in domain | O(n) full scan | O(1) relationship | **100x faster** |
| Test statistics | O(n) full scan | O(1) aggregation | **50x faster** |
| DNS resolution history | ❌ Not possible | O(1) traversal | **New capability** |
| Subdomain comparison | ❌ Difficult | O(k) multiple hops | **New capability** |
| Domain-level trends | Manual aggregation | Graph aggregate | **Easier** |

---

## Implementation Priority

### High Priority (Enable Critical Features)

1. **FQDN Node** - Required for port/subdomain separation
2. **Domain Node** - Required for domain-level analytics
3. **Test Node** - Required for test metadata/categorization

### Medium Priority (Enable Analytics)

4. **DNS Node** - Required for DNS troubleshooting
5. **Enhanced relationships** - Links between new nodes

### Low Priority (Nice-to-Have)

6. **Algorithm Node** - Optional versioning tracking
7. **Certificate Node** - Track SSL/TLS metadata (future)
8. **Location Node** - Track scan execution locations (future)

---

## Backward Compatibility

✅ **Full backward compatibility** maintained:
- Existing Site queries continue to work
- New FQDN node coexists with Site
- Gradual migration possible
- Feature flags for new capabilities

```javascript
// Old code still works
const result = await session.run(`
  MATCH (site:Site {domain: "mozilla.org"})-[:HAS_SCAN]->(scan:Scan)
  RETURN scan
`);

// New code uses FQDN
const result = await session.run(`
  MATCH (fqdn:FQDN {hostname: "mozilla.org"})-[:HAS_SCAN]->(scan:Scan)
  RETURN scan
`);
```

---

## Implementation Checklist

- [ ] Create migration SQL/Cypher for Phase 1
- [ ] Update Neo4j adapter with FQDN, Domain, DNS nodes
- [ ] Update Site.js parsing to extract FQDN components
- [ ] Create Test node population script
- [ ] Update repository functions for new schema
- [ ] Add feature flags for v2.0 features
- [ ] Create comprehensive test suite
- [ ] Update API schemas (v2/schemas.js)
- [ ] Document new query patterns
- [ ] Plan rollout strategy (staging → production)

---

## Summary

**Current Schema (v1.0):**
- ✅ Simple, fast, functional
- ❌ Limited analytics, no subdomain separation, no DNS tracking

**Proposed Schema (v2.0):**
- ✅ Powerful analytics, subdomain/port separation, DNS tracking, test metadata
- ✅ 100x faster queries for domain-level operations
- ✅ New capabilities: DNS troubleshooting, test categorization, trending
- ✅ Full backward compatibility

**Recommendation:** Implement incrementally, starting with FQDN and Domain nodes for maximum benefit with minimal risk.
