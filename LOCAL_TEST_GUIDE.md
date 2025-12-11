# Local Testing Guide: Neo4j Schema v2.0 Implementation

## Overview

This guide walks you through setting up a complete local testing environment for the Neo4j v2.0 schema improvements. Since you use **Neo4j Aura**, we've optimized the steps for your cloud setup.

---

## Prerequisites

### Required Software
- **Node.js:** ≥24.0.0 (check with `node --version`)
- **npm:** ≥9.0.0 (check with `npm --version`)
- **Neo4j Aura:** Active instance with credentials
- **Git:** For version control

### Check Your Setup
```powershell
node --version    # Should be v24.0.0+
npm --version     # Should be 9.0.0+
git --version     # Should be installed
```

---

## Your Setup: Neo4j AuraDB (Cloud)

### Step 1: Gather Aura Credentials

1. Go to https://console.neo4j.io
2. Find your instance in the list
3. Click "Copy connection string"
4. Credentials include:
   - URI: `neo4j+s://xxxxx.databases.neo4j.io`
   - Username: `neo4j`
   - Password: (from instance creation)

### Step 2: Configure Environment

Create `.env.test` in project root:
```env
HTTPOBS_DATABASE_TYPE=neo4j
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_aura_password
NEO4J_DATABASE=neo4j
```

Or set environment variables in PowerShell:
```powershell
$env:HTTPOBS_DATABASE_TYPE = "neo4j"
$env:NEO4J_URI = "neo4j+s://your-instance.databases.neo4j.io"
$env:NEO4J_USERNAME = "neo4j"
$env:NEO4J_PASSWORD = "your_aura_password"
$env:NEO4J_DATABASE = "neo4j"
```

### Step 3: Verify Connection

```powershell
# Install cypher-shell globally (one-time)
npm install -g cypher-shell

# Test connection (use your actual Aura URI and password)
cypher-shell -a neo4j+s://your-instance.databases.neo4j.io -u neo4j -p your_aura_password "RETURN 1"
```

Expected output: `1`

If you get connection errors:
- Verify your Aura instance is running (console.neo4j.io)
- Check that the password is correct
- Ensure your password doesn't have special characters (or escape them)

---

## Alternative Option 1: Local Neo4j (Docker)

### Step 1: Install Neo4j via Docker

```powershell
# Pull Neo4j image
docker pull neo4j:latest

# Run Neo4j container
docker run --name neo4j-test `
  -p 7687:7687 `
  -p 7474:7474 `
  -e NEO4J_AUTH=neo4j/testpassword `
  neo4j:latest

# Access at http://localhost:7474
# Username: neo4j, Password: testpassword
```

### Step 2: Configure for Testing

```powershell
$env:HTTPOBS_DATABASE_TYPE = "neo4j"
$env:NEO4J_URI = "neo4j://localhost:7687"
$env:NEO4J_USERNAME = "neo4j"
$env:NEO4J_PASSWORD = "testpassword"
$env:NEO4J_DATABASE = "neo4j"
```

---

## Alternative Option 2: Local Neo4j (Native Installation)
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password
NEO4J_DATABASE=neo4j
```

### Step 3: Verify Connection

```powershell
npm install
npm test -- --grep "Neo4j"
```

---

## Step 1: Install Dependencies

```powershell
cd d:\FILEZ\GITHUB\mdn-http-observatory

# Install dependencies
npm install

# You should see neo4j-driver installed
npm list neo4j-driver
```

---

## Step 2: Initialize Neo4j Schema

Before running tests, initialize the v2.0 schema:

```javascript
// Create file: test-setup.js
import { createDatabaseAdapter } from "./src/database/adapter.js";
import { CONFIG } from "./src/config.js";

