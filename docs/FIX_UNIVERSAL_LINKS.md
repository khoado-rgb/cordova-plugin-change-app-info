# Fix Universal Links Không Hoạt Động

## ✅ Đã Xác Nhận

Từ build log, chúng ta đã xác nhận:

1. ✅ **Plugin đã cài đặt thành công**
   ```
   Installing "cordova-plugin-change-app-info" for ios
   ```

2. ✅ **Hook registerUniversalLinks.js đã chạy**
   ```
   Universal Links Registration
   Using API_HOSTNAME as universal link host: api.example.com
   Found 1 host(s)
   iOS
   Code Sign Entitlements set to My App/My App.entitlements
   Registered 1 associated domain(s)
   ```

3. ✅ **AASA file accessible**
   ```
   https://api.example.com/.well-known/apple-app-site-association
   Status: 200 OK
   Content-Type: application/json
   ```

4. ✅ **Build thành công**
   ```
   ** ARCHIVE SUCCEEDED **
   ** EXPORT SUCCEEDED **
   ```

## ❌ Vấn Đề Có Thể Xảy Ra

### Problem 1: Provisioning Profile KHÔNG có Associated Domains Capability

**Đây là nguyên nhân phổ biến nhất!**

MABS sử dụng provisioning profile có sẵn, nhưng provisioning profile đó có thể **KHÔNG** bao gồm Associated Domains capability.

#### ✅ Giải Pháp:

