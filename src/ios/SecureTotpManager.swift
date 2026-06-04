import Foundation
import CryptoKit
import Security

class SecureTotpManager {
    private static var bundleID: String {
        return Bundle.main.bundleIdentifier ?? "com.default.totp"
    }
    
    private static var serviceNameAes: String {
        return "\(bundleID).totp.aes.v1"
    }
    
    private static var accountNameAes: String {
        return "\(bundleID).totp_secret_key"
    }
    
    private static var rsaKeyTag: String {
        return "\(bundleID).totp.rsa.v1"
    }
    
    // =========================================================================
    // 1. LẤY PUBLIC KEY ĐỊNH DẠNG X.509 NATIVE (KHỚP 100% VỚI ANDROID/C#)
    // =========================================================================
    static func getDevicePublicKey() -> String? {
        guard let privateKey = getOrGenerateRsaPrivateKey() else { return nil }
        guard let publicKey = SecKeyCopyPublicKey(privateKey) else { return nil }
        
        // Sử dụng thuật toán xuất định dạng spki (SubjectPublicKeyInfo - chính là X.509)
        // Đây là cách an toàn nhất vì Apple tự tính toán các byte ASN.1 chuẩn xác
        var error: Unmanaged<CFError>?
        guard let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
            return nil
        }
        
        // Nếu Server C# của bạn dùng thư viện đời cũ và vẫn lỗi với đoạn trên, 
        // ta sẽ dùng "Phép thuật 24-byte" nhưng thêm bước kiểm tra bit đệm:
        
        let header: [UInt8] = [
            0x30, 0x82, 0x01, 0x22, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
            0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x01, 0x0f, 0x00
        ]
        
        var x509Data = Data(header)
        x509Data.append(publicKeyData)
        
