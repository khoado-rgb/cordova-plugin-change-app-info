var exec = require('cordova/exec');

var SecureTotpPlugin = {

    /**
     * Step 1: Get the device public key (Base64 PEM) to send to the server.
     */
    getPublicKey: function(successCallback, errorCallback) {
        exec(successCallback, errorCallback, 'SecureTotpPlugin', 'getPublicKey', []);
    },

    /**
     * Step 2: Send the server-encrypted secret to native storage.
     */
    setEncryptedSecret: function(encryptedSecretBase64, successCallback, errorCallback) {
        if (!encryptedSecretBase64 || typeof encryptedSecretBase64 !== 'string' || encryptedSecretBase64.length < 50) {
            if (errorCallback) errorCallback("Dữ liệu mã hóa không hợp lệ.");
            return;
        }

        (function(cipherToSend) {
            exec(
                function(successMsg) {
                    cipherToSend = null; // Garbage Collection
                    if (successCallback) successCallback(successMsg);
                },
                function(errorMsg) {
                    cipherToSend = null; // Garbage Collection
                    if (errorCallback) errorCallback(errorMsg);
                },
                'SecureTotpPlugin', 
                'setEncryptedSecret', 
                [cipherToSend]
            );
        })(encryptedSecretBase64);
    },

    /**
     * Step 3: Get a 6-digit TOTP code (SHA-256).
     */
    getTotpCode: function(expired, timeOffset, successCallback, errorCallback) {
        exec(successCallback, errorCallback, 'SecureTotpPlugin', 'getTotpCode', [expired, timeOffset]);
    }
};

module.exports = SecureTotpPlugin;