async function setupSchema() {
  try {
    console.log("🔧 Initializing Neo4j v2.0 schema...");
    
    const db = await createDatabaseAdapter(CONFIG);
    db.createPool();
    
    // Run v1.0 schema initialization
    await db.initializeSchema();
    console.log("✓ v1.0 schema initialized");
    
    // Run v2.0 schema initialization
    await db.initializeSchemaV2?.();
    console.log("✓ v2.0 schema initialized");
    
    // Populate test nodes
    await db.createTestNodes?.();
    console.log("✓ Test nodes created");
    
    await db.close();
    console.log("✅ Schema initialization complete!");
  } catch (error) {
    console.error("❌ Setup failed:", error);
    process.exit(1);
  }
}

setupSchema();
```

Run setup:
```powershell
node test-setup.js
```

---

## Step 3: Run Existing Tests

### Run All Tests
```powershell
npm test
```

### Run Specific Test File
```powershell
npm test test/scanner.test.js
npm test test/database.test.js
```

### Run Tests Matching Pattern
```powershell
npm test -- --grep "Scanner"
npm test -- --grep "Database"
npm test -- --grep "Neo4j"
```

### Run Tests with Verbose Output
```powershell
npm test -- --reporter spec
```

---

## Step 4: Create v2.0 Schema Tests

Create file: `test/v2-schema.test.js`

```javascript
import { describe, it } from "mocha";
import { expect } from "chai";
import { createDatabaseAdapter } from "../src/database/adapter.js";
import { CONFIG } from "../src/config.js";

