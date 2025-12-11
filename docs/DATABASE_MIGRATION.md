# Migrating Between Database Backends

This guide explains how to switch between PostgreSQL and Neo4j AuraDB for the MDN HTTP Observatory.

## Understanding the Migration Model

The current implementation supports **fresh migrations** rather than data migration. This means:

- When you switch databases, new scans will use the new database
- Old data remains in the previous database
- Both databases can run independently
- No complex ETL process required

This design is suitable for:
- Testing database backends in development
- Gradually rolling out to a new database
- A/B testing database performance
- Fresh deployments on new infrastructure

## PostgreSQL → Neo4j Migration

### Prerequisites

- Neo4j AuraDB instance created
- Connection credentials obtained
- Node.js application ready to restart

### Step 1: Update Configuration

Set environment variables for Neo4j:

```bash
export HTTPOBS_DATABASE_TYPE=neo4j
export NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=your_password
export NEO4J_DATABASE=neo4j
```

Or update `conf/config.json`:

```json
{
  "database": {
    "type": "neo4j",
    "neo4j": {
      "uri": "neo4j+s://your-instance.databases.neo4j.io",
      "username": "neo4j",
      "password": "your_password",
      "database": "neo4j"
    }
  }
}
```

### Step 2: Initialize Neo4j Schema

```bash
npm run migrate
```

This creates:
- Constraints on Site, Scan, TestResult nodes
- Indexes for performance
- Prepares the database for use

### Step 3: Start the Application

```bash
npm start
```

The API will now use Neo4j for all new scans.

### Step 4: Verification

```bash
# Test the API
curl http://localhost:8080/api/v2/analyze?host=example.com

# Should return a fresh scan result from Neo4j
```

### Step 5: Archive PostgreSQL (Optional)

If you want to keep old PostgreSQL data:

```bash
# Backup PostgreSQL
pg_dump httpobservatory > backup_$(date +%Y%m%d_%H%M%S).sql

# Or just leave it running read-only for historical reference
```

## Neo4j → PostgreSQL Rollback

If you need to rollback to PostgreSQL:

### Step 1: Update Configuration

```bash
export HTTPOBS_DATABASE_TYPE=postgresql
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=httpobservatory
export PGUSER=postgres
export PGPASSWORD=password
```

### Step 2: Initialize PostgreSQL Schema

```bash
npm run migrate
```

### Step 3: Restart Application

```bash
npm start
```

All new scans will use PostgreSQL again.

## Data Portability Strategies

If you need to migrate existing data between databases:

### Option 1: Manual Export/Import

#### PostgreSQL → Neo4j

```bash
# 1. Export PostgreSQL data to JSON
psql -U postgres -d httpobservatory -c "
SELECT json_build_object(
  'sites', (SELECT json_agg(row_to_json(t)) FROM sites t),
  'scans', (SELECT json_agg(row_to_json(t)) FROM scans t),
  'tests', (SELECT json_agg(row_to_json(t)) FROM tests t)
)" > observatory_data.json

# 2. Write Neo4j import script to load from JSON
# (Custom script using neo4j-driver)

# 3. Run the import script
node scripts/import-neo4j.js observatory_data.json
```

#### Neo4j → PostgreSQL

```cypher
# Export from Neo4j Browser as JSON
MATCH (s:Site)
OPTIONAL MATCH (scan:Scan)--(s)
OPTIONAL MATCH (test:TestResult)--(scan)
RETURN {sites: s, scans: scan, tests: test}
```

Then import into PostgreSQL.

### Option 2: Live Replication

Set up simultaneous writes to both databases during transition:

```javascript
// In your scan operation
const scanResult = await scan(site);

// Write to both databases
const [pgResult, neo4jResult] = await Promise.all([
  pgAdapter.insertTestResults(pgPool, siteId, scanId, scanResult),
  neo4jAdapter.insertTestResults(neo4jDriver, siteId, scanId, scanResult)
]);
```

This requires code changes but ensures zero data loss.

## Performance Considerations

### During Migration

PostgreSQL and Neo4j will have different performance profiles:

