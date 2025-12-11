# Neo4j Schema v2.0: Implementation Guide

## Quick Start: Implementing v2.0 Step-by-Step

### Phase 1: Schema Creation (1-2 hours)

#### Step 1: Update `src/database/adapters/neo4j.js` - Add v2 Initialization

```javascript
async initializeSchemaV2() {
  if (!this.session) {
    throw new Error("Neo4j session not initialized");
  }

  const queries = [
    // Domain constraints
    `CREATE CONSTRAINT IF NOT EXISTS FOR (d:Domain) REQUIRE d.domain IS UNIQUE`,
    
    // FQDN constraints
    `CREATE CONSTRAINT IF NOT EXISTS FOR (f:FQDN) REQUIRE f.fqdn IS UNIQUE`,
    
    // DNS constraints
    `CREATE CONSTRAINT IF NOT EXISTS FOR (dns:DNS) REQUIRE (dns.hostname, dns.recordType, dns.value) IS UNIQUE`,
    
    // Test constraints
    `CREATE CONSTRAINT IF NOT EXISTS FOR (t:Test) REQUIRE t.name IS UNIQUE`,
    
    // FQDN indexes
    `CREATE INDEX IF NOT EXISTS FOR (f:FQDN) ON (f.hostname)`,
    `CREATE INDEX IF NOT EXISTS FOR (f:FQDN) ON (f.port)`,
    `CREATE INDEX IF NOT EXISTS FOR (f:FQDN) ON (f.lastScanTime)`,
    `CREATE INDEX IF NOT EXISTS FOR (f:FQDN) ON (f.isActive)`,
    
    // Domain indexes
    `CREATE INDEX IF NOT EXISTS FOR (d:Domain) ON (d.creationTime)`,
    `CREATE INDEX IF NOT EXISTS FOR (d:Domain) ON (d.lastScanTime)`,
    `CREATE INDEX IF NOT EXISTS FOR (d:Domain) ON (d.aggregateGrade)`,
    
    // DNS indexes
    `CREATE INDEX IF NOT EXISTS FOR (dns:DNS) ON (dns.recordType)`,
    `CREATE INDEX IF NOT EXISTS FOR (dns:DNS) ON (dns.resolutionStatus)`,
    `CREATE INDEX IF NOT EXISTS FOR (dns:DNS) ON (dns.resolvedTime)`,
    
    // Test indexes
    `CREATE INDEX IF NOT EXISTS FOR (t:Test) ON (t.category)`,
    `CREATE INDEX IF NOT EXISTS FOR (t:Test) ON (t.severity)`,
    
    // TestResult indexes
    `CREATE INDEX IF NOT EXISTS FOR (tr:TestResult) ON (tr.severity)`,
  ];

  for (const query of queries) {
    try {
      await this.session.run(query);
      console.log(`✓ Created: ${query.substring(0, 50)}...`);
    } catch (error) {
      console.warn(`Schema init warning: ${error.message}`);
    }
  }
}
```

#### Step 2: Create Domain Nodes from Existing Sites

```javascript
async migrateExistingSitesToDomains() {
  const result = await this.session.run(`
    MATCH (s:Site)
    WITH DISTINCT s.domain as domain
    WITH domain, 
         split(domain, ':')[0] as rootDomain,
         timestamp() as creationTime
    CREATE (d:Domain {
      id: apoc.create.uuid(),
      domain: rootDomain,
      registrant: null,
      creationTime: creationTime,
      lastScanTime: creationTime,
      fqdnCount: 0,
      aggregateGrade: null,
      aggregateScore: null,
      dnsServers: null,
      metadata: '{}'
    })
    RETURN d.domain as domainCreated
  `);
  
  console.log(`Created ${result.records.length} Domain nodes`);
  return result.records.length;
}
```

#### Step 3: Create FQDN Nodes from Existing Sites

