import fp from "fastify-plugin";
import { createDatabaseAdapter } from "../database/adapter.js";
import { CONFIG } from "../config.js";

/**
 * Fastify plugin to support both PostgreSQL and Neo4j databases
 * Makes the database adapter available on fastify.db
 */
export default fp(async function (fastify) {
  const dbType = CONFIG.database.type || "postgresql";

  let db;
  try {
    db = await createDatabaseAdapter(CONFIG);
  } catch (error) {
    fastify.log.error(`Failed to create database adapter for ${dbType}:`, error);
    throw error;
  }

  // Initialize the database pool/driver
  try {
    db.createPool();
    fastify.log.info(`Database adapter initialized: ${dbType}`);
  } catch (error) {
    fastify.log.error(`Failed to initialize database pool:`, error);
    throw error;
  }

  // Register hook to close database connection on server shutdown
  fastify.addHook("onClose", async () => {
    try {
      await db.close();
      fastify.log.info("Database connection closed");
    } catch (error) {
      fastify.log.error("Error closing database connection:", error);
    }
  });

  // Make database adapter available to routes
  fastify.decorate("db", db);
});
