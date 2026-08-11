package com.vnkhoado.cordova.plugin;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import java.nio.ByteBuffer;
import java.util.Locale;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PublicKey;
import java.security.cert.Certificate;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public class SecureTotpManager {

    private static final String ANDROID_KEY_STORE = "AndroidKeyStore";
    private static final String TAG = "SecureTotpPlugin";

    // =========================================================================
    // Dynamic identifiers derived from the app package name.
    // =========================================================================
    private static String getRsaKeyAlias(Context context) {
        return context.getPackageName() + ".totp.rsa.v1";
    }

    private static String getPrefsName(Context context) {
        return context.getPackageName() + ".SecureTotpPrefs";
    }

    private static String getSecretKeyAccount(Context context) {
        return context.getPackageName() + ".totp_secret_key";
    }

    // Cached EncryptedSharedPreferences to avoid re-creating MasterKey on each call
    private static MasterKey cachedMasterKey = null;
    private static SharedPreferences cachedPrefs = null;
    private static String cachedPrefsName = null;

    private static SharedPreferences getEncryptedPrefs(Context context) throws Exception {
        String prefsName = getPrefsName(context);
        if (cachedPrefs != null && prefsName.equals(cachedPrefsName)) {
            return cachedPrefs;
        }

        MasterKey masterKey = new MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();

        cachedPrefs = EncryptedSharedPreferences.create(
                context,
                prefsName,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );
        cachedPrefsName = prefsName;
        cachedMasterKey = masterKey;
        return cachedPrefs;
    }

    // =========================================================================
    // 1. GENERATE HARDWARE-BACKED RSA KEY PAIR
    // =========================================================================
    private static void generateRsaKeyPair(Context context) throws Exception {
        LogUtil.d(context, TAG, "Starting to generate new RSA key pair...");
        
        KeyPairGenerator kpg = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_RSA, ANDROID_KEY_STORE);

        int purposes = KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT;

        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(getRsaKeyAlias(context), purposes)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setSignaturePaddings(KeyProperties.SIGNATURE_PADDING_RSA_PKCS1)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP)
                .setKeySize(2048);

        // Prefer hardware-backed StrongBox when the device supports it.
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            builder.setIsStrongBoxBacked(true);
            try {
                kpg.initialize(builder.build());
                kpg.generateKeyPair();
                LogUtil.d(context, TAG, "RSA key pair generated successfully using StrongBox!");
                return; 
            } catch (Exception e) {
                LogUtil.e(context, TAG, "StrongBox not supported or running on Emulator. Falling back to TEE...");
                builder.setIsStrongBoxBacked(false); 
            }
        }

        kpg.initialize(builder.build());
        kpg.generateKeyPair();
        LogUtil.d(context, TAG, "RSA key pair generated successfully using TEE!");
    }

    // =========================================================================
    // 2. GET PUBLIC KEY AND PACKAGE IN PEM FORMAT
    // =========================================================================
    public static String getPublicKey(Context context) throws Exception {
        LogUtil.d(context, TAG, "Starting getPublicKey() function...");
        
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEY_STORE);
        keyStore.load(null);

        if (!keyStore.containsAlias(getRsaKeyAlias(context))) {
            LogUtil.d(context, TAG, "Key not found. Starting generation process...");
            generateRsaKeyPair(context);
        } else {
            LogUtil.d(context, TAG, "Existing key found in Keystore, reusing it.");
        }

        Certificate cert = keyStore.getCertificate(getRsaKeyAlias(context));
        if (cert == null) {
            throw new Exception("Keystore Error: Certificate not found.");
        }

        PublicKey publicKey = cert.getPublicKey();
        if (publicKey == null) {
            throw new Exception("Keystore Error: Public Key is null.");
        }

        byte[] publicKeyBytes = publicKey.getEncoded();
        if (publicKeyBytes == null || publicKeyBytes.length == 0) {
            throw new Exception("Keystore Error: Cannot read Public Key byte array.");
        }

        String base64Key = Base64.encodeToString(publicKeyBytes, Base64.NO_WRAP);
        if (base64Key == null || base64Key.trim().isEmpty()) {
            throw new Exception("Base64 Error: Encoded string is empty.");
        }

        String pem = "-----BEGIN PUBLIC KEY-----\n" + base64Key + "\n-----END PUBLIC KEY-----";
        LogUtil.d(context, TAG, "Key retrieved successfully! Preparing to return to Cordova.");
        
        return pem;
    }

    // =========================================================================
    // 3. DECRYPT SECRET AND SAVE TO ENCRYPTED SHARED PREFERENCES
    // =========================================================================
    public static void saveEncryptedSecret(Context context, String encryptedSecretBase64) throws Exception {
        LogUtil.d(context, TAG, "Starting to decrypt Secret Key...");

        // 1. Load the private key from Android Keystore.
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEY_STORE);
        keyStore.load(null);
        java.security.PrivateKey privateKey = (java.security.PrivateKey) keyStore.getKey(getRsaKeyAlias(context), null);

        if (privateKey == null) {
            throw new Exception("Security Error: Private Key not found. Please register again.");
        }

        // 2. RSA decryption using OAEP-SHA256 (secure against Bleichenbacher's attack)
        // OutSystems JS must ensure the server encrypts with OaepSHA256 before calling this.
        Cipher cipher = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding");
        cipher.init(Cipher.DECRYPT_MODE, privateKey);

        // 3. Decrypt and convert to string
        byte[] encryptedBytes = Base64.decode(encryptedSecretBase64, Base64.NO_WRAP);
        byte[] decryptedBytes = cipher.doFinal(encryptedBytes);
        String rawSecret;
        try {
            rawSecret = new String(decryptedBytes, "UTF-8");
        } finally {
            java.util.Arrays.fill(decryptedBytes, (byte) 0);
            java.util.Arrays.fill(encryptedBytes, (byte) 0);
        }

        // 4. Store the secret with encrypted shared preferences.
        SharedPreferences sharedPreferences = getEncryptedPrefs(context);

        sharedPreferences.edit().putString(getSecretKeyAccount(context), rawSecret).apply();

        LogUtil.d(context, TAG, "Secret Key decrypted and heavily encrypted to storage!");
    }

    // =========================================================================
    // 4. GENERATE TOTP (HMAC-SHA256)
    // =========================================================================
    public static String generateTotp(Context context, int expired, int timeOffset) throws Exception {
        LogUtil.d(context, TAG, "Generating TOTP Code...");

        // Validate time period to prevent division by zero
        if (expired <= 0) {
            throw new Exception("Invalid TOTP period. Must be a positive integer.");
        }

        // 1. Read the secret key from encrypted storage.
        SharedPreferences sharedPreferences = getEncryptedPrefs(context);

        String secret = sharedPreferences.getString(getSecretKeyAccount(context), null);

        if (secret == null || secret.isEmpty()) {
            throw new Exception("Secret Key not found. Please register device first.");
        }

        // 2. Decode the Base32 secret into bytes.
        byte[] keyBytes = base32Decode(secret);
        if (keyBytes == null || keyBytes.length == 0) {
            throw new Exception("Invalid Base32 secret.");
        }

        // 3. Calculate the time step.
        long currentUnixTime = (System.currentTimeMillis() / 1000L) + timeOffset;
        long timeStep = currentUnixTime / expired;
        
        // Convert the time step to an 8-byte big-endian array.
        byte[] timeBytes = ByteBuffer.allocate(8).putLong(timeStep).array();

        // 4. Compute HMAC-SHA256, matching iOS and server behavior.
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(keyBytes, "HmacSHA256"));
        byte[] hash = mac.doFinal(timeBytes);

        // Zero sensitive key material after HMAC computation
        java.util.Arrays.fill(keyBytes, (byte) 0);

        // 5. Dynamic truncation to extract a 6-digit code from the hash.
        int offset = hash[hash.length - 1] & 0x0F;
        int binary = ((hash[offset] & 0x7F) << 24) |
                     ((hash[offset + 1] & 0xFF) << 16) |
                     ((hash[offset + 2] & 0xFF) << 8) |
                     (hash[offset + 3] & 0xFF);

        int otp = binary % 1000000;
        
        // Format as a 6-character string.
        return String.format(Locale.US, "%06d", otp);
    }

    // =========================================================================
    // UTILITY: BASE32 DECODER
    // =========================================================================
    private static byte[] base32Decode(String base32) {
        String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        String cleanInput = base32.toUpperCase(Locale.ROOT).replaceAll("[^A-Z2-7]", "");
        int length = cleanInput.length();
        int outLength = length * 5 / 8;
        byte[] result = new byte[outLength];

        int buffer = 0;
        int next = 0;
        int bitsLeft = 0;

        for (char c : cleanInput.toCharArray()) {
            buffer <<= 5;
            buffer |= alphabet.indexOf(c);
            bitsLeft += 5;
            if (bitsLeft >= 8) {
                result[next++] = (byte) (buffer >> (bitsLeft - 8));
                bitsLeft -= 8;
            }
        }
        return result;
    }
}
