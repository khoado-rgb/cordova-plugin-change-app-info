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
     * Re-apply the brand colour as a CSS custom property on :root.
     *
     * Native already does this at document start, and the inline declaration
     * survives SPA screen changes because documentElement is never replaced.
     * Call this only if something in the app clears the style attribute.
     *
     * @param {String} [variableName] - defaults to the name used at build time
     * @returns {Boolean} whether a colour was applied
     */
    applyPrimaryColor: function(variableName) {
        var config = this.getConfig();
        var color = config.primaryColor;
        var name = variableName || config.primaryColorVar;

        if (!color || !name || !/^--[a-zA-Z0-9_-]+$/.test(name)) {
            return false;
        }

        document.documentElement.style.setProperty(name, color, 'important');
        return true;
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