**PostgreSQL**:
- Faster for recent, recent scans (indexed lookups)
- Materialized views provide cached statistics
- Better for ACID transactions

**Neo4j**:
- Better for exploring site history
- Graph traversal more efficient for related records
- On-demand aggregations

### Recommendations

1. **Test both** with your typical workload
2. **Monitor metrics** during transition
3. **Maintain PostgreSQL** as backup during rollout
4. **Plan for rollback** if Neo4j performance is insufficient

## Troubleshooting Migration

### Connection Errors After Switching

```
Error: Cannot acquire server address for routing
```

**Solution**:
- Verify URI includes `+s` suffix: `neo4j+s://...`
- Check credentials are correct
- Ensure AuraDB instance is running

### Schema Initialization Fails

```
Error: Constraint or Index already exists
```

**Solution**:
- Clear existing data if starting fresh:
  ```cypher
  MATCH (n) DETACH DELETE n;
  ```
- Or specify version to skip already-applied migrations

### Data Consistency Issues

If both databases have some scans:

1. Decide which database is "source of truth"
2. Configure routing in your API:
   ```javascript
   // Always read from PostgreSQL for historical data
   // Write to Neo4j for new data
   const scan = CONFIG.database.type === 'neo4j'
     ? await selectFromBoth(scanId)
     : await pgAdapter.selectScan(pool, scanId);
   ```

## Full Data Migration (Advanced)

If you need complete data portability:

### Step 1: Export Data with Relationships

```bash
# PostgreSQL export with foreign key preservation
pg_dump --no-password -h localhost -U postgres httpobservatory \
  --table=sites --table=scans --table=tests \
  --data-only --inserts > data.sql
```

### Step 2: Create Transformation Script

```javascript
const fs = require('fs');
const neo4j = require('neo4j-driver');

async function importData(filename) {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(user, pass));
  const session = driver.session();

  // Parse exported data
  const data = parseSQL(fs.readFileSync(filename, 'utf8'));

  // Create sites
  for (const site of data.sites) {
    await session.run(
      `CREATE (s:Site { id: $id, domain: $domain, creationTime: $creationTime })`,
      { id: site.id, domain: site.domain, creationTime: site.creation_time.getTime() }
    );
  }

  // Create scans with relationships
  for (const scan of data.scans) {
    await session.run(
      `MATCH (s:Site { id: $siteId })
       CREATE (scan:Scan { /* scan props */ })
       CREATE (s)-[:HAS_SCAN]->(scan)`,
      { siteId: scan.site_id, /* ... */ }
    );
  }

  // Similar for tests
  await session.close();
  await driver.close();
}
```

### Step 3: Run Migration

```bash
node scripts/migrate-to-neo4j.js data.sql
```

### Step 4: Validate Data

```cypher
MATCH (s:Site) RETURN COUNT(s) as site_count;
MATCH (scan:Scan) RETURN COUNT(scan) as scan_count;
MATCH (test:TestResult) RETURN COUNT(test) as test_count;
```

Compare with PostgreSQL:

```sql
SELECT COUNT(*) FROM sites;
SELECT COUNT(*) FROM scans;
SELECT COUNT(*) FROM tests;
```

## Best Practices

1. **Test in Development First**
   - Migrate a copy to Neo4j in dev environment
   - Verify application behavior
   - Load test with production traffic patterns

2. **Plan Downtime**
   - Brief downtime (< 1 minute) acceptable for schema initialization
   - Warm up caches after migration

3. **Monitor After Migration**
   - Track API response times
   - Monitor Neo4j or PostgreSQL metrics
   - Set up alerts for slow queries

4. **Keep Backup**
   - Always maintain backup of original database
   - Test restore procedures
   - Keep backups for 30+ days

5. **Gradual Rollout**
   - Start with read-only mirror of new database
   - Route writes to old database
   - Gradually switch traffic
   - Keep old database running as fallback

## Support

For migration issues:
- PostgreSQL: See PostgreSQL documentation
- Neo4j: See `docs/NEO4J_SETUP.md`
- MDN Observatory: Check GitHub issues
