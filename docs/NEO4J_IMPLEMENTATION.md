# Neo4j Support Implementation Summary

## Overview

Neo4j AuraDB support has been added as an alternative database backend to PostgreSQL. The implementation uses an adapter pattern to abstract database operations, allowing seamless switching between PostgreSQL and Neo4j without changing application code.

## Files Created/Modified

### New Files

1. **`src/database/adapter.js`**
   - Factory function for database adapter creation
   - Exports `createDatabaseAdapter()` that returns the appropriate adapter
   - Defines `ScanState` enum and `ALGORITHM_VERSION` constant

2. **`src/database/adapters/postgresql.js`**
   - PostgreSQL adapter implementing the DatabaseAdapter interface
   - Wraps existing PostgreSQL operations from `repository.js`
   - Uses `pg` library for connection pooling and queries

3. **`src/database/adapters/neo4j.js`**
   - Neo4j adapter implementing the DatabaseAdapter interface
   - Uses `neo4j-driver` for connection and Cypher queries
   - Implements schema initialization with constraints and indexes

4. **`src/database/adapters/README.md`**
   - Comprehensive documentation of the adapter pattern
   - Setup instructions for both PostgreSQL and Neo4j
   - Performance considerations and troubleshooting

5. **`src/database/migrations.js`**
   - Extracted migration logic from `repository.js`
   - Handles Postgrator-based PostgreSQL migrations

6. **`src/api/plugins/database.js`**
   - Fastify plugin for database integration
   - Creates appropriate adapter based on configuration
   - Manages connection lifecycle

7. **`docs/NEO4J_SETUP.md`**
   - Step-by-step Neo4j AuraDB setup guide
   - Troubleshooting common issues
   - Useful Neo4j queries for operations

8. **`conf/config-example-full.json`**
   - Example configuration with both PostgreSQL and Neo4j settings
   - Shows all available configuration options

### Modified Files

1. **`src/config.js`**
   - Added `database.type` field (postgresql|neo4j)
   - Added `database.neo4j` section with URI, username, password, database
   - Environment variables: `HTTPOBS_DATABASE_TYPE`, `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`

2. **`src/database/repository.js`**
   - Added `createDatabaseAdapterInstance()` function
   - Preserved all existing PostgreSQL-specific code for backward compatibility

3. **`.github/copilot-instructions.md`**
   - Updated with database adapter pattern explanation
   - Added Neo4j setup instructions
   - Updated critical technical details section

## Architecture

### Database Adapter Interface

All adapters implement the following interface:

```javascript
class DatabaseAdapter {
  // Initialization
  createPool()
  migrate(version, pool)
  close()

  // Site operations
  async ensureSite(pool, siteKey)

  // Scan operations
  async insertScan(pool, siteId)
  async insertTestResults(pool, siteId, scanId, scanResult)
  async selectScan(pool, scanId)
  async selectScanById(pool, scanId)
  async selectScanRecentScan(pool, siteId, recentInSeconds)
  async selectScanLatestScanByHost(pool, host, maxAge)
  async selectScanHostHistory(pool, siteId)
  async updateScanState(pool, scanId, state, error)

  // Statistics
  async selectTestResults(pool, scanId)
  async selectGradeDistribution(pool)
  async refreshMaterializedViews(pool)
}
```

### Data Model Mapping

**PostgreSQL**:
- Relational tables: sites, scans, tests, expectations
- Uses SQL with parameterized queries via `pg-format`
- Materialized views for aggregated statistics

**Neo4j**:
- Graph nodes: Site, Scan, TestResult
- Relationships: `[:HAS_SCAN]`, `[:HAS_TEST]`
- Cypher queries with map-based parameters
- Indexes and constraints for performance

### Configuration Hierarchy

```
Default (PostgreSQL)
    ↓
config.json (if present)
    ↓
Environment Variables (highest priority)
```

## Key Implementation Details

### PostgreSQL Adapter

- Delegates to existing `repository.js` functions
- Uses native `pg` module with connection pooling
- Pool config: max 40 connections, 60s idle timeout
- Migrations via Postgrator

### Neo4j Adapter

- Uses `neo4j-driver` with built-in connection pooling
- Creates constraints on Site, Scan, TestResult nodes
- Creates indexes for common query patterns
- Stores timestamps as millisecond epoch values
- Returns data in PostgreSQL row format for compatibility

