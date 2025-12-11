# Neo4j Support - Installation & Quick Start

## 5-Minute Setup

### Step 1: Install Dependencies

```bash
# Install neo4j-driver
npm install neo4j-driver
```

### Step 2: Configure Neo4j

Create `conf/config.json` or set environment variables:

```bash
export HTTPOBS_DATABASE_TYPE=neo4j
export NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=your_password
export NEO4J_DATABASE=neo4j
```

### Step 3: Initialize Database

```bash
npm run migrate
```

### Step 4: Start Server

```bash
npm start
```

### Step 5: Verify Installation

```bash
curl http://localhost:8080/api/v2/analyze?host=example.com
```

## Requirements Checklist

- ✅ Node.js 24.0.0+
- ✅ npm 9.0.0+
- ✅ Neo4j AuraDB instance (create at https://neo4j.com/cloud/aura)
- ✅ Connection credentials from AuraDB dashboard

## Troubleshooting Quick Reference

| Issue | Solution |
|-------|----------|
| `Cannot find module 'neo4j-driver'` | Run `npm install neo4j-driver` |
| `Cannot acquire server address` | Check URI format: `neo4j+s://...` with `+s` |
| `Unauthorized` | Verify credentials and database access |
| `Connection timeout` | Verify firewall rules, increase timeout |
| `Constraint already exists` | Clear schema: `MATCH (n) DETACH DELETE n;` |

## Verification Commands

```bash
# Check database connection
node -e "import('neo4j-driver').then(m => console.log('✓ neo4j-driver installed'))"

# Test migration
npm run migrate && echo "✓ Schema initialized"

# Test API endpoint
curl -s http://localhost:8080/api/v2/analyze?host=example.com | grep -q "algorithmVersion" && echo "✓ API working"
```

## Getting Help

- **Neo4j Setup**: See `docs/NEO4J_SETUP.md`
- **Architecture**: See `docs/NEO4J_IMPLEMENTATION.md`
- **Migration**: See `docs/DATABASE_MIGRATION.md`
- **Adapters**: See `src/database/adapters/README.md`

## Next Steps

1. Read full setup guide: `docs/NEO4J_SETUP.md`
2. Load test your setup
3. Monitor performance
4. Review migration guide if switching from PostgreSQL

---

**Default Setup**: PostgreSQL remains the default. Neo4j is opt-in via configuration.

**Backward Compatible**: All existing code continues to work unchanged.

**Questions?** Check the comprehensive documentation in the `docs/` folder.
