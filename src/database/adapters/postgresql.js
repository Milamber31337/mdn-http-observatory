import { CONFIG } from "../../config.js";
import format from "pg-format";
import pg from "pg";
import { ALGORITHM_VERSION } from "../../constants.js";

// Use native bindings instead of standard bindings
// @ts-ignore - pg.native is optional and may not be in types
const { Pool } = pg.native || pg; // Fallback to standard pg if native not available

/**
 * PostgreSQL Database Adapter
 * Implements the DatabaseAdapter interface using PostgreSQL
 */
export class PostgreSQLAdapter {
  /** @type {import("pg").Pool | null} */
  pool = null;

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
   * @returns {import("pg").Pool}
   */
  createPool() {
    const poolOptions = {
      database: CONFIG.database.database,
      host: CONFIG.database.host,
      user: CONFIG.database.user,
      password: CONFIG.database.pass,
      port: CONFIG.database.port,
      ssl: CONFIG.database.sslmode,
      max: 40,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 2000,
      maxUses: 10000,
      native: true,
    };
    this.pool = new Pool(poolOptions);
    return this.pool;
  }

  /**
   * @param {import("pg").Pool} pool
   * @param {number} siteId
   * @returns {Promise<any>}
   */
  async insertScan(pool, siteId) {
    const result = await pool.query(
      `INSERT INTO scans (site_id, state, start_time, tests_quantity, algorithm_version)
        VALUES ($1, $2, NOW(), 0, $3)
        RETURNING *`,
      [siteId, PostgreSQLAdapter.ScanState.RUNNING, ALGORITHM_VERSION]
    );
    return result.rows[0];
  }

  /**
   * @param {import("pg").Pool} pool
   * @param {number} siteId
   * @param {number} scanId
   * @param {import("../../types.js").ScanResult} scanResult
   * @returns {Promise<any>}
   */
  async insertTestResults(pool, siteId, scanId, scanResult) {
    const testValues = Object.entries(scanResult.tests).map(([name, test]) => {
      const t = { ...test };
      const expectation = t.expectation;
      delete t.expectation;
      const pass = t.pass;
      delete t.pass;
      const result = t.result;
      delete t.result;
      const scoreModifier = t.scoreModifier;
      delete t.scoreModifier;
      delete t.scoreDescription;

      return [
        siteId,
        scanId,
        name,
        expectation,
        result,
        pass,
        JSON.stringify(t),
        scoreModifier,
      ];
    });

    if (Object.entries(testValues).length > 0) {
      const query = format(
        "INSERT INTO tests (site_id, scan_id, name, expectation, result, pass, output, score_modifier) VALUES %L",
        testValues
      );
      await pool.query(query, []);
    }

    const scan = scanResult.scan;
    const result = await pool.query(
      `UPDATE scans
        SET (end_time, tests_failed, tests_passed, grade, score,
        state, response_headers, status_code, algorithm_version, tests_quantity, error) =
        (NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        WHERE id = $11
        RETURNING *`,
      [
        scan.testsFailed,
        scan.testsPassed,
        scan.grade,
        scan.score,
        scan.score !== null ? PostgreSQLAdapter.ScanState.FINISHED : PostgreSQLAdapter.ScanState.FAILED,
        scan.responseHeaders,
        scan.statusCode,
        scan.algorithmVersion,
        scan.testsQuantity,
        scan.error,
        scanId,
      ]
    );

    return result.rows[0];
  }

  /**
   * @param {import("pg").Pool} pool
   * @param {string} siteKey
   * @returns {Promise<number>}
   */
  async ensureSite(pool, siteKey) {
    const result = await pool.query(
      `SELECT id FROM sites
        WHERE domain = $1
        ORDER BY creation_time DESC
        LIMIT 1`,
      [siteKey]
    );
    if (result.rowCount && result.rowCount > 0) {
      return result.rows[0]["id"];
    }

    const insert = await pool.query(
      `INSERT INTO sites (domain, creation_time)
        VALUES ($1, NOW())
        RETURNING id`,
      [siteKey]
    );
    return insert.rows[0]["id"];
  }