```javascript
async migrateExistingSitesToFQDNs() {
  const result = await this.session.run(`
    MATCH (s:Site)
    WITH s.domain as domain, s.creationTime as creationTime
    
    // Parse hostname and port from domain string
    WITH domain,
         CASE 
           WHEN domain CONTAINS ':' THEN split(domain, ':')[0]
           ELSE domain
         END as hostname,
         CASE 
           WHEN domain CONTAINS ':' THEN toInteger(split(domain, ':')[1])
           ELSE 443
         END as port,
         creationTime
    
    WITH DISTINCT hostname, port, creationTime, 
         hostname + ':' + toString(port) as fqdnKey
    
    // Find corresponding Domain
    MATCH (d:Domain {domain: hostname})
    
    // Create FQDN and link to Domain
    CREATE (f:FQDN {
      id: apoc.create.uuid(),
      fqdn: fqdnKey,
      hostname: hostname,
      port: port,
      protocol: CASE WHEN port IN [443, 8443] THEN 'https' ELSE 'http' END,
      path: null,
      creationTime: creationTime,
      lastScanTime: creationTime,
      isActive: true,
      metadata: '{}'
    })
    CREATE (f)-[:BELONGS_TO]->(d)
    RETURN f.fqdn as fqdnCreated
  `);
  
  console.log(`Created ${result.records.length} FQDN nodes`);
  return result.records.length;
}
```

#### Step 4: Migrate Scan & TestResult Relationships

```javascript
async linkScansToFQDNs() {
  const result = await this.session.run(`
    MATCH (s:Site)-[:HAS_SCAN]->(scan:Scan)
    
    WITH scan, s.domain as domain,
         CASE 
           WHEN domain CONTAINS ':' THEN split(domain, ':')[0]
           ELSE domain
         END as hostname,
         CASE 
           WHEN domain CONTAINS ':' THEN toInteger(split(domain, ':')[1])
           ELSE 443
         END as port
    
    WITH scan, hostname, port, 
         hostname + ':' + toString(port) as fqdnKey
    
    MATCH (f:FQDN {fqdn: fqdnKey})
    CREATE (f)-[:HAS_SCAN]->(scan)
    RETURN COUNT(*) as scansLinked
  `);
  
  const scansLinked = result.records[0].get('scansLinked');
  console.log(`Linked ${scansLinked} scans to FQDNs`);
  return scansLinked;
}
```

#### Step 5: Create Test Definition Nodes

```javascript
async createTestNodes() {
  const tests = [
    {
      name: "content-security-policy",
      displayName: "Content Security Policy",
      category: "headers",
      severity: "HIGH",
      description: "Validates CSP header implementation",
      documentation: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy"
    },
    {
      name: "strict-transport-security",
      displayName: "Strict Transport Security",
      category: "headers",
      severity: "HIGH",
      description: "Validates HSTS header implementation",
      documentation: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security"
    },
    {
      name: "x-frame-options",
      displayName: "X-Frame-Options",
      category: "headers",
      severity: "MEDIUM",
      description: "Validates X-Frame-Options header",
      documentation: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options"
    },
    // ... add remaining 7 tests
  ];

  for (const test of tests) {
    try {
      await this.session.run(
        `
        CREATE (t:Test {
          id: apoc.create.uuid(),
          name: $name,
          displayName: $displayName,
          category: $category,
          severity: $severity,
          description: $description,
          documentation: $documentation,
          defaultScoreModifier: -20,
          possibleResults: '[]',
          minAlgorithmVersion: 1,
          maxAlgorithmVersion: null,
          createdTime: timestamp(),
          updatedTime: timestamp(),
          metadata: '{}'
        })
        RETURN t.name
        `,
        {
          name: test.name,
          displayName: test.displayName,
          category: test.category,
          severity: test.severity,
          description: test.description,
          documentation: test.documentation
        }
      );
      console.log(`✓ Created Test: ${test.name}`);
    } catch (error) {
      if (!error.message.includes("already exists")) {
        throw error;
      }
    }
  }
}
```

#### Step 6: Link TestResults to Test Nodes

```javascript
async linkTestResultsToTests() {
  const result = await this.session.run(`
    MATCH (tr:TestResult)
    MATCH (t:Test {name: tr.name})
    CREATE (tr)-[:VALIDATES]->(t)
    RETURN COUNT(*) as linked
  `);
  
  const linked = result.records[0].get('linked');
  console.log(`Linked ${linked} test results to test nodes`);
  return linked;
}
```

### Phase 2: Utility Functions (1 hour)

#### Add to `src/database/adapters/neo4j.js`

