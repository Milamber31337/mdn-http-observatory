# Database Adapters

This directory contains database adapter implementations for the MDN HTTP Observatory. The adapter pattern allows the application to support multiple database backends with a unified interface.

## Supported Databases

### PostgreSQL (Default)
The original and production-tested database backend.

**File**: `adapters/postgresql.js`

**Configuration**:
```json
{
  "database": {
    "type": "postgresql",
    "host": "localhost",
    "port": 5432,
    "database": "httpobservatory",
    "user": "postgres",
    "password": "your_password"
  }
}
```

**Environment Variables**:
- `HTTPOBS_DATABASE_TYPE=postgresql`
- `PGHOST` - Hostname
- `PGPORT` - Port (default: 5432)
- `PGDATABASE` - Database name
- `PGUSER` - Username
- `PGPASSWORD` - Password
- `PGSSLMODE` - SSL mode (boolean)

### Neo4j AuraDB
Alternative database backend using Neo4j's cloud-hosted AuraDB service.

**File**: `adapters/neo4j.js`

**Configuration**:
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

**Environment Variables**:
- `HTTPOBS_DATABASE_TYPE=neo4j`
- `NEO4J_URI` - Connection URI
- `NEO4J_USERNAME` - Username
- `NEO4J_PASSWORD` - Password
- `NEO4J_DATABASE` - Database name (default: neo4j)

## Architecture

### Adapter Interface

All database adapters implement the following interface:

```javascript
{
  // Initialization
  createPool()              // Initialize connection pool/driver
  migrate()                 // Run schema migrations/initialization
  close()                   // Close connections

  // Site operations
  ensureSite(pool, siteKey) // Get or create a site by domain

  // Scan operations
  insertScan(pool, siteId)
  insertTestResults(pool, siteId, scanId, scanResult)
  selectScan(pool, scanId)
  selectScanById(pool, scanId)
  selectScanRecentScan(pool, siteId, recentInSeconds)
  selectScanLatestScanByHost(pool, host, maxAge)
  selectScanHostHistory(pool, siteId)
  updateScanState(pool, scanId, state, error)

  // Statistics
  selectTestResults(pool, scanId)
  selectGradeDistribution(pool)
  refreshMaterializedViews(pool)
}
```

### Adapter Factory

The `adapter.js` file provides a factory function that returns the appropriate adapter based on configuration:

```javascript
import { createDatabaseAdapter } from "./database/adapter.js";

const db = await createDatabaseAdapter(CONFIG);
db.createPool();

// Use the adapter
const siteId = await db.ensureSite(pool, "example.com");
const scan = await db.insertScan(pool, siteId);
```

## Data Model Mapping

### PostgreSQL
Uses relational tables:
- `sites` - Domains being scanned
- `scans` - Individual scan records
- `tests` - Test results for each scan
- `expectations` - Enum values for test expectations

### Neo4j
Uses graph nodes and relationships:
- `:Site` nodes with `domain`, `id`, `creationTime` properties
- `:Scan` nodes with `id`, `state`, `startTime`, `score`, `grade`, etc.
- `:TestResult` nodes with test metadata
- `[:HAS_SCAN]` relationships connecting sites to scans
- `[:HAS_TEST]` relationships connecting scans to tests

## Key Differences

### Schema Initialization

**PostgreSQL**: Uses SQL migrations in `migrations/` directory
```bash
npm run migrate
```

**Neo4j**: Uses Cypher schema commands (constraints and indexes)
```bash
npm run migrate  # Auto-initializes Neo4j schema
```

### Timestamp Handling

**PostgreSQL**: Native TIMESTAMP type with timezone
```sql
NOW() -- server timestamp
```

**Neo4j**: Uses millisecond epoch timestamps (Date.now())
```cypher
apoc.date.currentTimestamp() -- milliseconds since epoch
```

### Materialized Views

**PostgreSQL**: Actual materialized views
```sql
REFRESH MATERIALIZED VIEW grade_distribution
```

**Neo4j**: Computed on-demand with Cypher aggregations (no persistence needed)

### Connection Pooling

**PostgreSQL**: Native pg pool with connection limits
- Max 40 connections
- 60 second idle timeout
- 2 second connection timeout

**Neo4j**: Neo4j driver with built-in connection pooling
- Max connection pool size: 40
- 2 second connection timeout
- 30 second max retry time

## Migration Guide

### Switching from PostgreSQL to Neo4j

1. **Update configuration**:
   ```bash
   export HTTPOBS_DATABASE_TYPE=neo4j
   export NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
   export NEO4J_USERNAME=neo4j
   export NEO4J_PASSWORD=your_password
   ```

2. **Initialize Neo4j schema**:
   ```bash
   npm run migrate
   ```

3. **Start the API**:
   ```bash
   npm start
   ```

### Switching back to PostgreSQL

1. **Update configuration**:
   ```bash
   export HTTPOBS_DATABASE_TYPE=postgresql
   # Set PostgreSQL connection variables
   ```

2. **Run PostgreSQL migrations**:
   ```bash
   npm run migrate
   ```

3. **Start the API**:
   ```bash
   npm start
   ```

## Performance Considerations

### PostgreSQL
- Optimized for read/write operations on scans
- Materialized view for grade distribution provides cached statistics
- Indexes on frequently-queried columns
- JSON storage for test output data

### Neo4j
- Graph traversal for site history queries
- Aggregation queries for grade distribution
- Better for exploring relationships between sites and scans
- Index-based lookups for specific queries

## Testing

When testing with Neo4j, the database should be freshly initialized:

```bash
# PostgreSQL
CONFIG_FILE=conf/config-test.json npm test

# Neo4j
HTTPOBS_DATABASE_TYPE=neo4j CONFIG_FILE=conf/config-test.json npm test
```

For database-dependent tests, ensure `CONFIG.tests.enableDBTests` is set to `true`.

## Troubleshooting

### Neo4j Connection Issues

**Error**: `Cannot acquire server address for routing`
- Verify URI format: `neo4j+s://instance.databases.neo4j.io` (includes `+s` for encrypted)
- Check credentials are correct
- Ensure AuraDB instance is running

**Error**: `Unauthorized`
- Verify username/password
- Check if user has access to the specified database
- Ensure credentials are URL-encoded if special characters present

### Query Performance

**Neo4j**:
- Use `MATCH...WHERE` instead of `OPTIONAL MATCH` when possible
- Ensure indexes exist for frequently-queried properties
- Use LIMIT to reduce result set size

**PostgreSQL**:
- Verify indexes are present with `\d table_name`
- Check query plans with `EXPLAIN ANALYZE`

## Contributing

When adding new database operations:

1. Implement in both `postgresql.js` and `neo4j.js` adapters
2. Maintain the same method signature
3. Return consistent data types (match PostgreSQL row format)
4. Add corresponding tests in `test/` directory
5. Update this README with any significant changes
