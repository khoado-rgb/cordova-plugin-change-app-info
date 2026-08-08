/**
 * CSSInjector Plugin
 * 
 * Runtime CSS injection from CDN-downloaded file
 * Native code reads CSS from www/assets/cdn-styles.css and injects into WebView
 * 
 * Usage:
 *   CSSInjector.injectCSS(successCallback, errorCallback);
 * 
 * Note: CSS is automatically injected when plugin initializes.
 * This manual method is only needed if you want to re-inject CSS at runtime.
 */

var exec = require('cordova/exec');

var CSSInjector = {
    /**
     * Inject CSS into WebView
     * @param {Function} successCallback - Called when CSS is injected
     * @param {Function} errorCallback - Called if injection fails
     */
    injectCSS: function(successCallback, errorCallback) {
        exec(successCallback, errorCallback, 'CSSInjector', 'injectCSS', []);
    },

    /**
     * Build configuration injected by native code before the page loads.
     * Synchronous, and stable across SPA screen changes because it lives on
     * window rather than in the document being replaced.
     *
     * @returns {Object} config, or {} when native has not injected yet
     */
    getConfig: function() {
        return window.CORDOVA_BUILD_CONFIG || window.AppConfig || {};
    },

    /**
     * Brand colour extracted at build time from the CDN stylesheet.
     *
     * @returns {String|null} hex colour, e.g. "#1A2B3C"
     */
    getPrimaryColor: function() {
        return this.getConfig().primaryColor || null;
    },

    /**
     * Run a callback once the config is available.
     *
     * Native injects at document start, so on a screen that loads later the
     * config is usually already there — the callback then fires immediately
     * instead of waiting for an event that has long since been dispatched.
     *
     * @param {Function} callback - receives the config object
     */
    onConfigReady: function(callback) {
        if (typeof callback !== 'function') {
            return;
        }

        var config = this.getConfig();

        if (config && config.primaryColor !== undefined) {
            callback(config);
            return;
        }

        window.addEventListener('cordova-config-ready', function handler(event) {
            window.removeEventListener('cordova-config-ready', handler);
            callback((event && event.detail) || {});
        });
    }
};

module.exports = CSSInjector;
