# Universal Links Debug Guide - Không Mở Được App

## ✅ Đã Kiểm Tra

### 1. AASA File trên Server
- ✅ URL: `https://api.example.com/.well-known/apple-app-site-association`
- ✅ Status: 200 OK
- ✅ Content-Type: `application/json`
- ✅ Format đúng:
```json
{
    "applinks": {
        "apps": [],
        "details": [
            {
                "appID": "TEAM1234AB.com.example.myapp",
                "paths": [
                    "/app",
                    "/app/*"
                ]
            }
        ]
    }
}
```

## 🔍 Các Vấn Đề Phổ Biến và Cách Kiểm Tra

### Problem 1: Associated Domains không được setup đúng trong Xcode

**Cách kiểm tra:**
1. Mở file `.ipa` đã build
2. Extract và tìm file `*.app/embedded.mobileprovision`
3. Hoặc check trong build log xem có dòng:
   ```
   com.apple.developer.associated-domains = (
       "applinks:api.example.com"
   )
   ```

**Giải pháp nếu thiếu:**
- Cần thêm vào `plugin.xml`:
```xml
<config-file target="*-Debug.plist" parent="com.apple.developer.associated-domains">
    <array>
        <string>applinks:api.example.com</string>
    </array>
</config-file>
```

### Problem 2: Device chưa download AASA file

**Triệu chứng:**
- Lần đầu install app không hoạt động
- Sau khi reinstall nhiều lần vẫn không hoạt động

**Cách kiểm tra:**
1. Mở Settings → Developer → Universal Links
2. Xem có domain `api.example.com` không
3. Check Downloaded status

**Giải pháp:**
```bash
# Trên Mac kết nối với device
# Force iOS download lại AASA file
xcrun simctl openurl booted "https://api.example.com/app"

# Hoặc trên device thật:
# 1. Uninstall app hoàn toàn
# 2. Restart device
# 3. Install lại app
# 4. Đợi 5-10 phút để iOS tự download AASA
```

### Problem 3: Link Format không đúng

**Link phải có format:**
```
https://api.example.com/app
https://api.example.com/app/home
https://api.example.com/app/detail/123
```

**KHÔNG hoạt động với:**
- `http://` (phải là HTTPS)
- Link có query params nếu không config: `?param=value`
- Deep path không match với patterns trong AASA

**Test link đúng cách:**
1. Gửi link qua Messages/Notes
2. Long press vào link
3. Phải thấy "Open in [App Name]"
4. Nếu chỉ thấy "Open", nghĩa là không nhận diện được

### Problem 4: App ID hoặc Team ID không khớp

**Kiểm tra trong build log:**
```
Provisioning Profile: "MyAppDev"
Bundle ID: com.example.myapp
Team ID: TEAM1234AB
```

**Phải khớp với AASA:**
```json
"appID": "TEAM1234AB.com.example.myapp"
```

### Problem 5: Certificate/Provisioning Profile Issue

**Universal Links chỉ hoạt động với:**
- ✅ Development Certificate với Associated Domains
- ✅ Distribution Certificate với Associated Domains
- ❌ KHÔNG hoạt động với: Wildcard App ID

**Kiểm tra:**
1. Vào Apple Developer Portal
2. Certificates, Identifiers & Profiles
3. Identifiers → chọn Bundle ID
4. Đảm bảo "Associated Domains" được check

### Problem 6: iOS Cache Issue

iOS cache AASA file và chỉ refresh trong các trường hợp:
- App mới install
- iOS device restart
- Sau 24 giờ

**Force refresh:**
```bash
# Uninstall app
# Đợi 30 giây
# Settings → General → iPhone Storage → tìm app cũ và xóa data
# Restart device
# Install lại
```

## 🧪 Test Checklist

### Pre-Test Checklist:
- [ ] AASA file accessible tại `/.well-known/apple-app-site-association`
- [ ] AASA file trả về `Content-Type: application/json`
- [ ] appID format: `TEAMID.BUNDLEID`
- [ ] Paths match với URL structure
- [ ] App có Associated Domains entitlement
- [ ] Certificate có Associated Domains capability