```javascript
/**
 * Create or update DNS records for an FQDN
 */
async upsertDNSRecords(hostname, records) {
  for (const record of records) {
    await this.session.run(
      `
      MERGE (dns:DNS {
        hostname: $hostname,
        recordType: $recordType,
        value: $value
      })
      SET dns.ttl = $ttl,
          dns.resolvedTime = $resolvedTime,
          dns.resolutionStatus = $resolutionStatus,
          dns.resolver = $resolver,
          dns.metadata = $metadata
      RETURN dns
      `,
      {
        hostname,
        recordType: record.recordType,
        value: record.value,
        ttl: record.ttl || 3600,
        resolvedTime: Date.now(),
        resolutionStatus: "SUCCESS",
        resolver: record.resolver || "8.8.8.8",
        metadata: JSON.stringify(record.metadata || {})
      }
    );
  }
}

/**
 * Link DNS records to FQDN and Domain
 */
async linkDNSToFQDNAndDomain(hostname, domain) {
  // Link DNS to FQDN
  await this.session.run(
    `
    MATCH (f:FQDN {hostname: $hostname})
    MATCH (dns:DNS {hostname: $hostname})
    CREATE (f)-[:RESOLVES_TO]->(dns)
    `,
    { hostname }
  );

  // Link DNS to Domain
  await this.session.run(
    `
    MATCH (d:Domain {domain: $domain})
    MATCH (dns:DNS {hostname: $hostname})
    CREATE (d)-[:HAS_DNS]->(dns)
    `,
    { domain, hostname }
  );
}

/**
 * Update Domain aggregates
 */
async updateDomainAggregates(domain) {
  await this.session.run(
    `
    MATCH (d:Domain {domain: $domain})-[:HAS_FQDN]->(f:FQDN)-[:HAS_SCAN]->(scan:Scan)
    WHERE scan.state = 'FINISHED'
    WITH d, COUNT(DISTINCT f) as fqdnCount,
         MIN(scan.score) as minScore,
         MIN(scan.grade) as worstGrade,
         MAX(scan.startTime) as lastScan
    SET d.fqdnCount = fqdnCount,
        d.aggregateScore = minScore,
        d.aggregateGrade = worstGrade,
        d.lastScanTime = lastScan
    RETURN d
    `,
    { domain }
  );
}

/**
 * Update FQDN lastScanTime
 */
async updateFQDNLastScanTime(fqdn) {
  await this.session.run(
    `
    MATCH (f:FQDN {fqdn: $fqdn})-[:HAS_SCAN]->(scan:Scan)
    WHERE scan.state = 'FINISHED'
    WITH f, MAX(scan.startTime) as latest
    SET f.lastScanTime = latest
    RETURN f
    `,
    { fqdn }
  );
}
```

### Phase 3: Updated Repository Functions (1-2 hours)

#### Add to `src/database/repository.js`

```javascript
/**
 * Get all FQDNs for a domain
 */
export async function getFQDNsForDomain(session, domain) {
  const result = await session.run(
    `
    MATCH (d:Domain {domain: $domain})-[:HAS_FQDN]->(f:FQDN)
    RETURN f
    ORDER BY f.port, f.hostname
    `,
    { domain }
  );

  return result.records.map(r => r.get('f').properties);
}

/**
 * Get domain-level scan summary
 */
export async function getDomainScanSummary(session, domain) {
  const result = await session.run(
    `
    MATCH (d:Domain {domain: $domain})-[:HAS_FQDN]->(f:FQDN)-[:HAS_SCAN]->(scan:Scan)
    WHERE scan.state = 'FINISHED'
    RETURN {
      domain: d.domain,
      fqdnCount: COUNT(DISTINCT f),
      totalScans: COUNT(scan),
      latestGrade: d.aggregateGrade,
      latestScore: d.aggregateScore,
      fqdnGrades: collect(DISTINCT {fqdn: f.fqdn, grade: scan.grade})
    } as summary
    `,
    { domain }
  );

  return result.records[0]?.get('summary') || null;
}

/**
 * Get FQDN trend (last 30 scans)
 */
export async function getFQDNTrend(session, fqdn) {
  const result = await session.run(
    `
    MATCH (f:FQDN {fqdn: $fqdn})-[:HAS_SCAN]->(scan:Scan)
    WHERE scan.state = 'FINISHED'
    RETURN scan
    ORDER BY scan.startTime DESC
    LIMIT 30
    `,
    { fqdn }
  );

  return result.records.map(r => {
    const scan = r.get('scan').properties;
    return {
      id: scan.id,
      startTime: scan.startTime,
      grade: scan.grade,
      score: scan.score,
      testsPassed: scan.testsPassed,
      testsFailed: scan.testsFailed
    };
  });
}

/**
 * Get test statistics by category
 */
export async function getTestStatsByCategory(session, category) {
  const result = await session.run(
    `
    MATCH (test:Test {category: $category})<-[:VALIDATES]-(result:TestResult)
    RETURN {
      testName: test.name,
      displayName: test.displayName,
      severity: test.severity,
      totalTests: COUNT(result),
      passedTests: SUM(CASE WHEN result.pass THEN 1 ELSE 0 END),
      passRate: 100.0 * SUM(CASE WHEN result.pass THEN 1 ELSE 0 END) / COUNT(result)
    } as stats
    ORDER BY stats.severity DESC
    `,
    { category }
  );

  return result.records.map(r => r.get('stats'));
}

/**
 * Get DNS resolution issues
 */
export async function getDNSIssues(session, hostname) {
  const result = await session.run(
    `
    MATCH (fqdn:FQDN {hostname: $hostname})-[:RESOLVES_TO]->(dns:DNS)
    WHERE dns.resolutionStatus IN ['FAILED', 'TIMEOUT', 'NXDOMAIN']
    RETURN {
      hostname: dns.hostname,
      recordType: dns.recordType,
      status: dns.resolutionStatus,
      lastAttempt: dns.resolvedTime,
      failures: COUNT(*)
    } as issue
    ORDER BY issue.failures DESC
    `,
    { hostname }
  );

  return result.records.map(r => r.get('issue'));
}
```