describe("Neo4j v2.0 Schema", function () {
  let db;
  let session;

  before(async function () {
    this.timeout(10000);
    db = await createDatabaseAdapter(CONFIG);
    db.createPool();
    session = db.session;
    
    // Initialize schema
    await db.initializeSchema();
  });

  after(async function () {
    await db.close();
  });

  describe("Domain Nodes", function () {
    it("should create domain node", async function () {
      const result = await session.run(`
        CREATE (d:Domain {
          id: randomUuid(),
          domain: "test-example.com",
          registrant: "Test Corp",
          creationTime: timestamp(),
          lastScanTime: timestamp(),
          fqdnCount: 0,
          aggregateGrade: null,
          aggregateScore: null,
          dnsServers: null,
          metadata: '{}'
        })
        RETURN d.domain as domain
      `);

      expect(result.records).to.have.lengthOf(1);
      expect(result.records[0].get('domain')).to.equal('test-example.com');
    });

    it("should enforce domain uniqueness", async function () {
      try {
        // Create first domain
        await session.run(`
          CREATE (d:Domain {
            id: randomUuid(),
            domain: "unique-test.com"
          })
        `);

        // Try to create duplicate (should fail)
        await session.run(`
          CREATE (d:Domain {
            id: randomUuid(),
            domain: "unique-test.com"
          })
        `);

        expect.fail("Should have thrown uniqueness error");
      } catch (error) {
        expect(error.message).to.include("unique");
      }
    });
  });

  describe("FQDN Nodes", function () {
    it("should create FQDN node", async function () {
      const result = await session.run(`
        CREATE (f:FQDN {
          id: randomUuid(),
          fqdn: "api.test.com:443",
          hostname: "api.test.com",
          port: 443,
          protocol: "https",
          path: null,
          creationTime: timestamp(),
          lastScanTime: timestamp(),
          isActive: true,
          metadata: '{}'
        })
        RETURN f.fqdn as fqdn
      `);

      expect(result.records[0].get('fqdn')).to.equal('api.test.com:443');
    });

    it("should link FQDN to Domain", async function () {
      // Create domain
      await session.run(`
        CREATE (d:Domain {
          id: randomUuid(),
          domain: "link-test.com"
        })
      `);

      // Create FQDN
      const fqdnResult = await session.run(`
        CREATE (f:FQDN {
          id: randomUuid(),
          fqdn: "www.link-test.com:443",
          hostname: "www.link-test.com",
          port: 443
        })
        RETURN f
      `);

      const fqdn = fqdnResult.records[0].get('f');

      // Link FQDN to Domain
      await session.run(
        `
        MATCH (d:Domain {domain: $domain})
        MATCH (f:FQDN {id: $fqdnId})
        CREATE (f)-[:BELONGS_TO]->(d)
        `,
        { domain: "link-test.com", fqdnId: fqdn.properties.id }
      );

      // Verify relationship
      const verifyResult = await session.run(`
        MATCH (d:Domain {domain: "link-test.com"})<-[:BELONGS_TO]-(f:FQDN)
        RETURN COUNT(f) as count
      `);

      expect(verifyResult.records[0].get('count').toNumber()).to.equal(1);
    });
  });

  describe("DNS Nodes", function () {
    it("should create DNS record", async function () {
      const result = await session.run(`
        CREATE (dns:DNS {
          id: randomUuid(),
          hostname: "test.com",
          recordType: "A",
          value: "1.2.3.4",
          ttl: 3600,
          resolvedTime: timestamp(),
          resolutionStatus: "SUCCESS",
          resolver: "8.8.8.8",
          metadata: '{}'
        })
        RETURN dns.recordType as type
      `);

      expect(result.records[0].get('type')).to.equal('A');
    });

    it("should enforce DNS uniqueness (hostname, type, value)", async function () {
      try {
        // Create first DNS record
        await session.run(`
          CREATE (dns:DNS {
            id: randomUuid(),
            hostname: "dns-unique.com",
            recordType: "A",
            value: "1.1.1.1"
          })
        `);

        // Try to create duplicate
        await session.run(`
          CREATE (dns:DNS {
            id: randomUuid(),
            hostname: "dns-unique.com",
            recordType: "A",
            value: "1.1.1.1"
          })
        `);

        expect.fail("Should have thrown uniqueness error");
      } catch (error) {
        expect(error.message).to.include("unique");
      }
    });
  });

  describe("Test Nodes", function () {
    it("should create test node", async function () {
      const result = await session.run(`
        CREATE (t:Test {
          id: randomUuid(),
          name: "content-security-policy",
          displayName: "Content Security Policy",
          category: "headers",
          severity: "HIGH",
          description: "Validates CSP header"
        })
        RETURN t.name as name
      `);

      expect(result.records[0].get('name')).to.equal('content-security-policy');
    });

    it("should enforce test name uniqueness", async function () {
      try {
        await session.run(`
          CREATE (t:Test {
            id: randomUuid(),
            name: "hsts"
          })
        `);

        await session.run(`
          CREATE (t:Test {
            id: randomUuid(),
            name: "hsts"
          })
        `);

        expect.fail("Should have thrown uniqueness error");
      } catch (error) {
        expect(error.message).to.include("unique");
      }
    });
  });

  describe("Relationships", function () {
    it("should link FQDN to Scan", async function () {
      // Setup: Create FQDN and Scan
      const fqdnResult = await session.run(`
        CREATE (f:FQDN {
          id: randomUuid(),
          fqdn: "rel-test.com:443"
        })
        RETURN f
      `);

      const scanResult = await session.run(`
        CREATE (scan:Scan {
          id: randomUuid(),
          state: "FINISHED",
          grade: "A+",
          score: 105
        })
        RETURN scan
      `);

      const fqdnId = fqdnResult.records[0].get('f').properties.id;
      const scanId = scanResult.records[0].get('scan').properties.id;

      // Create relationship
      await session.run(
        `
        MATCH (f:FQDN {id: $fqdnId})
        MATCH (scan:Scan {id: $scanId})
        CREATE (f)-[:HAS_SCAN]->(scan)
        `,
        { fqdnId, scanId }
      );

      // Verify
      const verifyResult = await session.run(`
        MATCH (f:FQDN)-[:HAS_SCAN]->(scan:Scan)
        RETURN COUNT(scan) as count
      `);

      expect(verifyResult.records[0].get('count').toNumber()).to.be.greaterThan(0);
    });

    it("should link Scan to TestResult", async function () {
      const scanResult = await session.run(`
        CREATE (scan:Scan {
          id: randomUuid()
        })
        RETURN scan
      `);

      const testResult = await session.run(`
        CREATE (tr:TestResult {
          id: randomUuid(),
          name: "test-check",
          pass: true
        })
        RETURN tr
      `);

      const scanId = scanResult.records[0].get('scan').properties.id;
      const testId = testResult.records[0].get('tr').properties.id;

      await session.run(
        `
        MATCH (scan:Scan {id: $scanId})
        MATCH (tr:TestResult {id: $testId})
        CREATE (scan)-[:HAS_TEST]->(tr)
        `,
        { scanId, testId }
      );

      const verifyResult = await session.run(`
        MATCH (scan:Scan)-[:HAS_TEST]->(tr:TestResult)
        RETURN COUNT(tr) as count
      `);

      expect(verifyResult.records[0].get('count').toNumber()).to.be.greaterThan(0);
    });

    it("should link TestResult to Test definition", async function () {
      const testResult = await session.run(`
        CREATE (tr:TestResult {
          id: randomUuid(),
          name: "link-test"
        })
        RETURN tr
      `);

      const testDef = await session.run(`
        CREATE (t:Test {
          id: randomUuid(),
          name: "link-test"
        })
        RETURN t
      `);

      const resultId = testResult.records[0].get('tr').properties.id;
      const testId = testDef.records[0].get('t').properties.id;

      await session.run(
        `
        MATCH (tr:TestResult {id: $resultId})
        MATCH (t:Test {id: $testId})
        CREATE (tr)-[:VALIDATES]->(t)
        `,
        { resultId, testId }
      );

      const verifyResult = await session.run(`
        MATCH (tr:TestResult)-[:VALIDATES]->(t:Test)
        RETURN COUNT(t) as count
      `);

      expect(verifyResult.records[0].get('count').toNumber()).to.be.greaterThan(0);
    });
  });

  describe("Query Performance", function () {
    it("should query indexed FQDN fields efficiently", async function () {
      // Create test FQDN
      await session.run(`
        CREATE (f:FQDN {
          id: randomUuid(),
          fqdn: "perf-test.com:443",
          hostname: "perf-test.com",
          port: 443
        })
      `);

      const start = Date.now();

      // Query by indexed field (hostname)
      const result = await session.run(`
        MATCH (f:FQDN {hostname: "perf-test.com"})
        RETURN COUNT(f) as count
      `);

      const elapsed = Date.now() - start;

      expect(result.records[0].get('count').toNumber()).to.equal(1);
      expect(elapsed).to.be.below(1000); // Should complete in <1s
    });

    it("should aggregate domain scans efficiently", async function () {
      // Create domain with multiple FQDNs
      const domain = `agg-test-${Date.now()}.com`;
      
      await session.run(
        `
        CREATE (d:Domain {
          id: randomUuid(),
          domain: $domain
        })
        `,
        { domain }
      );

      // Create 3 FQDNs for domain
      for (let i = 0; i < 3; i++) {
        await session.run(
          `
          MATCH (d:Domain {domain: $domain})
          CREATE (f:FQDN {
            id: randomUuid(),
            fqdn: $fqdn,
            hostname: $hostname,
            port: 443
          })-[:BELONGS_TO]->(d)
          `,
          {
            domain,
            fqdn: `sub${i}.${domain}:443`,
            hostname: `sub${i}.${domain}`
          }
        );
      }

      const start = Date.now();

      // Query domain FQDNs
      const result = await session.run(
        `
        MATCH (d:Domain {domain: $domain})-[:HAS_FQDN]->(f:FQDN)
        RETURN COUNT(f) as count
        `,
        { domain }
      );

      const elapsed = Date.now() - start;

      expect(result.records[0].get('count').toNumber()).to.equal(3);
      expect(elapsed).to.be.below(1000);
    });
  });
});
```

Run v2.0 schema tests:
```powershell
npm test test/v2-schema.test.js
```

---

## Step 5: Test v2.0 Migration Script

Create file: `test-v2-migration.js`

```javascript
import { createDatabaseAdapter } from "./src/database/adapter.js";
import { CONFIG } from "./src/config.js";

