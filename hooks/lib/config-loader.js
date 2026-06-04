/**
 * config-loader.js
 * 
 * Build configuration loader for server-side/Node.js environments
 * Reads build-config.json and provides config access methods
 * 
 * Usage:
 * const { getConfig, getPreference } = require('./config-loader');
 * const appName = getConfig('APP_NAME');
 */

(function() {
  'use strict';

  // Detect environment
  const isNode = typeof module !== 'undefined' && module.exports;
  const isBrowser = typeof window !== 'undefined';
  const isReactNative = typeof global !== 'undefined' && global.navigator && global.navigator.product === 'ReactNative';

  /**
   * Parse build config JSON
   */
  function parseConfig(configData) {
    if (typeof configData === 'string') {
      try {
        return JSON.parse(configData);
      } catch (e) {
        console.error('Failed to parse config JSON:', e);
        return {};
      }
    }
    return configData || {};
  }

  /**
   * Get entire config object
   */
  function getConfig(key) {
    try {
      if (isNode) {
        const path = require('path');
        const fs = require('fs');
        const configPath = path.join(__dirname, '..', '..', '.cordova-app-data', 'build-config.json');
        if (fs.existsSync(configPath)) {
          const data = fs.readFileSync(configPath, 'utf8');
          const config = parseConfig(data);
          return key ? config[key] : config;
        }
      } else if (isBrowser || isReactNative) {
        // Browser/React Native environment
        if (window.cordovaConfig) {
          return key ? window.cordovaConfig[key] : window.cordovaConfig;
        }
      }
    } catch (e) {
      console.warn('Error loading config:', e.message);
    }
    return key ? undefined : {};
  }

  /**
   * Get preference value
   */
  function getPreference(key) {
    const config = getConfig();
    return config.preferences ? config.preferences[key] : undefined;
  }

  /**
   * Get build info (timestamp, version, etc.)
   */
  function getBuildInfo() {
    const config = getConfig();
    return {
      timestamp: config.timestamp,
      version: config.version,
      buildNumber: config.buildNumber,
      environment: config.environment
    };
  }

  /**
   * Get environment-specific config
   */
  function getEnvironmentConfig() {
    const config = getConfig();
    return config.environment ? config[config.environment] : {};
  }

  // Export for different environments
  if (isNode) {
    module.exports = {
      getConfig,
      getPreference,
      getBuildInfo,
      getEnvironmentConfig,
      parseConfig
    };
  } else if (isBrowser) {
    window.CordovaConfigLoader = {
      getConfig,
      getPreference,
      getBuildInfo,
      getEnvironmentConfig,
      parseConfig
    };
  }
})();