1. **Kiểm tra Provisioning Profile hiện tại:**
   - Vào [Apple Developer Portal](https://developer.apple.com/account/resources/profiles/list)
   - Tìm profile của bạn (từ build log)
   - Click Edit
   - Kiểm tra xem "Associated Domains" có được check không

2. **Nếu KHÔNG có Associated Domains:**
   - Vào [Identifiers](https://developer.apple.com/account/resources/identifiers/list)
   - Chọn Bundle ID: `com.example.myapp`
   - Check vào "Associated Domains"
   - Save
   - Regenerate Provisioning Profile
   - Download và update trong MABS

3. **Update trong OutSystems:**
   - Service Studio → Module → Properties
   - iOS Certificates → Upload new provisioning profile
   - Rebuild app

### Problem 2: Entitlements File Không Có Associated Domains

Mặc dù hook đã chạy, có thể entitlements file không được merge đúng vào final build.

#### ✅ Kiểm tra:

Nếu bạn có IPA file, extract và check:

```bash
# Extract IPA
unzip MyApp.ipa

# Check entitlements
codesign -d --entitlements - "Payload/My One Mount.app"

# Phải thấy:
# <key>com.apple.developer.associated-domains</key>
# <array>
#     <string>applinks:api.example.com</string>
# </array>
```

#### ✅ Giải pháp nếu thiếu:

Cần update hook `registerUniversalLinks.js` để đảm bảo nó write vào đúng entitlements file:

```javascript
// Trong registerUniversalLinks.js
const entitlementsPath = path.join(
    platformPath,
    projectName,
    'Entitlements-Debug.plist' // hoặc Entitlements-Release.plist
);
```

### Problem 3: iOS Cached Old AASA File

iOS device cache AASA file và không refresh ngay lập tức.

#### ✅ Giải pháp:

```bash
# Trên device thật:
1. Uninstall app HOÀN TOÀN
2. Settings → General → iPhone Storage → tìm app → Delete App
3. RESTART device
4. Đợi 5 phút
5. Install app lại
6. Đợi thêm 5-10 phút để iOS download AASA
7. Test link
```

### Problem 4: Link Test Không Đúng Cách

Universal Links **KHÔNG** hoạt động khi:
- Click link trong Safari address bar
- Paste link rồi Enter
- Click link trong cùng domain

#### ✅ Cách test ĐÚNG:

**Test 1: Trong Messages App**
```
1. Mở Messages
2. Gửi link cho chính mình: 
   https://api.example.com/app
3. TAP vào link (không long press)
4. App phải mở
```

**Test 2: Trong Notes App**
```
1. Mở Notes
2. Tạo note mới
3. Type hoặc paste link
4. TAP vào link
5. App phải mở
```

**Test 3: Long Press Test**
```
1. Trong Messages hoặc Notes
2. LONG PRESS vào link
3. Phải thấy menu với option "Open in [App Name]"
4. Nếu chỉ thấy "Open" → Universal Links KHÔNG hoạt động
```

### Problem 5: AASA File Format Issues

Mặc dù file hiện tại nhìn OK, có thể có vấn đề với format.

#### ✅ Kiểm tra lại:

Current AASA:
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

**Các vấn đề có thể:**

1. **Team ID có đúng không?**
   - Kiểm tra trong build log: `TEAM1234AB`
   - Phải match chính xác

2. **Bundle ID có đúng không?**
   - Kiểm tra trong build log: `com.example.myapp`
   - Phải match chính xác

3. **Paths có match với URL structure không?**
   - URL test: `https://api.example.com/app`
   - Path trong AASA: `/app` ✅
   - MATCH!

#### Optional: Thêm wildcard pattern (nếu cần)

```json
{
    "applinks": {
        "apps": [],
        "details": [
            {
                "appID": "TEAM1234AB.com.example.myapp",
                "paths": [
                    "/app*"
                ]
            }
        ]
    }
}
```

Hoặc exclude pattern nếu có:
```json
{
    "applinks": {
        "apps": [],
        "details": [
            {
                "appID": "TEAM1234AB.com.example.myapp",
                "paths": [
                    "/app*"
                ],
                "excludedPaths": [
                    "/app/api/*"
                ]
            }
        ]
    }
}
```

## 🎯 Action Plan - Làm Theo Thứ Tự

### Step 1: Verify Provisioning Profile (QUAN TRỌNG NHẤT!)

```bash
1. Login vào Apple Developer Portal
2. Certificates, Identifiers & Profiles
3. Identifiers → com.example.myapp
4. Check "Associated Domains" capability
5. Nếu chưa có → Check và Save
6. Profiles → Regenerate profile
7. Download và upload lại vào OutSystems
8. Rebuild app
```

### Step 2: Clean Install trên Device

```bash
1. Uninstall app hoàn toàn
2. Settings → General → iPhone Storage → Delete app data
3. Restart device
4. Đợi 5 phút
5. Install app mới (từ build với provisioning profile mới)
6. Đợi 10 phút
```

### Step 3: Test Đúng Cách

```bash
1. Mở Messages app
2. Send message với link: 
   https://api.example.com/app
3. Long press link
4. Kiểm tra xem có "Open in [App Name]" không
5. Nếu CÓ → tap để mở
6. Nếu KHÔNG → vẫn còn vấn đề
```

### Step 4: Debug với Console

```bash
# Kết nối device với Mac
# Mở Console.app
# Filter: "swcd"
# Tap vào Universal Link
# Xem logs:
# - "Claiming applinks:api.example.com" → Good
# - "No app to claim" → Bad (provisioning profile issue)
# - "Failed to download" → Bad (AASA issue)
```

## 🔍 Verification Commands

### 1. Verify AASA Download

```bash
# Check if iOS downloaded AASA
# Trên device: Settings → Developer → Universal Links
# Hoặc:
curl -s https://api.example.com/.well-known/apple-app-site-association | python3 -m json.tool
```

### 2. Verify Apple's Validator

```bash
# Go to: https://search.developer.apple.com/appsearch-validation-tool/
# Enter: api.example.com
# Check validation result
```

### 3. Check Team ID

```bash
# From build log line:
# Bundle ID: com.example.myapp
# Team ID: TEAM1234AB
# Must match AASA: TEAM1234AB.com.example.myapp
```

## 📊 Expected Results

### ✅ Khi Universal Links Hoạt Động:

1. **Long press link** → thấy "Open in [App Name]"
2. **Tap link** → app mở ngay lập tức
3. **App delegate** nhận được URL
4. **Console logs** show "Claiming applinks"

### ❌ Khi KHÔNG Hoạt Động:

1. **Long press link** → chỉ thấy "Open" (mở Safari)
2. **Tap link** → mở Safari, không mở app
3. **Console logs** show "No app to claim"

## 🚨 Most Likely Issue

**90% khả năng vấn đề là:** Provisioning Profile không có Associated Domains capability!

**Giải pháp:**
1. Apple Developer Portal
2. Enable Associated Domains cho Bundle ID
3. Regenerate Provisioning Profile
4. Upload vào OutSystems
5. Rebuild app
6. Clean install trên device

## 📞 Next Steps If Still Not Working

Nếu sau khi làm tất cả các bước trên vẫn không hoạt động:

1. **Collect device logs:**
   ```bash
   # Console.app → filter "swcd"
   # hoặc
   xcrun devicectl device info logs
   ```

2. **Verify với sysdiagnose:**
   ```bash
   # Trên device: 
   # Volume Up + Volume Down + Power button
   # Đợi 10 giây
   # sysdiagnose sẽ được generate
   ```

3. **Check với Apple Support:**
   - Provide: Bundle ID, Team ID, AASA URL
   - Provide: sysdiagnose logs
   - Provide: Console logs với "swcd" filter

## 📚 References

- [Apple Universal Links Docs](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
- [AASA Validator](https://search.developer.apple.com/appsearch-validation-tool/)
- [Debugging Universal Links](https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app)