### Phase 4: API Endpoints for v2.0 Features (2-3 hours)

#### Add to `src/api/v2/domain/index.js` (New File)

```javascript
import fp from "fastify-plugin";
import { createDatabaseAdapterInstance } from "../../../database/repository.js";

export default fp(async function (fastify, opts) {
  // GET /api/v2/domain/:domain/summary
  fastify.get("/domain/:domain/summary", async (request, reply) => {
    const { domain } = request.params;
    const db = await createDatabaseAdapterInstance();
    const pool = db.driver;

    try {
      const result = await pool.session().run(
        `
        MATCH (d:Domain {domain: $domain})
        OPTIONAL MATCH (d)-[:HAS_FQDN]->(f:FQDN)-[:HAS_SCAN]->(scan:Scan)
        WHERE scan.state = 'FINISHED'
        RETURN {
          domain: d.domain,
          fqdnCount: d.fqdnCount,
          aggregateGrade: d.aggregateGrade,
          aggregateScore: d.aggregateScore,
          lastScanTime: d.lastScanTime,
          fqdnDetails: collect(DISTINCT {
            fqdn: f.fqdn,
            port: f.port,
            lastScan: f.lastScanTime
          })
        } as summary
        `,
        { domain }
      );

      const summary = result.records[0]?.get('summary');
      if (!summary) {
        return reply.status(404).send({ error: "Domain not found" });
      }

      return reply.send({ domain: summary });
    } catch (error) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // GET /api/v2/fqdn/:fqdn/trend
  fastify.get("/fqdn/:fqdn/trend", async (request, reply) => {
    const { fqdn } = request.params;
    const db = await createDatabaseAdapterInstance();
    const pool = db.driver;

    try {
      const result = await pool.session().run(
        `
        MATCH (f:FQDN {fqdn: $fqdn})-[:HAS_SCAN]->(scan:Scan)
        WHERE scan.state = 'FINISHED'
        RETURN scan
        ORDER BY scan.startTime DESC
        LIMIT 30
        `,
        { fqdn }
      );

      const scans = result.records.map(r => {
        const scan = r.get('scan').properties;
        return {
          startTime: scan.startTime,
          grade: scan.grade,
          score: scan.score,
          testsPassed: scan.testsPassed,
          testsFailed: scan.testsFailed
        };
      });

      return reply.send({ fqdn, trend: scans });
    } catch (error) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // GET /api/v2/test/:testName/stats
  fastify.get("/test/:testName/stats", async (request, reply) => {
    const { testName } = request.params;
    const db = await createDatabaseAdapterInstance();
    const pool = db.driver;

    try {
      const result = await pool.session().run(
        `
        MATCH (test:Test {name: $testName})<-[:VALIDATES]-(result:TestResult)
        RETURN {
          name: test.name,
          displayName: test.displayName,
          severity: test.severity,
          category: test.category,
          totalTests: COUNT(result),
          passedTests: SUM(CASE WHEN result.pass THEN 1 ELSE 0 END),
          passRate: 100.0 * SUM(CASE WHEN result.pass THEN 1 ELSE 0 END) / COUNT(result)
        } as stats
        `,
        { testName }
      );

      const stats = result.records[0]?.get('stats');
      if (!stats) {
        return reply.status(404).send({ error: "Test not found" });
      }

      return reply.send(stats);
    } catch (error) {
      return reply.status(500).send({ error: error.message });
    }
  });
});
```

