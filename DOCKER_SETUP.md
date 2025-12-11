# Docker Setup for Neo4j Local Testing

## Quick Start with Docker (Recommended)

### Prerequisites
- Docker installed (https://www.docker.com/products/docker-desktop)
- Docker running

### Step 1: Start Neo4j in Docker

```powershell
# Pull and run Neo4j image
docker run -d `
  --name mdn-neo4j-test `
  -p 7687:7687 `
  -p 7474:7474 `
  -e NEO4J_AUTH=neo4j/testpassword123 `
  -e NEO4J_INITIAL_DBMS_DEFAULT_DATABASE=neo4j `
  neo4j:latest

# Wait 10 seconds for Neo4j to start
Start-Sleep -Seconds 10

# Verify container is running
docker ps | findstr mdn-neo4j-test
```

### Step 2: Verify Connection

```powershell
# Test Neo4j is accessible
docker exec mdn-neo4j-test cypher-shell -u neo4j -p testpassword123 "RETURN 1 as result"

# Expected output:
# result
# 1
```

### Step 3: Set Environment Variables

**PowerShell:**
```powershell
$env:HTTPOBS_DATABASE_TYPE = "neo4j"
$env:NEO4J_URI = "neo4j://localhost:7687"
$env:NEO4J_USERNAME = "neo4j"
$env:NEO4J_PASSWORD = "testpassword123"
$env:NEO4J_DATABASE = "neo4j"
```

**Or create `.env.test` file:**
```env
HTTPOBS_DATABASE_TYPE=neo4j
NEO4J_URI=neo4j://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=testpassword123
NEO4J_DATABASE=neo4j
```

### Step 4: Run Tests

```powershell
# Install dependencies
npm install

# Run quick test
node test-v2-quick.js

# Run full test suite
npm test
```

---

## Docker Compose Setup (For Complete Stack)

Create `docker-compose.test.yml`:

```yaml
version: '3.8'

services:
  neo4j:
    image: neo4j:latest
    container_name: mdn-neo4j-test
    ports:
      - "7687:7687"
      - "7474:7474"
      - "7473:7473"
    environment:
      NEO4J_AUTH: neo4j/testpassword123
      NEO4J_INITIAL_DBMS_DEFAULT_DATABASE: neo4j
      NEO4J_server_memory_heap_max__size: 2G
      NEO4J_server_memory_pagecache_size: 1G
    volumes:
      - neo4j-data:/var/lib/neo4j/data
      - neo4j-logs:/var/lib/neo4j/logs
    healthcheck:
      test: ["CMD", "cypher-shell", "-u", "neo4j", "-p", "testpassword123", "RETURN 1"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - mdn-network

volumes:
  neo4j-data:
  neo4j-logs:

networks:
  mdn-network:
    driver: bridge
```

### Usage

```powershell
# Start services
docker-compose -f docker-compose.test.yml up -d

# Wait for health check to pass
Start-Sleep -Seconds 15

# Run tests
npm test

# Stop services
docker-compose -f docker-compose.test.yml down

# Clean up volumes
docker-compose -f docker-compose.test.yml down -v
```

---

## Common Docker Commands

```powershell
# View logs
docker logs mdn-neo4j-test

# Follow logs (live)
docker logs -f mdn-neo4j-test

# Connect to Neo4j shell
docker exec -it mdn-neo4j-test cypher-shell -u neo4j -p testpassword123

# Clear database
docker exec mdn-neo4j-test cypher-shell -u neo4j -p testpassword123 `
  "MATCH (n) DETACH DELETE n"

# Count nodes
docker exec mdn-neo4j-test cypher-shell -u neo4j -p testpassword123 `
  "MATCH (n) RETURN COUNT(n) as nodeCount"

# Stop container
docker stop mdn-neo4j-test

# Start container
docker start mdn-neo4j-test

# Remove container
docker rm mdn-neo4j-test

# View container stats
docker stats mdn-neo4j-test
```

---

## Troubleshooting Docker

### Problem: Port Already in Use

```powershell
# Find what's using port 7687
netstat -ano | findstr :7687

# Kill process (replace PID)
taskkill /PID <PID> /F

# Or use different port
docker run -d `
  --name mdn-neo4j-test `
  -p 7690:7687 `
  -p 7475:7474 `
  -e NEO4J_AUTH=neo4j/testpassword123 `
  neo4j:latest
```

### Problem: Container Won't Start

```powershell
# Check logs
docker logs mdn-neo4j-test

# Check Docker daemon
docker info

# Restart Docker Desktop (Windows/Mac)
# Or restart docker service (Linux):
sudo systemctl restart docker
```

### Problem: Connection Timeout

```powershell
# Verify container is running
docker ps | findstr neo4j

# Check network
docker network inspect bridge

# Try with explicit host binding
docker run -d `
  --name mdn-neo4j-test `
  -p 127.0.0.1:7687:7687 `
  -e NEO4J_AUTH=neo4j/testpassword123 `
  neo4j:latest
```

---

## Performance Tips

### Increase Memory

```powershell
docker run -d `
  --name mdn-neo4j-test `
  -p 7687:7687 `
  -e NEO4J_AUTH=neo4j/testpassword123 `
  -e NEO4J_server_memory_heap_max__size=4G `
  -e NEO4J_server_memory_pagecache_size=2G `
  --memory="8g" `
  neo4j:latest
```

### Use Volume Mounts for Persistence

```powershell
# Create volume
docker volume create neo4j-data

# Run with volume
docker run -d `
  --name mdn-neo4j-test `
  -p 7687:7687 `
  -e NEO4J_AUTH=neo4j/testpassword123 `
  -v neo4j-data:/var/lib/neo4j/data `
  neo4j:latest
```

### Multi-Stage Testing

```powershell
# Stage 1: Unit tests
npm test test/v2-schema.test.js

# Stage 2: Integration tests
npm test test/database.test.js

# Stage 3: Performance tests
node test-performance.js

# Stage 4: Migration tests
node test-v2-migration.js
```

---

## Complete Testing Workflow with Docker

```powershell
# Step 1: Start Neo4j
Write-Host "Starting Neo4j..." -ForegroundColor Cyan
docker run -d `
  --name mdn-neo4j-test `
  -p 7687:7687 `
  -p 7474:7474 `
  -e NEO4J_AUTH=neo4j/testpassword123 `
  neo4j:latest

# Wait for startup
Write-Host "Waiting for Neo4j to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Step 2: Set environment
$env:HTTPOBS_DATABASE_TYPE = "neo4j"
$env:NEO4J_URI = "neo4j://localhost:7687"
$env:NEO4J_USERNAME = "neo4j"
$env:NEO4J_PASSWORD = "testpassword123"

# Step 3: Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install

# Step 4: Run tests
Write-Host "Running tests..." -ForegroundColor Cyan
npm test

# Step 5: Clean up
Write-Host "Cleaning up..." -ForegroundColor Cyan
docker stop mdn-neo4j-test
docker rm mdn-neo4j-test

Write-Host "Done!" -ForegroundColor Green
```

Save as `run-tests.ps1` and run with:
```powershell
.\run-tests.ps1
```

---

## Docker Desktop GUI

### Alternative: Use Docker Desktop UI

1. Open Docker Desktop
2. Go to "Images" tab
3. Search for "neo4j"
4. Click "Pull" to download latest image
5. Go to "Containers" tab
6. Click "Run" to start container
7. Configure:
   - Container name: `mdn-neo4j-test`
   - Ports: `7687:7687`, `7474:7474`
   - Environment: `NEO4J_AUTH=neo4j/testpassword123`
8. Click "Run"
9. Monitor in "Containers" tab

---

## Quick Reference

| Task | Command |
|------|---------|
| **Start Neo4j** | `docker run -d --name mdn-neo4j-test -p 7687:7687 -e NEO4J_AUTH=neo4j/pass neo4j:latest` |
| **Stop Neo4j** | `docker stop mdn-neo4j-test` |
| **View logs** | `docker logs -f mdn-neo4j-test` |
| **Connect shell** | `docker exec -it mdn-neo4j-test cypher-shell -u neo4j -p pass` |
| **Clear DB** | `docker exec mdn-neo4j-test cypher-shell -u neo4j -p pass "MATCH (n) DETACH DELETE n"` |
| **Remove container** | `docker rm mdn-neo4j-test` |
| **Test connection** | `npm test -- --grep "Neo4j"` |

---

**Status:** Ready to test with Docker
**Time to setup:** 5 minutes
**System requirements:** Docker + 4GB free memory