### Data Type Normalization

Both adapters normalize responses to match PostgreSQL row format:

```javascript
{
  id: number,
  site_id: number,
  state: string,
  start_time: Date,
  end_time: Date | null,
  tests_failed: number,
  tests_passed: number,
  tests_quantity: number,
  grade: string | null,
  score: number | null,
  error: string | null,
  algorithm_version: number
}
```

## Migration Paths

### Switching from PostgreSQL to Neo4j

1. Set environment variables:
   ```bash
   export HTTPOBS_DATABASE_TYPE=neo4j
   export NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
   export NEO4J_USERNAME=neo4j
   export NEO4J_PASSWORD=password
   ```

2. Initialize schema:
   ```bash
   npm run migrate
   ```

3. Restart application - new scans will use Neo4j

**Note**: Existing PostgreSQL data is not migrated. This approach is suitable for:
- Testing/development environments
- Fresh deployments
- Switching between databases

### Switching back to PostgreSQL

1. Set PostgreSQL environment variables
2. Run `npm run migrate`
3. Restart application

## Testing

### Database Tests

```bash
# PostgreSQL tests
CONFIG_FILE=conf/config-test.json npm test

# Neo4j tests
HTTPOBS_DATABASE_TYPE=neo4j CONFIG_FILE=conf/config-test.json npm test
```

### Manual Testing

```bash
# PostgreSQL
export HTTPOBS_DATABASE_TYPE=postgresql
npm run migrate
npm start

# Neo4j
export HTTPOBS_DATABASE_TYPE=neo4j
export NEO4J_URI=neo4j+s://...
npm run migrate
npm start

# Test the endpoint
curl http://localhost:8080/api/v2/analyze?host=example.com
```

## Performance Characteristics

### PostgreSQL
- Optimized for OLAP workloads
- Materialized views provide cached statistics
- Indexes on commonly-queried columns
- JSON storage for test output

### Neo4j
- Optimized for graph traversal
- Better for exploring relationships (site history)
- Aggregate queries computed on-demand
- Full-text search capabilities available

Both are suitable for HTTP Observatory workloads (recent scans, test results, statistics).

## Deployment Considerations

### Production Recommendations

**PostgreSQL**:
- Use managed PostgreSQL service (AWS RDS, Google Cloud SQL, etc.)
- Enable automated backups
- Use connection pooling (pgBouncer)
- Monitor query performance with pg_stat_statements

**Neo4j**:
- Use Neo4j AuraDB (managed service)
- Automatic daily backups
- Built-in connection pooling via driver
- Query performance viewable in AuraDB dashboard

### Monitoring

Both adapters log:
- Connection initialization
- Migration status
- Connection errors
- Query timeouts

Enable debug logging:
```bash
# PostgreSQL
export DEBUG=pg:*

# Neo4j
export NEO4J_LOG_LEVEL=debug
```

## Backward Compatibility

The implementation maintains full backward compatibility:
- Existing PostgreSQL deployments work unchanged
- Default is PostgreSQL if `HTTPOBS_DATABASE_TYPE` not set
- All existing APIs unchanged
- Repository exports remain for direct use

## Future Enhancements

Possible improvements:
1. MySQL/MariaDB adapter
2. MongoDB adapter
3. Automated data migration between databases
4. Query performance monitoring
5. Read replicas for scaling
6. Caching layer (Redis)

## Troubleshooting

### Common Issues

**Neo4j Connection Fails**:
- Check URI format: `neo4j+s://` (includes `+s` for encryption)
- Verify credentials in AuraDB dashboard
- Ensure instance is running

**Schema Initialization Fails**:
- Clear existing data: `MATCH (n) DETACH DELETE n;`
- Verify constraints/indexes don't exist: `SHOW CONSTRAINTS`
- Retry migration

**Performance Issues**:
- Check indexes exist: `SHOW INDEXES`
- Review query plans: `EXPLAIN MATCH...`
- Adjust pool size for concurrent loads

## References

- PostgreSQL: https://www.postgresql.org/
- Neo4j: https://neo4j.com/
- Neo4j AuraDB: https://neo4j.com/cloud/aura/
- Cypher Query Language: https://neo4j.com/developer/cypher/
- neo4j-driver: https://github.com/neo4j/neo4j-javascript-driver