### Testing Steps:
1. **Uninstall app hoàn toàn**
2. **Restart device**
3. **Install app từ TestFlight/Ad-hoc**
4. **Đợi 5-10 phút** (iOS download AASA file background)
5. **Test link trong Notes app:**
   ```
   Tạo note mới
   Paste link: https://api.example.com/app
   Tap vào link
   ```
6. **Long press link** - phải thấy "Open in [App Name]"

## 🔧 Debug Commands

### 1. Verify AASA từ iOS device
```bash
# Kết nối device với Mac
# Check console logs khi mở link
xcrun devicectl device info logs --pid [PID]
# Tìm "swcd" logs
```

### 2. Check entitlements trong IPA
```bash
# Extract IPA
unzip MyApp.ipa
# Check entitlements
codesign -d --entitlements - "Payload/MyApp.app"
# Phải thấy:
# <key>com.apple.developer.associated-domains</key>
# <array>
#     <string>applinks:api.example.com</string>
# </array>
```

### 3. Verify AASA download
```bash
# Check if iOS downloaded AASA
# Trên device: Settings → Developer → Universal Links
# Hoặc check với sysdiagnose
```

## 📱 Testing Scenarios

### Scenario 1: Test trong Messages
```
1. Mở Messages app
2. Tạo conversation mới
3. Paste link: https://api.example.com/app
4. Send message
5. Tap vào link
Expected: App mở
```

### Scenario 2: Test trong Notes
```
1. Mở Notes app
2. Tạo note mới
3. Type link và để iOS tự detect
4. Tap vào link
Expected: App mở
```

### Scenario 3: Test trong Safari
```
1. Mở Safari
2. Navigate đến: https://api.example.com/app
3. Tap vào Smart App Banner (nếu có)
Expected: App mở
```

### Scenario 4: Test từ QR Code
```
1. Generate QR code với link
2. Scan bằng Camera app
3. Tap vào notification
Expected: App mở
```

## ⚠️ Common Mistakes

### 1. AASA File Location
❌ Wrong: `/apple-app-site-association`
✅ Correct: `/.well-known/apple-app-site-association`

### 2. Content-Type
❌ Wrong: `text/plain`
✅ Correct: `application/json` hoặc `application/pkcs7-mime`

### 3. HTTPS Requirement
❌ Wrong: `http://api.example.com`
✅ Correct: `https://api.example.com`

### 4. App ID Format
❌ Wrong: `com.example.myapp` (thiếu Team ID)
✅ Correct: `TEAM1234AB.com.example.myapp`

### 5. Path Patterns
❌ Wrong: `"paths": ["*"]` (quá broad, iOS reject)
✅ Correct: `"paths": ["/app", "/app/*"]`

## 🎯 Next Steps

Nếu vẫn không hoạt động sau khi check hết:

1. **Collect logs:**
   ```bash
   # Trên Mac
   xcrun devicectl device info logs --pid [APP_PID] > app.log
   # Search for "swcd" entries
   ```

2. **Check Apple Developer Console:**
   - Certificates, Identifiers & Profiles
   - Verify Associated Domains is enabled
   - Verify provisioning profile includes it

3. **Use Apple's AASA Validator:**
   - https://search.developer.apple.com/appsearch-validation-tool/
   - Nhập domain để validate

4. **Contact Support:**
   - Apple Developer Support
   - Provide: Bundle ID, Team ID, AASA URL, logs

## 📚 References