### Phase 5: Testing & Validation (1-2 hours)

#### Add test file: `test/v2-schema.test.js`

```javascript
import { describe, it } from "mocha";
import chai from "chai";
const { expect } = chai;
import { createDatabaseAdapter } from "../src/database/adapter.js";
import { CONFIG } from "../src/config.js";

describe("Neo4j Schema v2.0", function () {
  let db;

  before(async function () {
    db = await createDatabaseAdapter(CONFIG);
    db.createPool();
    await db.initializeSchemaV2();
  });

  after(async function () {
    await db.close();
  });

  describe("Domain Nodes", function () {
    it("should create domain node", async function () {
      const result = await db.session.run(`
        CREATE (d:Domain {
          id: randomUuid(),
          domain: "test-example.com",
          aggregateGrade: "A",
          aggregateScore: 100
        })
        RETURN d
      `);
      expect(result.records).to.have.lengthOf(1);
    });
  });

  describe("FQDN Nodes", function () {
    it("should enforce FQDN uniqueness", async function () {
      try {
        await db.session.run(`
          CREATE (f:FQDN {
            fqdn: "test-api.example.com:443",
            hostname: "test-api.example.com",
            port: 443,
            protocol: "https"
          })
        `);
        
        // Try to create duplicate
        await db.session.run(`
          CREATE (f:FQDN {
            fqdn: "test-api.example.com:443",
            hostname: "test-api.example.com",
            port: 443,
            protocol: "https"
          })
        `);
        
        expect.fail("Should have thrown uniqueness error");
      } catch (error) {
        expect(error.message).to.include("unique");
      }
    });
  });

  describe("Test Nodes", function () {
    it("should link test results to test definitions", async function () {
      const result = await db.session.run(`
        MATCH (t:Test)<-[:VALIDATES]-(tr:TestResult)
        RETURN COUNT(*) as count
      `);
      
      const count = result.records[0].get('count');
      expect(count.toNumber()).to.be.greaterThan(0);
    });
  });

  describe("Query Performance", function () {
    it("should query domain FQDNs efficiently", async function () {
      const start = Date.now();
      
      const result = await db.session.run(`
        MATCH (d:Domain)-[:HAS_FQDN]->(f:FQDN)
        RETURN COUNT(f) as count
      `);
      
      const elapsed = Date.now() - start;
      expect(elapsed).to.be.below(1000); // Should complete in <1s
      expect(result.records).to.have.lengthOf(1);
    });
  });
});
```

---

## Execution Plan

**Week 1:**
- [ ] Day 1-2: Phase 1 (Schema creation)
- [ ] Day 3: Phase 2 (Utility functions)
- [ ] Day 4-5: Phase 3-4 (Repository & API)

**Week 2:**
- [ ] Day 1-2: Phase 5 (Testing)
- [ ] Day 3-5: Bug fixes, documentation

**Week 3:**
- [ ] Staging deployment & validation
- [ ] Production rollout

---

## Rollout Checklist

- [ ] All code reviewed and tested
- [ ] Performance benchmarks acceptable
- [ ] Migration scripts verified
- [ ] Backup created
- [ ] Feature flags enabled for v2.0
- [ ] Documentation updated
- [ ] Team trained
- [ ] Monitoring alerts configured
- [ ] Rollback plan documented

---

## References

- `docs/NEO4J_SCHEMA_IMPROVEMENTS.md` - Design details
- `docs/NEO4J_SCHEMA_V2_VISUAL.md` - Visual comparisons
- `src/database/adapters/neo4j.js` - Adapter code
- `src/database/repository.js` - Repository functions
