import Foundation
import Security
import WebKit // <--- BẮT BUỘC THÊM DÒNG NÀY ĐỂ DÙNG WKWEBVIEW

// CÁCH IMPORT CHUẨN XÁC NHẤT CHO CORDOVA IOS TRONG MABS 12
#if canImport(Cordova)
import Cordova
#endif

@objc(SecureTotpPlugin) 
class SecureTotpPlugin: CDVPlugin {
    
    // =========================================================================
    // HÀM PHỤ TRỢ: KIỂM TRA ORIGIN BẢO MẬT (CHỐNG MÃ ĐỘC XSS)
    // =========================================================================
    private func isSafeOrigin() -> Bool {
        guard let wkWebView = self.webView as? WKWebView,
              let url = wkWebView.url else {
            return false
        }
        
        let scheme = url.scheme?.lowercased() ?? ""
        let host = url.host?.lowercased() ?? ""
        
        // Local file URLs are always safe
        if scheme == "file" { return true }
        
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

    // =========================================================================
    // ACTION 1: LẤY PUBLIC KEY
    // =========================================================================
    @objc(getPublicKey:)
    func getPublicKey(command: CDVInvokedUrlCommand) {
        self.commandDelegate.run(inBackground: {
            guard self.isSafeOrigin() else {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: "BẢO MẬT: Lệnh bị từ chối do sai Origin.")
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
                return
            }
            
            if let pubKey = SecureTotpManager.getDevicePublicKey() {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_OK, messageAs: pubKey)
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
            } else {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: "Lỗi sinh khóa RSA iOS")
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
            }
        })
    }
    
    // =========================================================================
    // ACTION 2: LƯU SECRET ĐÃ MÃ HÓA TỪ SERVER
    // =========================================================================
    @objc(setEncryptedSecret:)
    func setEncryptedSecret(command: CDVInvokedUrlCommand) {
        self.commandDelegate.run(inBackground: {
            guard self.isSafeOrigin() else {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: "BẢO MẬT: Lệnh bị từ chối do sai Origin.")
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
                return
            }
            
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
        })
    }
    
    // =========================================================================
    // ACTION 3: LẤY MÃ TOTP 6 SỐ
    // =========================================================================
    @objc(getTotpCode:)
    func getTotpCode(command: CDVInvokedUrlCommand) {
        self.commandDelegate.run(inBackground: {
            guard self.isSafeOrigin() else {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: "BẢO MẬT: Lệnh bị từ chối do sai Origin.")
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
                return
            }
            
            guard command.arguments.count >= 2 else {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: "Missing required arguments: expired, timeOffset")
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
                return
            }
            
            let expired = command.arguments[0] as? Int ?? 30
            let offset = command.arguments[1] as? Int ?? 0
            
            if let code = SecureTotpManager.generateTotp(expired: expired, timeOffset: offset) {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_OK, messageAs: code)
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
            } else {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: "Không thể sinh mã TOTP. Vui lòng kiểm tra lại Secret Key.")
                self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
            }
        })
    }
}
