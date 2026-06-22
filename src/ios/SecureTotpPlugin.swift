import Foundation
import Security
import WebKit

// Cordova iOS import for MABS 12 builds
#if canImport(Cordova)
import Cordova
#endif

@objc(SecureTotpPlugin) 
class SecureTotpPlugin: CDVPlugin {
    private let minTotpPeriod = 5
    private let maxTotpPeriod = 300
    private let maxTimeOffsetSeconds = 86400
    
    // =========================================================================
    // Helper: validate the current WebView origin.
    // =========================================================================
    private func isSafeOrigin(_ url: URL?) -> Bool {
        guard let url = url else {
            return false
        }
        
        let scheme = url.scheme?.lowercased() ?? ""
        let host = url.host?.lowercased() ?? ""
        
        if scheme == "file" {
            let filePath = url.standardizedFileURL.path
            let bundlePath = Bundle.main.bundleURL.standardizedFileURL.path
            return filePath == bundlePath || filePath.hasPrefix(bundlePath + "/")
        }
        
        // Known safe schemes
        if scheme == "outsystems" || scheme == "ionic" { return true }
        
        // HTTPS localhost
        if scheme == "https" && host == "localhost" { return true }
        
        // Check configured hosts — compare exact host match to prevent
        // subdomain bypass (e.g., "evil-myhost.com" matching "myhost.com")
        let osDefaultHost = (self.commandDelegate.settings["defaulthostname"] as? String ?? "").lowercased()
        let cordovaHost = (self.commandDelegate.settings["hostname"] as? String ?? "").lowercased()
        
        if !osDefaultHost.isEmpty && host == osDefaultHost { return true }
        if !cordovaHost.isEmpty && host == cordovaHost { return true }
        
        return false
    }

    private func runIfSafeOrigin(command: CDVInvokedUrlCommand, _ work: @escaping () -> Void) {
        DispatchQueue.main.async {
            let currentURL = (self.webView as? WKWebView)?.url
            guard self.isSafeOrigin(currentURL) else {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: "SECURITY: Command rejected due to invalid Origin.")
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
                return
            }

            self.commandDelegate.run(inBackground: work)
        }
    }

    private func intArgument(_ value: Any?, defaultValue: Int) -> Int {
        if let intValue = value as? Int {
            return intValue
        }
        if let numberValue = value as? NSNumber {
            return numberValue.intValue
        }
        if let stringValue = value as? String, let intValue = Int(stringValue) {
            return intValue
        }
        return defaultValue
    }

    private func validateTotpArgs(expired: Int, offset: Int) -> String? {
        if expired < minTotpPeriod || expired > maxTotpPeriod {
            return "Invalid TOTP period. Allowed range: \(minTotpPeriod)-\(maxTotpPeriod) seconds."
        }
        if offset < -maxTimeOffsetSeconds || offset > maxTimeOffsetSeconds {
            return "Invalid TOTP timeOffset. Allowed range: +/-\(maxTimeOffsetSeconds) seconds."
        }
        return nil
    }

    // =========================================================================
    // ACTION 1: Get the device public key.
    // =========================================================================
    @objc(getPublicKey:)
    func getPublicKey(command: CDVInvokedUrlCommand) {
        runIfSafeOrigin(command: command) {
            if let pubKey = SecureTotpManager.getDevicePublicKey() {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_OK, messageAs: pubKey)
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
            } else {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: "Lỗi sinh khóa RSA iOS")
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
            }
        }
    }
    
    // =========================================================================
    // ACTION 2: Store the server-encrypted secret.
    // =========================================================================
    @objc(setEncryptedSecret:)
    func setEncryptedSecret(command: CDVInvokedUrlCommand) {
        runIfSafeOrigin(command: command) {
            let encryptedSecret = command.arguments.first as? String ?? ""
            if encryptedSecret.isEmpty {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: "Dữ liệu mã hóa không được để trống")
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
                return
            }
            
            if SecureTotpManager.decryptAndSaveSecret(encryptedSecret) {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_OK, messageAs: "Đã giải mã và lưu an toàn")
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
            } else {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: "Lỗi giải mã trên iOS. Khóa RSA có thể không khớp.")
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
            }
        }
    }
    
    // =========================================================================
    // ACTION 3: Get a 6-digit TOTP code.
    // =========================================================================
    @objc(getTotpCode:)
    func getTotpCode(command: CDVInvokedUrlCommand) {
        runIfSafeOrigin(command: command) {
            guard command.arguments.count >= 2 else {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: "Missing required arguments: expired, timeOffset")
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
                return
            }
            
            let expired = self.intArgument(command.arguments[0], defaultValue: 30)
            let offset = self.intArgument(command.arguments[1], defaultValue: 0)
            if let validationError = self.validateTotpArgs(expired: expired, offset: offset) {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: validationError)
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
                return
            }
            
            if let code = SecureTotpManager.generateTotp(expired: expired, timeOffset: offset) {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_OK, messageAs: code)
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
            } else {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: "Không thể sinh mã TOTP. Vui lòng kiểm tra lại Secret Key.")
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
            }
        }
    }
}
