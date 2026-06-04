#!/usr/bin/env node

/**
 * Config Storage Utility
 * Stores build configuration and app metadata in JSON files
 * Alternative to sqlite3 for cloud builds where native modules may fail
 * 
 * Usage:
 *   const storage = require('./config-storage');
 *   storage.saveBuildConfig({ appName: 'My App', appId: 'com.example.app' });
 *   const config = storage.loadBuildConfig();
 */

const fs = require('fs');
const path = require('path');

class ConfigStorage {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.dataDir = path.join(projectRoot, '.cordova-app-data');
    this.configFile = path.join(this.dataDir, 'build-config.json');
    this.historyFile = path.join(this.dataDir, 'build-history.json');
    
    // Ensure data directory exists
    this.ensureDirectory();
  }

  /**
   * Ensure data directory exists
   */
  ensureDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Save build configuration
   */
  saveBuildConfig(config) {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        config: config,
        version: '1.0'
      };

      fs.writeFileSync(this.configFile, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[Config Storage] ✓ Build config saved to ${this.configFile}`);
      return true;
    } catch (error) {
      console.error(`[Config Storage] Error saving config: ${error.message}`);
      return false;
    }
  }

  /**
   * Load build configuration
   */
  loadBuildConfig() {
    try {
      if (!fs.existsSync(this.configFile)) {
        console.log(`[Config Storage] Config file not found: ${this.configFile}`);
        return null;
      }

      const content = fs.readFileSync(this.configFile, 'utf8');
      const data = JSON.parse(content);
      console.log(`[Config Storage] ✓ Build config loaded (${data.timestamp})`);
      return data.config;
    } catch (error) {
      console.error(`[Config Storage] Error loading config: ${error.message}`);
      return null;
    }
  }

  /**
   * Save app metadata
   */
  saveAppMetadata(metadata) {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        metadata: metadata,
        version: '1.0'
      };

      fs.writeFileSync(this.configFile, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[Config Storage] ✓ App metadata saved`);
      return true;
    } catch (error) {
      console.error(`[Config Storage] Error saving metadata: ${error.message}`);
      return false;
    }
  }

  /**
   * Add to build history
   */
  addBuildHistory(entry) {
    try {
      let history = [];

      if (fs.existsSync(this.historyFile)) {
        const content = fs.readFileSync(this.historyFile, 'utf8');
        const data = JSON.parse(content);
        history = data.history || [];
      }

      // Add new entry with timestamp
      history.push({
        timestamp: new Date().toISOString(),
        ...entry
      });

      // Keep only last 50 builds
      if (history.length > 50) {
        history = history.slice(-50);
      }

      const data = {
        version: '1.0',
        count: history.length,
        lastUpdated: new Date().toISOString(),
        history: history
      };

      fs.writeFileSync(this.historyFile, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[Config Storage] ✓ Build history updated (${history.length} entries)`);
      return true;
    } catch (error) {
      console.error(`[Config Storage] Error adding to history: ${error.message}`);
      return false;
    }
  }

  /**
   * Get build history
   */
  getBuildHistory(limit = 10) {
    try {
      if (!fs.existsSync(this.historyFile)) {
        return [];
      }

      const content = fs.readFileSync(this.historyFile, 'utf8');
      const data = JSON.parse(content);
      const history = data.history || [];

      // Return most recent first
      return history.slice(-limit).reverse();
    } catch (error) {
      console.error(`[Config Storage] Error reading history: ${error.message}`);
      return [];
    }
  }

  /**
   * Get last build config
   */
  getLastBuildConfig() {
    try {
      const history = this.getBuildHistory(1);
      if (history.length > 0) {
        return history[0];
      }
      return null;
    } catch (error) {
      console.error(`[Config Storage] Error getting last config: ${error.message}`);
      return null;
    }
  }

  /**
   * Clear all stored data
   */
  clearAll() {
    try {
      if (fs.existsSync(this.dataDir)) {
        fs.rmSync(this.dataDir, { recursive: true, force: true });
        console.log(`[Config Storage] ✓ All data cleared`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[Config Storage] Error clearing data: ${error.message}`);
      return false;
    }
  }

  /**
   * Get storage info
   */
  getStorageInfo() {
    const info = {
      dataDir: this.dataDir,
      exists: fs.existsSync(this.dataDir),
      configFile: this.configFile,
      configExists: fs.existsSync(this.configFile),
      historyFile: this.historyFile,
      historyExists: fs.existsSync(this.historyFile)
    };

    if (info.configExists) {
      info.configSize = fs.statSync(this.configFile).size;
    }

    if (info.historyExists) {
      info.historySize = fs.statSync(this.historyFile).size;
    }

    return info;
  }
}

module.exports = ConfigStorage;