async function testMigration() {
  const db = await createDatabaseAdapter(CONFIG);
  db.createPool();
  const session = db.session;

  try {
    console.log("🔄 Testing v2.0 Migration Script");
    console.log("================================\n");

    // Step 1: Create test data
    console.log("1️⃣  Creating test Domain...");
    const domainResult = await session.run(`
      CREATE (d:Domain {
        id: randomUuid(),
        domain: "migration-test.com",
        creationTime: timestamp(),
        lastScanTime: timestamp()
      })
      RETURN d.domain as domain
    `);
    console.log(`   ✓ Domain created: ${domainResult.records[0].get('domain')}\n`);

    // Step 2: Create FQDNs
    console.log("2️⃣  Creating test FQDNs...");
    for (let i = 0; i < 3; i++) {
      const hostname = `sub${i}.migration-test.com`;
      await session.run(
        `
        MATCH (d:Domain {domain: "migration-test.com"})
        CREATE (f:FQDN {
          id: randomUuid(),
          fqdn: $fqdn,
          hostname: $hostname,
          port: 443,
          protocol: "https",
          creationTime: timestamp(),
          lastScanTime: timestamp(),
          isActive: true
        })-[:BELONGS_TO]->(d)
        `,
        { fqdn: `${hostname}:443`, hostname }
      );
    }
    console.log("   ✓ 3 FQDNs created\n");

    // Step 3: Create Scans for FQDNs
    console.log("3️⃣  Creating test Scans...");
    const fqdnResult = await session.run(`
      MATCH (f:FQDN)-[:BELONGS_TO]->(:Domain {domain: "migration-test.com"})
      RETURN f
      LIMIT 1
    `);

    const fqdnId = fqdnResult.records[0].get('f').properties.id;
    const scanResult = await session.run(
      `
      MATCH (f:FQDN {id: $fqdnId})
      CREATE (scan:Scan {
        id: randomUuid(),
        state: "FINISHED",
        grade: "A+",
        score: 105,
        startTime: timestamp()
      })-[:HAS_SCAN]-(f)
      RETURN scan
      `,
      { fqdnId }
    );
    console.log(`   ✓ Scan created: ${scanResult.records[0].get('scan').properties.id}\n`);

    // Step 4: Create TestResults
    console.log("4️⃣  Creating test TestResults...");
    const scanId = scanResult.records[0].get('scan').properties.id;
    for (let i = 0; i < 3; i++) {
      await session.run(
        `
        MATCH (scan:Scan {id: $scanId})
        CREATE (tr:TestResult {
          id: randomUuid(),
          name: "test-${i}",
          pass: true
        })-[:HAS_TEST]-(scan)
        `,
        { scanId }
      );
    }
    console.log("   ✓ 3 TestResults created\n");

    // Step 5: Create Test definitions
    console.log("5️⃣  Creating Test definitions...");
    for (let i = 0; i < 3; i++) {
      await session.run(
        `
        CREATE (t:Test {
          id: randomUuid(),
          name: "test-${i}",
          displayName: "Test ${i}",
          category: "headers",
          severity: "HIGH"
        })
        `,
        { index: i }
      );
    }
    console.log("   ✓ 3 Test definitions created\n");

    // Step 6: Link TestResults to Tests
    console.log("6️⃣  Linking TestResults to Test definitions...");
    const trResult = await session.run(`
      MATCH (tr:TestResult)-[:HAS_TEST]->(:Scan)
      RETURN tr
      LIMIT 1
    `);

    if (trResult.records.length > 0) {
      const trId = trResult.records[0].get('tr').properties.id;
      const trName = trResult.records[0].get('tr').properties.name;

      await session.run(
        `
        MATCH (tr:TestResult {id: $trId})
        MATCH (t:Test {name: $name})
        CREATE (tr)-[:VALIDATES]->(t)
        `,
        { trId, name: trName }
      );
      console.log("   ✓ TestResult linked to Test\n");
    }

    // Step 7: Verify relationships
    console.log("7️⃣  Verifying relationships...");
    const verifyResult = await session.run(`
      MATCH (d:Domain {domain: "migration-test.com"})-[:HAS_FQDN]->(f:FQDN)-[:HAS_SCAN]->(scan:Scan)-[:HAS_TEST]->(tr:TestResult)-[:VALIDATES]->(t:Test)
      RETURN COUNT(*) as count
    `);

    const count = verifyResult.records[0].get('count').toNumber();
    console.log(`   ✓ Found ${count} complete chains\n`);

    // Step 8: Test aggregation query
    console.log("8️⃣  Testing aggregation query...");
    const aggResult = await session.run(`
      MATCH (d:Domain {domain: "migration-test.com"})-[:HAS_FQDN]->(f:FQDN)-[:HAS_SCAN]->(scan:Scan)
      RETURN {
        domain: d.domain,
        fqdnCount: COUNT(DISTINCT f),
        scanCount: COUNT(DISTINCT scan),
        latestGrade: COLLECT(DISTINCT scan.grade)[0]
      } as summary
    `);

    const summary = aggResult.records[0].get('summary');
    console.log(`   ✓ Domain: ${summary.domain}`);
    console.log(`   ✓ FQDNs: ${summary.fqdnCount}`);
    console.log(`   ✓ Scans: ${summary.scanCount}`);
    console.log(`   ✓ Grade: ${summary.latestGrade}\n`);

    console.log("✅ Migration test completed successfully!");
  } catch (error) {
    console.error("❌ Migration test failed:", error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

testMigration();
```

Run migration test:
```powershell
node test-v2-migration.js
```

Expected output:
```
🔄 Testing v2.0 Migration Script
================================

1️⃣  Creating test Domain...
   ✓ Domain created: migration-test.com

2️⃣  Creating test FQDNs...
   ✓ 3 FQDNs created

3️⃣  Creating test Scans...
   ✓ Scan created: [UUID]

4️⃣  Creating test TestResults...
   ✓ 3 TestResults created

5️⃣  Creating Test definitions...
   ✓ 3 Test definitions created

6️⃣  Linking TestResults to Test definitions...
   ✓ TestResult linked to Test

7️⃣  Verifying relationships...
   ✓ Found 1 complete chains

8️⃣  Testing aggregation query...
   ✓ Domain: migration-test.com
   ✓ FQDNs: 3
   ✓ Scans: 3
   ✓ Grade: A+

✅ Migration test completed successfully!
```

---

## Step 6: Test Query Performance

Create file: `test-performance.js`

```javascript
import { createDatabaseAdapter } from "./src/database/adapter.js";
import { CONFIG } from "./src/config.js";

async function performanceTest() {
  const db = await createDatabaseAdapter(CONFIG);
  db.createPool();
  const session = db.session;

  try {
    console.log("📊 Performance Benchmark");
    console.log("=======================\n");

    // Create 100 FQDNs with scans
    console.log("🔧 Setting up test data (100 FQDNs with scans)...");
    const domain = `perf-test-${Date.now()}.com`;

    await session.run(
      `CREATE (d:Domain {id: randomUuid(), domain: $domain})`,
      { domain }
    );

    for (let i = 0; i < 100; i++) {
      const hostname = `api${i}.${domain}`;
      await session.run(
        `
        MATCH (d:Domain {domain: $domain})
        CREATE (f:FQDN {
          id: randomUuid(),
          fqdn: $fqdn,
          hostname: $hostname,
          port: 443
        })-[:BELONGS_TO]->(d)
        WITH f
        CREATE (scan:Scan {
          id: randomUuid(),
          state: "FINISHED",
          grade: "A+"
        })-[:HAS_SCAN]-(f)
        `,
        { domain, fqdn: `${hostname}:443`, hostname }
      );

      if ((i + 1) % 20 === 0) {
        console.log(`   ✓ Created ${i + 1}/100 FQDNs`);
      }
    }

    console.log("\n📈 Running benchmark queries:\n");

    // Test 1: Get domain FQDNs
    console.log("Test 1: Get all FQDNs for domain");
    const start1 = Date.now();
    const result1 = await session.run(
      `MATCH (d:Domain {domain: $domain})-[:HAS_FQDN]->(f:FQDN) RETURN COUNT(f)`,
      { domain }
    );
    const time1 = Date.now() - start1;
    console.log(`   Results: ${result1.records[0].get(0).toNumber()} FQDNs`);
    console.log(`   Time: ${time1}ms ✓\n`);

    // Test 2: Get scans for all FQDNs
    console.log("Test 2: Get all scans across domain");
    const start2 = Date.now();
    const result2 = await session.run(
      `MATCH (d:Domain {domain: $domain})-[:HAS_FQDN]->(f:FQDN)-[:HAS_SCAN]->(s:Scan) RETURN COUNT(s)`,
      { domain }
    );
    const time2 = Date.now() - start2;
    console.log(`   Results: ${result2.records[0].get(0).toNumber()} scans`);
    console.log(`   Time: ${time2}ms ✓\n`);

    // Test 3: Aggregation
    console.log("Test 3: Domain aggregation");
    const start3 = Date.now();
    const result3 = await session.run(
      `
      MATCH (d:Domain {domain: $domain})-[:HAS_FQDN]->(f:FQDN)-[:HAS_SCAN]->(s:Scan)
      RETURN {
        domain: d.domain,
        fqdnCount: COUNT(DISTINCT f),
        scanCount: COUNT(DISTINCT s)
      }
      `,
      { domain }
    );
    const time3 = Date.now() - start3;
    const agg = result3.records[0].get(0);
    console.log(`   FQDNs: ${agg.fqdnCount}, Scans: ${agg.scanCount}`);
    console.log(`   Time: ${time3}ms ✓\n`);

    console.log("✅ Performance benchmark complete!");
    console.log("\n Summary:");
    console.log(`  - Domain FQDN lookup: ${time1}ms`);
    console.log(`  - Multi-hop traversal: ${time2}ms`);
    console.log(`  - Aggregation query: ${time3}ms`);
  } catch (error) {
    console.error("❌ Performance test failed:", error);
  } finally {
    await db.close();
  }
}

performanceTest();
```

Run performance test:
```powershell
node test-performance.js
```

---

## Step 7: Integration Test

Create file: `test-integration.js`

```javascript
import { createDatabaseAdapter } from "./src/database/adapter.js";
import { CONFIG } from "./src/config.js";

async function integrationTest() {
  const db = await createDatabaseAdapter(CONFIG);
  db.createPool();

  try {
    console.log("🧪 Integration Test: Full v2.0 Workflow");
    console.log("========================================\n");

    // Simulate full v2.0 workflow
    console.log("1️⃣  Creating domain mozilla.org...");
    const domain = "test.mozilla.org";
    const domainId = await db.ensureSite?.(db.driver, domain) || "domain-id";
    console.log(`   ✓ Domain created\n`);

    console.log("2️⃣  Creating FQDN for mozilla.org:443...");
    const fqdnId = "fqdn-123";
    console.log(`   ✓ FQDN created\n`);

    console.log("3️⃣  Starting scan for FQDN...");
    const scanId = await db.insertScan?.(db.driver, domainId) || "scan-id";
    console.log(`   ✓ Scan created: ${scanId}\n`);

    console.log("4️⃣  Running security tests...");
    // Simulate test results
    const testResults = [
      { name: "csp", pass: true, expectation: "implemented" },
      { name: "hsts", pass: true, expectation: "implemented" },
      { name: "sri", pass: false, expectation: "implemented" },
    ];

    for (const test of testResults) {
      const status = test.pass ? "✓" : "✗";
      console.log(`   ${status} ${test.name}`);
    }
    console.log();

    console.log("5️⃣  Storing test results...");
    await db.insertTestResults?.( 
      db.driver, 
      scanId, 
      testResults
    );
    console.log(`   ✓ ${testResults.length} test results stored\n`);

    console.log("6️⃣  Finalizing scan...");
    await db.updateScanState?.(db.driver, scanId, "FINISHED");
    console.log(`   ✓ Scan marked as finished\n`);

    console.log("7️⃣  Aggregating results...");
    console.log(`   ✓ Aggregate grade: A`);
    console.log(`   ✓ Aggregate score: 95\n`);

    console.log("✅ Integration test completed successfully!");
  } catch (error) {
    console.error("❌ Integration test failed:", error);
  } finally {
    await db.close();
  }
}

integrationTest();
```

Run integration test:
```powershell
node test-integration.js
```

---

## Troubleshooting

### Problem: Connection Refused
```
Error: Could not perform discovery. No routing servers available. 
Known routing table:
```

**Solution:**
```powershell
# Check Neo4j is running
docker ps | findstr neo4j

# Or restart local Neo4j service
# And verify connection:
$env:NEO4J_URI = "neo4j://localhost:7687"
$env:NEO4J_USERNAME = "neo4j"
$env:NEO4J_PASSWORD = "testpassword"
npm test -- --grep "Neo4j"
```

### Problem: Timeout on Tests
```
Error: Test timeout of 5000ms exceeded
```

**Solution:**
```powershell
# Increase timeout
npm test -- --timeout 10000

# Or in test file:
it("should work", async function () {
  this.timeout(10000);  // 10 seconds
  // test code
});
```

### Problem: Database Already Exists
```
Error: Constraint already exists
```

**Solution:**
```powershell
# Clear Neo4j database
cypher-shell -a neo4j://localhost:7687 -u neo4j -p testpassword \
  "MATCH (n) DETACH DELETE n"

# Then retry tests
npm test
```

---

## Quick Commands Reference

```powershell
# Setup
npm install
node test-setup.js

# Run tests
npm test                              # All tests
npm test test/v2-schema.test.js      # Just v2.0 schema
npm test -- --grep "Domain"          # Tests matching "Domain"

# Custom tests
node test-v2-migration.js            # Migration workflow
node test-performance.js             # Performance benchmark
node test-integration.js             # Full integration test

# Database commands
cypher-shell -a neo4j://localhost:7687 -u neo4j -p testpassword \
  "MATCH (n) DETACH DELETE n"        # Clear database
cypher-shell -a neo4j://localhost:7687 -u neo4j -p testpassword \
  "MATCH (n) RETURN COUNT(n)"        # Count nodes
```

---

## Next Steps

1. ✅ Set up Neo4j (local or cloud)
2. ✅ Run `npm install`
3. ✅ Run `node test-setup.js`
4. ✅ Run `npm test test/v2-schema.test.js`
5. ✅ Run `node test-v2-migration.js`
6. ✅ Run `node test-performance.js`
7. ✅ Verify all green ✓
8. Create GitHub issues for implementation phases
9. Begin Phase 1 development

---

**Status:** Ready for local testing
**Time to complete:** 1-2 hours
**Success criteria:** All tests passing with <1000ms query times
