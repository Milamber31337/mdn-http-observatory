# 🧪 Local Testing Options - Quick Summary

## Fastest Way to Test (⏱️ 5 minutes)

### Option A: Docker (Recommended)

```powershell
# 1. Start Neo4j
docker run -d --name mdn-neo4j-test -p 7687:7687 -e NEO4J_AUTH=neo4j/testpass123 neo4j:latest

# 2. Set environment
$env:NEO4J_URI = "neo4j://localhost:7687"
$env:NEO4J_USERNAME = "neo4j"
$env:NEO4J_PASSWORD = "testpass123"

# 3. Run tests
npm install
node test-v2-quick.js
```

**Time:** 5 minutes
**Effort:** Minimal
**Cleanup:** `docker rm -f mdn-neo4j-test`

### Option B: Local Neo4j

```powershell
# 1. Download & install from https://neo4j.com/download-community-edition/
# 2. Start Neo4j (default: localhost:7687)
# 3. Set environment variables (same as above)
# 4. npm install && npm test
```

**Time:** 10-15 minutes
**Effort:** Moderate
**Cleanup:** Uninstall or stop service

### Option C: Neo4j AuraDB (Cloud)

```powershell
# 1. Sign up at https://neo4j.com/cloud/aura/
# 2. Create free instance
# 3. Set environment variables with cloud credentials
# 4. npm install && npm test
```

**Time:** 5 minutes (signup) + setup
**Effort:** Minimal
**Cleanup:** Delete cloud instance

---

## Testing Timeline

```
00:00 - Start
00:01 - Docker running ✓
00:02 - Environment set ✓
00:03 - npm install ✓
00:04 - Quick test running
00:05 - Results ready ✓
```

---

## What Gets Tested

### Unit Tests (`npm test test/v2-schema.test.js`)
- ✅ Domain node creation
- ✅ FQDN node creation
- ✅ DNS node creation
- ✅ Test node creation
- ✅ Relationship linking
- ✅ Uniqueness constraints
- ✅ Query performance

### Migration Test (`node test-v2-migration.js`)
- ✅ Domain → FQDN linking
- ✅ FQDN → Scan linking
- ✅ Scan → TestResult linking
- ✅ TestResult → Test linking
- ✅ Full chain traversal
- ✅ Aggregation queries

### Performance Test (`node test-performance.js`)
- ✅ Create 100 FQDNs with scans
- ✅ Domain FQDN lookup (<100ms)
- ✅ Multi-hop traversal (<500ms)
- ✅ Aggregation query (<500ms)

### Integration Test (`node test-integration.js`)
- ✅ Full workflow simulation
- ✅ Domain creation
- ✅ FQDN creation
- ✅ Scan creation
- ✅ Test result storage
- ✅ Result aggregation

---

## Test Files Created

| File | Purpose | Run Time |
|------|---------|----------|
| `LOCAL_TEST_GUIDE.md` | Comprehensive guide | Read once |
| `DOCKER_SETUP.md` | Docker-specific setup | Reference |
| `test-v2-quick.js` | Quick validation script | ~1-2 minutes |
| `test/v2-schema.test.js` | Unit tests (create this) | ~3-5 minutes |
| `test-v2-migration.js` | Migration workflow (create) | ~2-3 minutes |
| `test-performance.js` | Performance benchmark (create) | ~5-10 minutes |
| `test-integration.js` | Full integration (create) | ~2-3 minutes |

---

## Expected Test Output

### Successful Unit Tests
```
  Neo4j v2.0 Schema
    Domain Nodes
      ✓ should create domain node
      ✓ should enforce domain uniqueness
    FQDN Nodes
      ✓ should create FQDN node
      ✓ should link FQDN to Domain
    DNS Nodes
      ✓ should create DNS record
      ✓ should enforce DNS uniqueness
    Test Nodes
      ✓ should create test node
      ✓ should enforce test name uniqueness
    Relationships
      ✓ should link FQDN to Scan
      ✓ should link Scan to TestResult
      ✓ should link TestResult to Test definition
    Query Performance
      ✓ should query indexed FQDN fields efficiently
      ✓ should aggregate domain scans efficiently

  15 passing (234ms)
```

### Successful Performance Test
```
📊 Performance Benchmark
=======================

📈 Running benchmark queries:

Test 1: Get all FQDNs for domain
   Results: 100 FQDNs
   Time: 45ms ✓

Test 2: Get all scans across domain
   Results: 100 scans
   Time: 89ms ✓

Test 3: Domain aggregation
   FQDNs: 100, Scans: 100
   Time: 156ms ✓

✅ Performance benchmark complete!
```

