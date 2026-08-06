var exec = require('cordova/exec');

var UniversalLinks = {

    /**
     * Start receiving universal link / App Link URLs.
     *
     * The callback fires every time the app is opened through a registered
     * domain, including the link that cold-started the app (that one is
     * replayed as soon as you subscribe, so it is safe to call this late).
     *
     * The callback receives:
     *   { url, scheme, host, path, query, fragment, params }
     */
    subscribe: function(successCallback, errorCallback) {
        exec(successCallback, errorCallback, 'UniversalLinks', 'subscribe', []);
    },

    /**
     * Stop receiving URLs.
     */
    unsubscribe: function(successCallback, errorCallback) {
        exec(successCallback, errorCallback, 'UniversalLinks', 'unsubscribe', []);
    }
};

module.exports = UniversalLinks;
