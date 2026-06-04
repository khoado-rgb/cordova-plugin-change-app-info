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
    // 1. Export the public key in X.509/SPKI-compatible PEM format.
    // =========================================================================
    static func getDevicePublicKey() -> String? {
        guard let privateKey = getOrGenerateRsaPrivateKey() else { return nil }
        guard let publicKey = SecKeyCopyPublicKey(privateKey) else { return nil }
        
        // SecKey returns the raw RSA public key body; the SPKI header is added below.
        var error: Unmanaged<CFError>?
        guard let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
            return nil
        }

        // The SPKI header below is valid only for a 2048-bit RSA public key.
        guard publicKeyData.count == 270 else {
            print("[TOTP_ERROR] Unexpected RSA public key size: \(publicKeyData.count) bytes")
            return nil
        }
        
        // Build a SubjectPublicKeyInfo wrapper for RSA-2048 public keys.
        
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
    // 2. Generate or load an RSA key pair from Keychain.
    // =========================================================================
    private static func getOrGenerateRsaPrivateKey() -> SecKey? {
        guard let tag = rsaKeyTag.data(using: .utf8) else { return nil }
        
        // 1. Try to load an existing key.
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
        
        // 2. Remove stale items to avoid duplicate-key failures.
        let queryDelete: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: tag,
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA
        ]
        SecItemDelete(queryDelete as CFDictionary)
        
        // 3. Create a new persistent RSA key with a minimal compatible config.
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
            kSecAttrKeySizeInBits as String: 2048,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: tag,
                // Use the accessibility attribute directly for broad compatibility.
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
    // 3. Decrypt the secret with the private key and save it to Keychain.
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
    // 4. Store the secret in Keychain.
    // =========================================================================
    private static func saveToAesKeychain(_ secret: String) -> Bool {
        guard let data = secret.data(using: .utf8) else { return false }
        
        // Remove the old item first to avoid duplicate-key failures.
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
    // 5. Generate a 6-digit TOTP code with CryptoKit HMAC-SHA256.
    // =========================================================================
    static func generateTotp(expired: Int, timeOffset: Int) -> String? {
        // Validate time period to prevent division by zero
        guard expired > 0 else { return nil }
        
        // Read the secret from Keychain.
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
        
        // 1. Decode the Base32 secret into bytes.
        guard let keyData = base32Decode(secretString) else { return nil }
        
        // 2. Calculate the time step.
        let epoch = Int(Date().timeIntervalSince1970) + timeOffset
        var timeStep = UInt64(epoch / expired).bigEndian
        let timeData = Data(bytes: &timeStep, count: MemoryLayout<UInt64>.size)
        
        // 3. Compute HMAC-SHA256 with CryptoKit.
        let symmetricKey = SymmetricKey(data: keyData)
        let mac = HMAC<SHA256>.authenticationCode(for: timeData, using: symmetricKey)
        let hash = Data(mac) // 32-byte hash output
        
        // 4. Dynamic truncation according to RFC 6238.
        let offset = Int(hash[hash.count - 1] & 0x0f)
        let binary = ((Int(hash[offset]) & 0x7f) << 24) |
                     ((Int(hash[offset + 1]) & 0xff) << 16) |
                     ((Int(hash[offset + 2]) & 0xff) << 8) |
                     (Int(hash[offset + 3]) & 0xff)
        
        let otp = binary % 1000000
        return String(format: "%06d", otp)
    }
    
    // =========================================================================
    // UTILITY: Base32 decoder.
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
            
            // Shift the next 5 bits into the buffer.
            buffer = (buffer << 5) | val
            bitsLeft += 5
            
            // Emit one byte whenever the buffer has at least 8 bits.
            if bitsLeft >= 8 {
                let byte = UInt8((buffer >> (bitsLeft - 8)) & 0xFF)
                result.append(byte)
                bitsLeft -= 8
            }
        }
        
        return result.isEmpty ? nil : result
    }
}