---

## Troubleshooting Quick Links

### "Connection refused"
→ See LOCAL_TEST_GUIDE.md → Troubleshooting → Connection Refused

### "Port already in use"
→ See DOCKER_SETUP.md → Troubleshooting → Port Already in Use

### "Test timeout"
→ See LOCAL_TEST_GUIDE.md → Troubleshooting → Timeout on Tests

### "Database already exists"
→ See LOCAL_TEST_GUIDE.md → Troubleshooting → Database Already Exists

---

## Environment Variables Cheat Sheet

```powershell
# For local Neo4j
$env:HTTPOBS_DATABASE_TYPE = "neo4j"
$env:NEO4J_URI = "neo4j://localhost:7687"
$env:NEO4J_USERNAME = "neo4j"
$env:NEO4J_PASSWORD = "testpassword"
$env:NEO4J_DATABASE = "neo4j"

# For Docker
$env:NEO4J_URI = "neo4j://localhost:7687"  # Same as above
$env:NEO4J_PASSWORD = "testpass123"

# For AuraDB (example)
$env:NEO4J_URI = "neo4j+s://xxxxx.databases.neo4j.io"
$env:NEO4J_PASSWORD = "your_aura_password"
```

---

## Command Cheat Sheet

```powershell
# Quick start
docker run -d --name mdn-neo4j-test -p 7687:7687 -e NEO4J_AUTH=neo4j/testpass123 neo4j:latest
npm install
node test-v2-quick.js

# Unit tests only
npm test test/v2-schema.test.js

# All tests
npm test

# Specific test
npm test -- --grep "Domain"

# View logs
docker logs -f mdn-neo4j-test

# Clear database
docker exec mdn-neo4j-test cypher-shell -u neo4j -p testpass123 "MATCH (n) DETACH DELETE n"

# Stop/remove
docker stop mdn-neo4j-test
docker rm mdn-neo4j-test

# Full workflow test
node test-v2-migration.js

# Performance test
node test-performance.js

# Integration test
node test-integration.js
```

---

## Next Steps After Testing

1. ✅ All tests passing? → Proceed to implementation
2. ❌ Tests failing? → Check troubleshooting guides
3. ⚠️ Performance slow? → Increase Neo4j memory/CPU
4. 🎯 Ready? → Create GitHub issues for Phase 1

---

## Documentation Map

```
├── LOCAL_TEST_GUIDE.md
│   ├── Step 1: Install Neo4j
│   ├── Step 2: Verify connection
│   ├── Step 3: Install dependencies
│   ├── Step 4-7: Create test files
│   └── Troubleshooting
│
├── DOCKER_SETUP.md
│   ├── Quick Start with Docker
│   ├── Docker Compose setup
│   ├── Common commands
│   ├── Troubleshooting
│   └── Performance tips
│
├── test-v2-quick.js
│   └── Automated quick validation
│
└── Schema Documentation (separate)
    ├── SCHEMA_V2_SUMMARY.md
    ├── NEO4J_SCHEMA_IMPROVEMENTS.md
    ├── NEO4J_SCHEMA_V2_VISUAL.md
    └── NEO4J_SCHEMA_V2_IMPLEMENTATION.md
```

---

## Success Criteria

✅ **You've successfully tested v2.0 when:**

1. Docker Neo4j starts without errors
2. Environment variables are set correctly
3. `npm install` completes successfully
4. `node test-v2-quick.js` passes all checks
5. `npm test test/v2-schema.test.js` shows 15 tests passing
6. `node test-v2-migration.js` completes without errors
7. `node test-performance.js` shows queries <1000ms
8. `node test-integration.js` completes successfully

---

## Estimated Total Time

| Task | Time |
|------|------|
| Docker setup | 3-5 min |
| Environment setup | 1-2 min |
| npm install | 2-3 min |
| Quick validation | 1-2 min |
| Unit tests | 3-5 min |
| Migration test | 2-3 min |
| Performance test | 5-10 min |
| **Total** | **~20-30 min** |

---

## Still Need Help?

1. **Read:** LOCAL_TEST_GUIDE.md (comprehensive)
2. **Read:** DOCKER_SETUP.md (if using Docker)
3. **Search:** Troubleshooting section in each doc
4. **Create:** GitHub issue with error messages
5. **Reference:** Schema documentation in docs/ folder

---

**Status:** 🟢 Ready to test
**Last Updated:** December 11, 2025
**Estimated Setup Time:** 20-30 minutes
**Expected Test Pass Rate:** 100% (if prerequisites met)

Good luck! 🚀
