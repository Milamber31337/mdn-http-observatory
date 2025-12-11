# Neo4j AuraDB Setup Guide

This guide walks you through setting up the MDN HTTP Observatory with Neo4j AuraDB as the database backend.

## Prerequisites

- Neo4j AuraDB account (free tier available at https://neo4j.com/cloud/aura)
- Node.js 24.0.0+
- npm 9.0.0+

## Step 1: Create a Neo4j AuraDB Instance

1. Visit https://neo4j.com/cloud/aura and sign up or log in
2. Click "Create Database"
3. Choose "Free" tier for testing
4. Select the region closest to your deployment
5. Wait for the instance to start (typically 1-2 minutes)

## Step 2: Retrieve Connection Credentials

1. Navigate to your database instance
2. Click the three dots (...) menu and select "Copy connection string"
3. Save the connection URI - it will look like:
   ```
   neo4j+s://xxxxxxxx.databases.neo4j.io
   ```
4. Note the username (default: `neo4j`)
5. Set a password or retrieve the generated password

## Step 3: Configure the Application

### Using Environment Variables

```bash
export HTTPOBS_DATABASE_TYPE=neo4j
export NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=your_secure_password
export NEO4J_DATABASE=neo4j
```

### Using Configuration File

Create or update `conf/config.json`:

```json
{
  "database": {
    "type": "neo4j",
    "neo4j": {
      "uri": "neo4j+s://your-instance.databases.neo4j.io",
      "username": "neo4j",
      "password": "your_secure_password",
      "database": "neo4j"
    }
  }
}
```

## Step 4: Initialize the Database Schema

```bash
npm run migrate
```

This command will:
- Create necessary constraints on Site, Scan, and TestResult nodes
- Create indexes for frequently-queried properties
- Prepare the database for use

## Step 5: Test the Connection

Run the test suite to verify the connection works:

```bash
export HTTPOBS_TESTS_ENABLE_DB_TESTS=true
npm test
```

## Step 6: Start the API Server

```bash
npm start
```

The API will be available at `http://localhost:8080`

## Verification

Test that the API is working:

```bash
curl http://localhost:8080/api/v2/analyze?host=example.com
```

You should receive a JSON response with scan results.

## Neo4j-Specific Considerations

### Data Model

Sites and scans are stored as graph nodes with relationships:

```
(Site)-[:HAS_SCAN]->(Scan)-[:HAS_TEST]->(TestResult)
```

### Storage Limits

Neo4j Free tier includes:
- Up to 200,000 nodes
- Full Cypher query language support
- Real-time indexing

For production use, consider AuraDB's paid tiers.

### Backups

Neo4j AuraDB automatically backs up your data:
- Daily backups retained for 7 days
- Manual backups can be triggered in the dashboard
- Full restore capability available

### Performance

Neo4j is optimized for:
- Traversing site history (exploring score changes over time)
- Finding related scans and tests
- Aggregate queries (grade distribution)

For typical HTTP Observatory use cases (recent scans, individual results), performance is comparable to PostgreSQL.

## Switching Between Databases

### From PostgreSQL to Neo4j

1. Back up your PostgreSQL database (optional)
2. Set environment variables for Neo4j
3. Run `npm run migrate` to initialize Neo4j
4. Start the server - it will use Neo4j for new scans

**Note**: Existing PostgreSQL data is not migrated. This is suitable for:
- Testing Neo4j with new data
- Fresh deployment scenarios
- Development environments

### From Neo4j back to PostgreSQL

1. Set PostgreSQL environment variables
2. Run `npm run migrate` to initialize PostgreSQL
3. Start the server - it will use PostgreSQL

## Troubleshooting

### Connection Timeouts

**Issue**: `Error: Connect Timeout`

**Solution**: 
- Verify the URI format includes `+s` for encrypted connections
- Check your firewall allows connections to Neo4j
- Ensure the instance is still running in the AuraDB console

### Authentication Failures

**Issue**: `Unauthorized`

**Solution**:
- Verify credentials are correct in AuraDB dashboard
- Ensure password is properly URL-encoded if it contains special characters
- Check that you're connecting to the correct database name

### Memory Issues

**Issue**: Slow queries or out-of-memory errors

**Solution**:
- Neo4j Free tier has 2GB memory limit
- Consider upgrading to a larger AuraDB instance
- Implement pagination for large result sets

### Schema Initialization Errors

**Issue**: Constraints/indexes fail to create

**Solution**:
- Check that the database is empty before first run
- Clear existing nodes/relationships if needed:
  ```bash
  # In Neo4j Browser
  MATCH (n) DETACH DELETE n;
  ```
- Retry the migration

## Useful Neo4j Queries

### View Database Statistics

```cypher
MATCH (s:Site)
RETURN COUNT(s) as total_sites
```

### View Recent Scans

```cypher
MATCH (scan:Scan)
WHERE scan.state = 'FINISHED'
RETURN scan.id, scan.grade, scan.score, scan.startTime
ORDER BY scan.startTime DESC
LIMIT 10
```

### Find Sites with Low Grades

```cypher
MATCH (site:Site)-[:HAS_SCAN]->(scan:Scan)
WHERE scan.state = 'FINISHED' AND scan.grade IN ['D', 'D-', 'F']
RETURN site.domain, scan.grade, scan.score
ORDER BY scan.score ASC
```

## Performance Tuning

### Adjust Connection Pool Size

```javascript
// In createPool() method
const driver = neo4j.driver(uri, auth, {
  maxConnectionPoolSize: 60, // Increase from 40
  connectionTimeoutMillis: 5000, // Increase timeout
});
```

### Enable Query Logging

Set environment variable to debug queries:
```bash
export NEO4J_LOG_LEVEL=debug
```

## Getting Help

For Neo4j-specific issues:
- Check Neo4j documentation: https://neo4j.com/docs/
- Neo4j Community: https://community.neo4j.com/
- AuraDB Support: https://neo4j.com/contact/aura-support/

For HTTP Observatory issues:
- GitHub Issues: https://github.com/mdn/mdn-http-observatory
- MDN Community: https://github.com/mdn/content/discussions
