var exec = require('cordova/exec');

var SecureTotpPlugin = {

    /**
     * BƯỚC 1: Lấy Public Key của thiết bị (Base64 PEM) để gửi cho Server
     */
    getPublicKey: function(successCallback, errorCallback) {
        exec(successCallback, errorCallback, 'SecureTotpPlugin', 'getPublicKey', []);
    },

    /**
     * BƯỚC 2: Nhận Secret đã bị Server mã hóa bằng Public Key, truyền xuống Native
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
     * BƯỚC 3: Lấy mã TOTP 6 số (SHA-256)
     */
    getTotpCode: function(expired, timeOffset, successCallback, errorCallback) {
        exec(successCallback, errorCallback, 'SecureTotpPlugin', 'getTotpCode', [expired, timeOffset]);
    }
};

module.exports = SecureTotpPlugin;