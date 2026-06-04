/**
 * config-loader-mobile.js
 * 
 * Mobile app configuration loader for Cordova/hybrid apps
 * Provides access to build configuration and preferences
 * 
 * This script should be included in www/index.html before app initialization:
 * <script src="js/config-loader-mobile.js"></script>
 * 
 * Usage:
 * // Access config globally
 * const appName = window.cordovaAppConfig.APP_NAME;
 * const apiHost = window.cordovaAppConfig.API_HOSTNAME;
 * 
 * // Or use helper methods
 * const config = window.CordovaConfigLoader.getConfig();
 * const pref = window.CordovaConfigLoader.getPreference('ENVIRONMENT');
 */

(function(window) {
  'use strict';

  // Default configuration object
  const defaultConfig = {
    APP_NAME: 'MyApp',
    VERSION_NUMBER: '1.0.0',
    VERSION_CODE: '1',
    ENVIRONMENT: 'production',
    API_HOSTNAME: 'api.example.com',
    WEBVIEW_BACKGROUND_COLOR: '#FFFFFF',
    timestamp: new Date().toISOString(),
    preferences: {},
    metadata: {}
  };

  /**
   * Load config from build-config.json
   */
  function loadBuildConfig() {
    return new Promise((resolve, reject) => {
      // Try to load from www/.cordova-app-data/build-config.json
      fetch('.cordova-app-data/build-config.json')
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return response.json();
        })
        .then(config => {
          // Merge with defaults
          const merged = { ...defaultConfig, ...config };
          resolve(merged);
        })
        .catch(err => {
          console.warn('Failed to load build config, using defaults:', err.message);
          resolve(defaultConfig);
        });
    });
  }

  /**
   * Get config value by key
   */
  function getConfig(key) {
    const config = window.cordovaAppConfig || defaultConfig;
    return key ? config[key] : config;
  }

  /**
   * Get preference value from config
   */
  function getPreference(key) {
    const config = window.cordovaAppConfig || defaultConfig;
    return config.preferences ? config.preferences[key] : undefined;
  }

  /**
   * Get build information
   */
  function getBuildInfo() {
    const config = window.cordovaAppConfig || defaultConfig;
    return {
      timestamp: config.timestamp,
      version: config.VERSION_NUMBER,
      buildNumber: config.VERSION_CODE,
      environment: config.ENVIRONMENT
    };
  }

  /**
   * Initialize configuration
   */
  function init() {
    // First, set up default config
    window.cordovaAppConfig = { ...defaultConfig };

    // Try to load from file
    loadBuildConfig()
      .then(config => {
        window.cordovaAppConfig = config;
        console.log('✅ Build config loaded successfully');
        
        // Dispatch event for app initialization
        const event = new CustomEvent('cordova-config-ready', {
          detail: { config: config }
        });
        document.dispatchEvent(event);
      })
      .catch(err => {
        console.error('❌ Error loading build config:', err);
      });
  }

  /**
   * Public API
   */
  window.CordovaConfigLoader = {
    getConfig,
    getPreference,
    getBuildInfo,
    loadBuildConfig,
    init
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
