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
    }
};

module.exports = CSSInjector;