- [Apple Universal Links Documentation](https://developer.apple.com/ios/universal-links/)
- [AASA File Format](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
- [Debugging Universal Links](https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app)

## 🐛 Current Status

**Example Domain:** api.example.com
**Example Bundle ID:** com.example.myapp
**Example Team ID:** TEAM1234AB
**AASA Status:** ✅ Must be accessible at `/.well-known/apple-app-site-association`
**Issue:** Universal Links không mở app trên device thật

**Next Action Required:** 
1. Check entitlements trong IPA file
2. Verify Associated Domains trong provisioning profile
3. Test với long press trên link trong Notes app

---

## 🔧 Root Cause Analysis & Fixes (v2.9.23+)

### Root Cause 1: Hook `registerUniversalLinks.js` chạy ở global scope, không trong iOS platform context

**Vấn đề:**  
Hook được khai báo ngoài `<platform name="ios">` trong `plugin.xml`:
```xml
<!-- TRƯỚC (SAI) - global hook, MABS không đảm bảo platforms context đúng -->
<hook type="after_prepare" src="hooks/registerUniversalLinks.js" />
<platform name="ios">...</platform>
```
MABS build có thể chạy hook này với `context.opts.platforms` không chứa `'ios'`, khiến phần register iOS entitlements bị skip hoàn toàn.

**Fix:**  
Chuyển hook vào trong từng `<platform>` block:
```xml
<!-- SAU (ĐÚNG) -->
<platform name="android">
    <hook type="after_prepare" src="hooks/registerUniversalLinks.js" />
</platform>
<platform name="ios">
    <hook type="after_prepare" src="hooks/registerUniversalLinks.js" />
    <hook type="after_prepare" src="hooks/ios/fix-universal-links-entitlements.js" />
</platform>
```

---

### Root Cause 2: `fix-universal-links-entitlements.js` đọc domains từ sai nguồn

**Vấn đề:**  
Hàm `getAssociatedDomains()` cũ chỉ đọc từ entitlements file đã có, rồi mới fallback về `API_HOSTNAME`. Khi build lần đầu (chưa có entitlements file), nó bỏ qua hoàn toàn các preferences `UNIVERSAL_LINKS` và `UNIVERSAL_LINK_HOSTS`.

**Fix:**  
Thứ tự ưu tiên mới:
1. Đọc preferences `UNIVERSAL_LINKS` và `UNIVERSAL_LINK_HOSTS` (global + ios-specific) — hỗ trợ JSON array/object và plain text
2. Fallback về `API_HOSTNAME` nếu không có explicit config
3. Merge thêm từ existing entitlements để giữ manual entries

**Config example trong OutSystems:**
```json
{
  "preferences": {
    "global": [
      { "name": "UNIVERSAL_LINKS", "value": "api.example.com" }
    ]
  }
}
```
Hoặc dùng JSON array cho nhiều domain:
```json
{ "name": "UNIVERSAL_LINKS", "value": "[\"api.example.com\",\"app.example.com\"]" }
```

---

### Root Cause 3: `resolveEntitlementsPath` bỏ qua Xcode variable substitution

**Vấn đề:**  
Regex cũ:
```js
const match = pbxContent.match(/CODE_SIGN_ENTITLEMENTS = "?([^";]+)"?;/);
if (!match || match[1].includes('$(')) {
    return defaultPath;  // Bỏ qua khi có Xcode variables
}
```
MABS thường sinh ra `project.pbxproj` với:
```
CODE_SIGN_ENTITLEMENTS = "$(PROJECT_DIR)/App/App.entitlements";
```
Regex cũ nhìn thấy `$(` và fallback về default path — có thể không phải file MABS thực sự dùng.

**Fix:**  
- Dùng `.exec()` loop để collect tất cả occurrences (Debug + Release configs)
- Resolve `$(PROJECT_DIR)/`, `$(PRODUCT_NAME)`, `$(TARGET_NAME)` thành path thực
- Skip nếu còn variable không resolve được
- Ưu tiên candidate có file đã tồn tại trên disk

---

### Checklist sau khi apply fixes

Sau khi rebuild với plugin v2.9.23+, verify trong build log:

```
=======================================
  Universal Links Registration
=======================================
   Found 1 host(s)

   iOS
   Code Sign Entitlements set to App/App.entitlements
   Registered 1 associated domain(s)

═══════════════════════════════════════
  Fix Universal Links Entitlements (MABS)
═══════════════════════════════════════
   Found 1 associated domain(s):
     - applinks:api.example.com
   ✅ Updated: App/Entitlements-Debug.plist
   ✅ Updated: App/Entitlements-Release.plist
   ✅ Updated: App/Entitlements-Production.plist
```

Nếu log không hiện đủ các dòng trên, kiểm tra:
1. Preference `UNIVERSAL_LINKS` hoặc `API_HOSTNAME` đã được set chưa
2. `platforms/ios/` folder tồn tại trước khi hook chạy
3. Provisioning profile có Associated Domains capability (xem Problem 5 bên trên)
