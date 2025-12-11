/**
 * Abstract database adapter interface
 * Defines the contract that all database implementations must follow
 * @typedef {Object} DatabaseAdapter
 * @property {Function} createPool - Initialize connection pool/driver
 * @property {Function} insertScan - Insert a new scan record
 * @property {Function} insertTestResults - Insert test results and update scan
 * @property {Function} ensureSite - Get or create a site by domain
 * @property {Function} selectScan - Get scan by ID
 * @property {Function} selectScanLatestScanByHost - Get most recent scan for a host
 * @property {Function} selectScanById - Get scan by ID with finished state check
 * @property {Function} selectTestResults - Get all test results for a scan
 * @property {Function} updateScanState - Update scan state and optionally error
 * @property {Function} selectScanHostHistory - Get historical score changes for a site
 * @property {Function} selectGradeDistribution - Get distribution of grades
 * @property {Function} refreshMaterializedViews - Refresh materialized views (if applicable)
 * @property {Function} migrate - Run migrations/schema initialization
 * @property {Function} close - Close connections
 */

/**
 * Database adapter factory - returns the appropriate adapter based on config
 * @param {Object} config - Database configuration
 * @returns {DatabaseAdapter}
 */
export async function createDatabaseAdapter(config) {
  if (config.database.type === "neo4j") {
    const { Neo4jAdapter } = await import("./adapters/neo4j.js");
    return new Neo4jAdapter(config);
  }
  // Default to PostgreSQL
  const { PostgreSQLAdapter } = await import("./adapters/postgresql.js");
  return new PostgreSQLAdapter(config);
}

export const ScanState = {
  ABORTED: "ABORTED",
  FAILED: "FAILED",
  FINISHED: "FINISHED",
  PENDING: "PENDING",
  STARTING: "STARTING",
  RUNNING: "RUNNING",
};

export const ALGORITHM_VERSION = 4;