  /**
   * @param {import("pg").Pool} pool
   * @param {number} siteId
   * @returns {Promise<any[]>}
   */
  async selectScanHostHistory(pool, siteId) {
    const result = await pool.query(
      `
      SELECT id, grade, score, end_time, end_time_unix_timestamp
      FROM (
        SELECT id, grade, score, start_time as end_time,
          round(extract(epoch from start_time)) as end_time_unix_timestamp,
          LAG(score) OVER (ORDER BY end_time) AS prev_score
        FROM scans
        WHERE site_id=$1
        AND state=$2
      ) AS sq
      WHERE score IS DISTINCT FROM prev_score
      ORDER BY end_time ASC
      `,
      [siteId, PostgreSQLAdapter.ScanState.FINISHED]
    );
    return result.rows;
  }

  /**
   * @param {import("pg").Pool} pool
   * @param {number} scanId
   * @returns {Promise<any>}
   */
  async selectScan(pool, scanId) {
    const result = await pool.query(
      `SELECT * FROM scans WHERE id = $1`,
      [scanId]
    );
    return result.rows[0];
  }

  /**
   * @param {import("pg").Pool} pool
   * @param {number} siteId
   * @param {number} recentInSeconds
   * @returns {Promise<any>}
   */
  async selectScanRecentScan(pool, siteId, recentInSeconds = CONFIG.api.cooldown) {
    const result = await pool.query(
      `SELECT * FROM scans
        WHERE site_id = $1
        AND start_time >= NOW() - INTERVAL '${recentInSeconds} seconds'
        AND state = $2
        ORDER BY start_time DESC
        LIMIT 1`,
      [siteId, PostgreSQLAdapter.ScanState.FINISHED]
    );
    return result.rows[0];
  }

  /**
   * @param {import("pg").Pool} pool
   * @param {string} host
   * @param {number} maxAge
   * @returns {Promise<any>}
   */
  async selectScanLatestScanByHost(pool, host, maxAge = CONFIG.api.cacheTimeForGet) {
    const result = await pool.query(
      `SELECT scans.*
        FROM scans
        JOIN sites ON scans.site_id = sites.id
        WHERE sites.domain = $1
        AND start_time >= NOW() - INTERVAL '${maxAge} seconds'
        AND state = $2
        ORDER BY scans.start_time DESC
        LIMIT 1`,
      [host, PostgreSQLAdapter.ScanState.FINISHED]
    );
    return result.rows[0];
  }

  /**
   * @param {import("pg").Pool} pool
   * @param {number} scanId
   * @returns {Promise<any>}
   */
  async selectScanById(pool, scanId) {
    const result = await pool.query(
      `SELECT scans.* FROM scans WHERE scans.id = $1 AND state = $2 LIMIT 1`,
      [scanId, PostgreSQLAdapter.ScanState.FINISHED]
    );
    return result.rows[0];
  }

  /**
   * @param {import("pg").Pool} pool
   * @param {number} scanId
   * @returns {Promise<any[]>}
   */
  async selectTestResults(pool, scanId) {
    const result = await pool.query(
      `SELECT * FROM tests WHERE scan_id = $1`,
      [scanId]
    );
    return result.rows;
  }

  /**
   * @param {import("pg").Pool} pool
   * @param {number} scanId
   * @param {string} state
   * @param {string | null} error
   * @returns {Promise<any>}
   */
  async updateScanState(pool, scanId, state, error = null) {
    if (error) {
      const result = await pool.query(
        `UPDATE scans SET (state, end_time, error) = ($1, NOW(), $2) WHERE id = $3 RETURNING *`,
        [state, error, scanId]
      );
      return result.rows[0];
    } else {
      const result = await pool.query(
        `UPDATE scans SET state = $1 WHERE id = $2 RETURNING *`,
        [state, scanId]
      );
      return result.rows[0];
    }
  }

  /**
   * @param {import("pg").Pool} pool
   * @returns {Promise<any[]>}
   */
  async selectGradeDistribution(pool) {
    const result = await pool.query(
      `SELECT grade, count FROM grade_distribution
      ORDER BY array_position(array['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F'], grade) asc`,
      []
    );
    return result.rows;
  }

  /**
   * @param {import("pg").Pool} pool
   * @returns {Promise<any>}
   */
  async refreshMaterializedViews(pool) {
    return await pool.query(
      `REFRESH MATERIALIZED VIEW CONCURRENTLY grade_distribution`
    );
  }

  /**
   * Run database migrations
   * @param {string} version
   * @param {import("pg").Pool} pool
   * @returns {Promise<void>}
   */
  async migrate(version, pool) {
    const { migrateDatabase } = await import("./migrations.js");
    return migrateDatabase(version, pool);
  }

  /**
   * Close the connection pool
   * @returns {Promise<void>}
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
