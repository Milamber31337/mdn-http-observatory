import neo4j from "neo4j-driver";
import { CONFIG } from "../../config.js";
import { ALGORITHM_VERSION } from "../../constants.js";

/**
 * Neo4j Database Adapter
 * Implements the DatabaseAdapter interface using Neo4j AuraDB
 */
export class Neo4jAdapter {
  /** @type {neo4j.Driver | null} */
  driver = null;

  /** @type {neo4j.Session | null} */
  session = null;

  /**
   * @param {Object} config
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * @enum { string } ScanState
   */
  static ScanState = {
    ABORTED: "ABORTED",
    FAILED: "FAILED",
    FINISHED: "FINISHED",
    PENDING: "PENDING",
    STARTING: "STARTING",
    RUNNING: "RUNNING",
  };

  /**
   * Initialize Neo4j driver and connection
   * @returns {neo4j.Driver}
   */
  createPool() {
    const uri = CONFIG.database.neo4j?.uri || "neo4j+s://localhost";
    const username = CONFIG.database.neo4j?.username || "neo4j";
    const password = CONFIG.database.neo4j?.password || "";

    this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
      maxConnectionPoolSize: 40,
      connectionTimeoutMillis: 2000,
      maxRetryTimeMs: 30000,
    });

    this.session = this.driver.session({
      database: CONFIG.database.neo4j?.database || "neo4j",
    });

    return this.driver;
  }

  /**
   * Create indexes and constraints for optimal performance
   * @returns {Promise<void>}
   */
  async initializeSchema() {
    if (!this.session) {
      throw new Error("Neo4j session not initialized");
    }

    const queries = [
      // Constraints
      `CREATE CONSTRAINT IF NOT EXISTS FOR (s:Site) REQUIRE s.domain IS UNIQUE`,
      `CREATE CONSTRAINT IF NOT EXISTS FOR (scan:Scan) REQUIRE scan.id IS UNIQUE`,
      `CREATE CONSTRAINT IF NOT EXISTS FOR (test:TestResult) REQUIRE test.id IS UNIQUE`,

      // Indexes for common queries
      `CREATE INDEX IF NOT EXISTS FOR (s:Site) ON (s.creationTime)`,
      `CREATE INDEX IF NOT EXISTS FOR (scan:Scan) ON (scan.state)`,
      `CREATE INDEX IF NOT EXISTS FOR (scan:Scan) ON (scan.startTime)`,
      `CREATE INDEX IF NOT EXISTS FOR (scan:Scan) ON (scan.endTime)`,
      `CREATE INDEX IF NOT EXISTS FOR (scan:Scan) ON (scan.algorithmVersion)`,
      `CREATE INDEX IF NOT EXISTS FOR (scan:Scan) ON (scan.grade)`,
      `CREATE INDEX IF NOT EXISTS FOR (scan:Scan) ON (scan.score)`,
      `CREATE INDEX IF NOT EXISTS FOR (test:TestResult) ON (test.name)`,
    ];

    for (const query of queries) {
      try {
        await this.session.run(query);
      } catch (error) {
        // Index might already exist, continue
        console.warn(`Schema initialization warning: ${error.message}`);
      }
    }
  }

  /**
   * @param {neo4j.Driver} driver
   * @param {number} siteId
   * @returns {Promise<any>}
   */
  async insertScan(driver, siteId) {
    const timestamp = Date.now();
    const result = await this.session.run(
      `
      MATCH (s:Site {id: $siteId})
      CREATE (scan:Scan {
        id: randomUuid(),
        siteId: $siteId,
        state: $state,
        startTime: $startTime,
        testsFailed: 0,
        testsPassed: 0,
        testsQuantity: 0,
        algorithmVersion: $algorithmVersion
      })
      CREATE (s)-[:HAS_SCAN]->(scan)
      RETURN scan
      `,
      {
        siteId,
        state: Neo4jAdapter.ScanState.RUNNING,
        startTime: timestamp,
        algorithmVersion: ALGORITHM_VERSION,
      }
    );

    const record = result.records[0];
    if (!record) {
      throw new Error(`Site not found: ${siteId}`);
    }

    const scan = record.get("scan").properties;
    return {
      id: scan.id,
      site_id: scan.siteId,
      state: scan.state,
      start_time: new Date(scan.startTime),
      end_time: null,
      tests_failed: scan.testsFailed,
      tests_passed: scan.testsPassed,
      tests_quantity: scan.testsQuantity,
      grade: null,
      score: null,
      error: null,
      algorithm_version: scan.algorithmVersion,
    };
  }

  /**
   * @param {neo4j.Driver} driver
   * @param {number} siteId
   * @param {string} scanId
   * @param {import("../../types.js").ScanResult} scanResult
   * @returns {Promise<any>}
   */
  async insertTestResults(driver, siteId, scanId, scanResult) {
    const scan = scanResult.scan;
    const timestamp = Date.now();

    // Create test result nodes
    const testQueries = Object.entries(scanResult.tests).map(([name, test]) => {
      const t = { ...test };
      delete t.expectation;
      delete t.pass;
      delete t.result;
      delete t.scoreModifier;
      delete t.scoreDescription;

      return {
        name,
        expectation: test.expectation,
        result: test.result,
        pass: test.pass,
        scoreModifier: test.scoreModifier,
        output: JSON.stringify(t),
      };
    });

    for (const testData of testQueries) {
      await this.session.run(
        `
        MATCH (scan:Scan {id: $scanId})
        CREATE (test:TestResult {
          id: randomUuid(),
          scanId: $scanId,
          name: $name,
          expectation: $expectation,
          result: $result,
          pass: $pass,
          scoreModifier: $scoreModifier,
          output: $output
        })
        CREATE (scan)-[:HAS_TEST]->(test)
        `,
        {
          scanId,
          name: testData.name,
          expectation: testData.expectation,
          result: testData.result,
          pass: testData.pass,
          scoreModifier: testData.scoreModifier,
          output: testData.output,
        }
      );
    }

    // Update scan record
    const state =
      scan.score !== null
        ? Neo4jAdapter.ScanState.FINISHED
        : Neo4jAdapter.ScanState.FAILED;

    const result = await this.session.run(
      `
      MATCH (scan:Scan {id: $scanId})
      SET scan.endTime = $endTime,
          scan.testsFailed = $testsFailed,
          scan.testsPassed = $testsPassed,
          scan.grade = $grade,
          scan.score = $score,
          scan.state = $state,
          scan.responseHeaders = $responseHeaders,
          scan.statusCode = $statusCode,
          scan.testsQuantity = $testsQuantity,
          scan.error = $error
      RETURN scan
      `,
      {
        scanId,
        endTime: timestamp,
        testsFailed: scan.testsFailed,
        testsPassed: scan.testsPassed,
        grade: scan.grade,
        score: scan.score,
        state,
        responseHeaders: JSON.stringify(scan.responseHeaders),
        statusCode: scan.statusCode,
        testsQuantity: scan.testsQuantity,
        error: scan.error,
      }
    );

    const record = result.records[0];
    const updatedScan = record.get("scan").properties;
    return {
      id: updatedScan.id,
      site_id: updatedScan.siteId,
      state: updatedScan.state,
      start_time: new Date(updatedScan.startTime),
      end_time: updatedScan.endTime ? new Date(updatedScan.endTime) : null,
      tests_failed: updatedScan.testsFailed,
      tests_passed: updatedScan.testsPassed,
      tests_quantity: updatedScan.testsQuantity,
      grade: updatedScan.grade,
      score: updatedScan.score,
      error: updatedScan.error,
      algorithm_version: updatedScan.algorithmVersion,
    };
  }

  /**
   * @param {neo4j.Driver} driver
   * @param {string} siteKey
   * @returns {Promise<number>}
   */
  async ensureSite(driver, siteKey) {
    // Check if site exists
    const existing = await this.session.run(
      `MATCH (s:Site {domain: $domain}) RETURN s.id as id ORDER BY s.creationTime DESC LIMIT 1`,
      { domain: siteKey }
    );

    if (existing.records.length > 0) {
      return existing.records[0].get("id");
    }

    // Create new site
    const siteId = siteKey.replace(/[^a-zA-Z0-9]/g, "_") + "_" + Date.now();
    const result = await this.session.run(
      `
      CREATE (s:Site {
        id: $siteId,
        domain: $domain,
        creationTime: $creationTime
      })
      RETURN s.id as id
      `,
      {
        siteId,
        domain: siteKey,
        creationTime: Date.now(),
      }
    );

    return result.records[0].get("id");
  }

  /**
   * @param {neo4j.Driver} driver
   * @param {number} siteId
   * @returns {Promise<any[]>}
   */
  async selectScanHostHistory(driver, siteId) {
    const result = await this.session.run(
      `
      MATCH (s:Site {id: $siteId})-[:HAS_SCAN]->(scan:Scan)
      WHERE scan.state = $state AND scan.score IS NOT NULL
      WITH scan
      ORDER BY scan.startTime
      WITH collect(scan) as scans
      UNWIND range(0, size(scans)-2) AS idx
      WITH scans[idx] as prev, scans[idx+1] as curr
      WHERE prev.score IS DISTINCT FROM curr.score
      RETURN {
        id: curr.id,
        grade: curr.grade,
        score: curr.score,
        end_time: datetime({epochMillis: curr.startTime}),
        end_time_unix_timestamp: toInteger(curr.startTime / 1000)
      } as history
      ORDER BY history.end_time
      `,
      { siteId, state: Neo4jAdapter.ScanState.FINISHED }
    );

    return result.records.map((record) => record.get("history"));
  }

  /**
   * @param {neo4j.Driver} driver
   * @param {number} scanId
   * @returns {Promise<any>}
   */
  async selectScan(driver, scanId) {
    const result = await this.session.run(
      `MATCH (scan:Scan {id: $scanId}) RETURN scan`,
      { scanId }
    );

    if (result.records.length === 0) {
      return undefined;
    }

    const scan = result.records[0].get("scan").properties;
    return {
      id: scan.id,
      site_id: scan.siteId,
      state: scan.state,
      start_time: new Date(scan.startTime),
      end_time: scan.endTime ? new Date(scan.endTime) : null,
      tests_failed: scan.testsFailed,
      tests_passed: scan.testsPassed,
      tests_quantity: scan.testsQuantity,
      grade: scan.grade,
      score: scan.score,
      error: scan.error,
      algorithm_version: scan.algorithmVersion,
    };
  }

  /**
   * @param {neo4j.Driver} driver
   * @param {number} siteId
   * @param {number} recentInSeconds
   * @returns {Promise<any>}
   */
  async selectScanRecentScan(driver, siteId, recentInSeconds = 60) {
    const cutoffTime = Date.now() - recentInSeconds * 1000;

    const result = await this.session.run(
      `
      MATCH (s:Site {id: $siteId})-[:HAS_SCAN]->(scan:Scan)
      WHERE scan.state = $state AND scan.startTime >= $cutoffTime
      RETURN scan
      ORDER BY scan.startTime DESC
      LIMIT 1
      `,
      {
        siteId,
        state: Neo4jAdapter.ScanState.FINISHED,
        cutoffTime,
      }
    );

    if (result.records.length === 0) {
      return undefined;
    }

    const scan = result.records[0].get("scan").properties;
    return this._mapScanRow(scan);
  }

  /**
   * @param {neo4j.Driver} driver
   * @param {string} host
   * @param {number} maxAge
   * @returns {Promise<any>}
   */
  async selectScanLatestScanByHost(driver, host, maxAge = 86400) {
    const cutoffTime = Date.now() - maxAge * 1000;

    const result = await this.session.run(
      `
      MATCH (s:Site {domain: $host})-[:HAS_SCAN]->(scan:Scan)
      WHERE scan.state = $state AND scan.startTime >= $cutoffTime
      RETURN scan
      ORDER BY scan.startTime DESC
      LIMIT 1
      `,
      {
        host,
        state: Neo4jAdapter.ScanState.FINISHED,
        cutoffTime,
      }
    );

    if (result.records.length === 0) {
      return undefined;
    }

    const scan = result.records[0].get("scan").properties;
    return this._mapScanRow(scan);
  }

  /**
   * @param {neo4j.Driver} driver
   * @param {number} scanId
   * @returns {Promise<any>}
   */
  async selectScanById(driver, scanId) {
    const result = await this.session.run(
      `
      MATCH (scan:Scan {id: $scanId})
      WHERE scan.state = $state
      RETURN scan
      LIMIT 1
      `,
      { scanId, state: Neo4jAdapter.ScanState.FINISHED }
    );

    if (result.records.length === 0) {
      return undefined;
    }

    const scan = result.records[0].get("scan").properties;
    return this._mapScanRow(scan);
  }

  /**
   * @param {neo4j.Driver} driver
   * @param {number} scanId
   * @returns {Promise<any[]>}
   */
  async selectTestResults(driver, scanId) {
    const result = await this.session.run(
      `
      MATCH (scan:Scan {id: $scanId})-[:HAS_TEST]->(test:TestResult)
      RETURN test
      `,
      { scanId }
    );

    return result.records.map((record) => {
      const test = record.get("test").properties;
      return {
        id: test.id,
        scan_id: test.scanId,
        name: test.name,
        expectation: test.expectation,
        result: test.result,
        pass: test.pass,
        output: test.output,
        score_modifier: test.scoreModifier,
      };
    });
  }

  /**
   * @param {neo4j.Driver} driver
   * @param {number} scanId
   * @param {string} state
   * @param {string | null} error
   * @returns {Promise<any>}
   */
  async updateScanState(driver, scanId, state, error = null) {
    const updateProps = { state, endTime: error ? Date.now() : null };
    if (error) {
      updateProps.error = error;
    }

    const result = await this.session.run(
      `
      MATCH (scan:Scan {id: $scanId})
      SET scan += $props
      RETURN scan
      `,
      { scanId, props: updateProps }
    );

    const scan = result.records[0].get("scan").properties;
    return this._mapScanRow(scan);
  }

  /**
   * @param {neo4j.Driver} driver
   * @returns {Promise<any[]>}
   */
  async selectGradeDistribution(driver) {
    const result = await this.session.run(
      `
      MATCH (scan:Scan)
      WHERE scan.state = $state AND scan.grade IS NOT NULL
      WITH scan.grade as grade, count(*) as count
      RETURN {grade: grade, count: count} as distribution
      ORDER BY 
        CASE grade
          WHEN 'A+' THEN 0
          WHEN 'A' THEN 1
          WHEN 'A-' THEN 2
          WHEN 'B+' THEN 3
          WHEN 'B' THEN 4
          WHEN 'B-' THEN 5
          WHEN 'C+' THEN 6
          WHEN 'C' THEN 7
          WHEN 'C-' THEN 8
          WHEN 'D+' THEN 9
          WHEN 'D' THEN 10
          WHEN 'D-' THEN 11
          WHEN 'F' THEN 12
        END
      `,
      { state: Neo4jAdapter.ScanState.FINISHED }
    );

    return result.records.map((record) => record.get("distribution"));
  }

  /**
   * Neo4j doesn't have materialized views, so this is a no-op
   * Aggregate stats can be computed on-demand
   * @returns {Promise<void>}
   */
  async refreshMaterializedViews() {
    // No-op for Neo4j
    return;
  }

  /**
   * Run Neo4j schema initialization
   * @returns {Promise<void>}
   */
  async migrate() {
    await this.initializeSchema();
  }

  /**
   * Close the Neo4j driver connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.session) {
      await this.session.close();
    }
    if (this.driver) {
      await this.driver.close();
    }
  }

  /**
   * Helper to map Neo4j scan node to scan row format
   * @private
   * @param {any} scan
   * @returns {any}
   */
  _mapScanRow(scan) {
    return {
      id: scan.id,
      site_id: scan.siteId,
      state: scan.state,
      start_time: new Date(scan.startTime),
      end_time: scan.endTime ? new Date(scan.endTime) : null,
      tests_failed: scan.testsFailed,
      tests_passed: scan.testsPassed,
      tests_quantity: scan.testsQuantity,
      grade: scan.grade,
      score: scan.score,
      error: scan.error,
      algorithm_version: scan.algorithmVersion,
    };
  }
}