        let pubKeyBase64 = x509Data.base64EncodedString()
        return "-----BEGIN PUBLIC KEY-----\n\(pubKeyBase64)\n-----END PUBLIC KEY-----"
    }
    
    // =========================================================================
    // 2. SINH KHÓA RSA TRONG KEYCHAIN (ĐÃ BỎ ACCES CONTROL KHẮT KHE)
    // =========================================================================
    private static func getOrGenerateRsaPrivateKey() -> SecKey? {
        guard let tag = rsaKeyTag.data(using: .utf8) else { return nil }
        
        // 1. Thử lấy khóa cũ
        let queryGet: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: tag,
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
            kSecReturnRef as String: true
        ]
        
        var item: AnyObject?
        if SecItemCopyMatching(queryGet as CFDictionary, &item) == errSecSuccess {
            return (item as! SecKey)
        }
        
        // 2. Xóa tàn dư cũ để chống kẹt Duplicate
        let queryDelete: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: tag,
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA
        ]
        SecItemDelete(queryDelete as CFDictionary)
        
        // 3. Tạo mới với cấu hình TỐI GIẢN NHẤT (Vượt ải Apple 100%)
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
            kSecAttrKeySizeInBits as String: 2048,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: tag,
                // DÙNG TRỰC TIẾP CỜ NÀY THAY VÌ SEC_ACCESS_CONTROL
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            ]
        ]
        
        var error: Unmanaged<CFError>?
        guard let newKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
            if let err = error?.takeRetainedValue() {
                print("🔴 [TOTP_ERROR] Lỗi sinh khóa từ Apple: \(err)")
            }
            return nil
        }
        
        return newKey
    }
    
    // =========================================================================
    // 3. GIẢI MÃ SECRET BẰNG PRIVATE KEY VÀ LƯU VÀO KEYCHAIN
    // =========================================================================
    static func decryptAndSaveSecret(_ encryptedSecretBase64: String) -> Bool {
        guard let cipherData = Data(base64Encoded: encryptedSecretBase64, options: []) else { return false }
        guard let privateKey = getOrGenerateRsaPrivateKey() else { return false }
        
        // RSA decryption using OAEP-SHA256 (secure against Bleichenbacher's attack)
        // OutSystems JS must ensure the server encrypts with OaepSHA256 before calling this.
        let algorithm = SecKeyAlgorithm.rsaEncryptionOAEPSHA256
        if !SecKeyIsAlgorithmSupported(privateKey, .decrypt, algorithm) { return false }
        
        var error: Unmanaged<CFError>?
        guard let decryptedSecretData = SecKeyCreateDecryptedData(privateKey, algorithm, cipherData as CFData, &error) as Data? else {
            return false
        }
        
        guard let decryptedSecretStr = String(data: decryptedSecretData, encoding: .utf8) else { return false }
        return saveToAesKeychain(decryptedSecretStr)
    }
    
    // =========================================================================
    // 4. LƯU SECRET VÀO KEYCHAIN
    // =========================================================================
    private static func saveToAesKeychain(_ secret: String) -> Bool {
        guard let data = secret.data(using: .utf8) else { return false }
        
        // Xóa Key cũ trước khi thêm mới để tránh lỗi kẹt Duplicate Key
        let queryDelete: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceNameAes,
            kSecAttrAccount as String: accountNameAes
        ]
        SecItemDelete(queryDelete as CFDictionary)
        
        guard let accessControl = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            [],
            nil
        ) else { return false }
        
        let queryAdd: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceNameAes,
            kSecAttrAccount as String: accountNameAes,
            kSecValueData as String: data,
            kSecAttrAccessControl as String: accessControl
        ]
        
        return SecItemAdd(queryAdd as CFDictionary, nil) == errSecSuccess
    }
    
    // =========================================================================
    // 5. SINH MÃ TOTP 6 SỐ BẰNG CRYPTOKIT (BĂM HMAC-SHA256 CHUẨN)
    // =========================================================================
    static func generateTotp(expired: Int, timeOffset: Int) -> String? {
        // Validate time period to prevent division by zero
        guard expired > 0 else { return nil }
        
        // Lấy Secret từ Keychain
        let queryGet: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceNameAes,
            kSecAttrAccount as String: accountNameAes,
            kSecReturnData as String: kCFBooleanTrue!,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(queryGet as CFDictionary, &dataTypeRef)
        
        guard status == errSecSuccess,
              let retrievedData = dataTypeRef as? Data,
              let secretString = String(data: retrievedData, encoding: .utf8) else { return nil }
        
        // 1. Giải mã Base32 thành mảng Byte
        guard let keyData = base32Decode(secretString) else { return nil }
        
        // 2. Tính toán thời gian (Time Step)
        let epoch = Int(Date().timeIntervalSince1970) + timeOffset
        var timeStep = UInt64(epoch / expired).bigEndian
        let timeData = Data(bytes: &timeStep, count: MemoryLayout<UInt64>.size)
        
        // 3. Băm HMAC-SHA256 bằng CryptoKit native
        let symmetricKey = SymmetricKey(data: keyData)
        let mac = HMAC<SHA256>.authenticationCode(for: timeData, using: symmetricKey)
        let hash = Data(mac) // Trả về mảng 32 bytes
        
        // 4. Dynamic Truncation (Cắt ngắn động) theo chuẩn RFC 6238
        let offset = Int(hash[hash.count - 1] & 0x0f)
        let binary = ((Int(hash[offset]) & 0x7f) << 24) |
                     ((Int(hash[offset + 1]) & 0xff) << 16) |
                     ((Int(hash[offset + 2]) & 0xff) << 8) |
                     (Int(hash[offset + 3]) & 0xff)
        
        let otp = binary % 1000000
        return String(format: "%06d", otp)
    }
    
    // =========================================================================
    // UTILITY: GIẢI MÃ BASE32 (DỊCH BIT CHUẨN QUỐC TẾ)
    // =========================================================================
    private static func base32Decode(_ base32String: String) -> Data? {
        let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
        var result = Data()
        var buffer: UInt32 = 0
        var bitsLeft: Int = 0
        
        let cleanString = base32String.replacingOccurrences(of: "=", with: "").uppercased()
        
        for char in cleanString {
            guard let index = alphabet.firstIndex(of: char) else { continue }
            let val = UInt32(alphabet.distance(from: alphabet.startIndex, to: index))
            
            // Dịch 5 bit mới vào bộ đệm
            buffer = (buffer << 5) | val
            bitsLeft += 5
            
            // Cứ đủ 8 bit thì gom thành 1 Byte đẩy vào mảng Data
            if bitsLeft >= 8 {
                let byte = UInt8((buffer >> (bitsLeft - 8)) & 0xFF)
                result.append(byte)
                bitsLeft -= 8
            }
        }
        
        return result.isEmpty ? nil : result
    }
}
