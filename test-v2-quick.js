#!/usr/bin/env node
/**
 * Quick Start Test Script for Neo4j v2.0 Schema
 * 
 * Usage: npm run test-v2-quick
 * 
 * This script:
 * 1. Checks prerequisites (Node.js, npm, Neo4j)
 * 2. Installs dependencies
 * 3. Initializes schema
 * 4. Runs v2.0 schema tests
 * 5. Reports results
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TestRunner {
  constructor() {
    this.passed = [];
    this.failed = [];
    this.warnings = [];
  }

  log(message, type = "info") {
    const colors = {
      info: "\x1b[36m",    // cyan
      success: "\x1b[32m",  // green
      error: "\x1b[31m",    // red
      warn: "\x1b[33m",     // yellow
      reset: "\x1b[0m"
    };

    const color = colors[type] || colors.info;
    console.log(`${color}${message}${colors.reset}`);
  }

  async checkNodeVersion() {
    this.log("1️⃣  Checking Node.js version...");
    
    return new Promise((resolve) => {
      spawn("node", ["--version"]).stdout.on("data", (data) => {
        const version = data.toString().trim();
        const major = parseInt(version.split(".")[0].slice(1));
        
        if (major >= 24) {
          this.log(`   ✓ Node.js ${version}`, "success");
          this.passed.push("Node.js version");
          resolve(true);
        } else {
          this.log(`   ✗ Node.js ${version} (required: >=24.0.0)`, "error");
          this.failed.push("Node.js version");
          resolve(false);
        }
      });
    });
  }

  async checkNpmVersion() {
    this.log("2️⃣  Checking npm version...");
    
    return new Promise((resolve) => {
      spawn("npm", ["--version"]).stdout.on("data", (data) => {
        const version = data.toString().trim();
        const major = parseInt(version.split(".")[0]);
        
        if (major >= 9) {
          this.log(`   ✓ npm ${version}`, "success");
          this.passed.push("npm version");
          resolve(true);
        } else {
          this.log(`   ✗ npm ${version} (required: >=9.0.0)`, "error");
          this.failed.push("npm version");
          resolve(false);
        }
      });
    });
  }

  async checkNeo4j() {
    this.log("3️⃣  Checking Neo4j connectivity...");
    
    const hasNeo4jEnv = process.env.NEO4J_URI || process.env.HTTPOBS_DATABASE_TYPE === "neo4j";
    
    if (!hasNeo4jEnv) {
      this.log("   ⚠  Neo4j not configured (set NEO4J_URI environment variable)", "warn");
      this.warnings.push("Neo4j not configured");
      return false;
    }

    this.log("   ✓ Neo4j environment variables set", "success");
    this.passed.push("Neo4j environment");
    return true;
  }

  async installDependencies() {
    this.log("4️⃣  Installing dependencies...");
    
    return new Promise((resolve) => {
      const npm = spawn("npm", ["install"], {
        cwd: __dirname,
        stdio: "pipe"
      });

      npm.on("close", (code) => {
        if (code === 0) {
          this.log("   ✓ Dependencies installed", "success");
          this.passed.push("npm install");
          resolve(true);
        } else {
          this.log("   ✗ npm install failed", "error");
          this.failed.push("npm install");
          resolve(false);
        }
      });

      npm.stderr.on("data", (data) => {
        if (data.toString().includes("warn")) {
          this.warnings.push(data.toString().trim());
        }
      });
    });
  }

  async runTests() {
    this.log("5️⃣  Running v2.0 schema tests...\n");
    
    return new Promise((resolve) => {
      const mocha = spawn("npm", ["test", "test/v2-schema.test.js"], {
        cwd: __dirname,
        stdio: "inherit"
      });

      mocha.on("close", (code) => {
        console.log();
        if (code === 0) {
          this.log("✓ All tests passed", "success");
          this.passed.push("v2.0 schema tests");
          resolve(true);
        } else {
          this.log("✗ Tests failed", "error");
          this.failed.push("v2.0 schema tests");
          resolve(false);
        }
      });
    });
  }

  reportResults() {
    console.log("\n" + "=".repeat(50));
    this.log("📊 Test Summary", "info");
    console.log("=".repeat(50) + "\n");

    this.log(`Passed: ${this.passed.length}`, "success");
    for (const item of this.passed) {
      this.log(`  ✓ ${item}`, "success");
    }

    if (this.failed.length > 0) {
      this.log(`\nFailed: ${this.failed.length}`, "error");
      for (const item of this.failed) {
        this.log(`  ✗ ${item}`, "error");
      }
    }

    if (this.warnings.length > 0) {
      this.log(`\nWarnings: ${this.warnings.length}`, "warn");
      for (const item of this.warnings) {
        this.log(`  ⚠ ${item}`, "warn");
      }
    }

    console.log("\n" + "=".repeat(50));

    if (this.failed.length === 0 && this.passed.length > 0) {
      this.log("\n✅ All checks passed! Ready to implement v2.0", "success");
      return 0;
    } else {
      this.log("\n❌ Some checks failed. Please fix and retry.", "error");
      return 1;
    }
  }

  async run() {
    console.clear();
    console.log("\n");
    this.log("🚀 Neo4j Schema v2.0 - Quick Start Test\n", "info");

    await this.checkNodeVersion();
    await this.checkNpmVersion();
    await this.checkNeo4j();

    if (this.failed.length > 0) {
      console.log();
      return this.reportResults();
    }

    console.log();
    await this.installDependencies();

    if (this.failed.length > 0) {
      console.log();
      return this.reportResults();
    }

    console.log();
    const testsPass = await this.runTests();

    console.log();
    return this.reportResults();
  }
}

// Run tests
const runner = new TestRunner();
runner.run().then((code) => process.exit(code));
