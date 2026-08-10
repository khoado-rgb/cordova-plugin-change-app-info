# Debug Universal Links trên Device

## Vấn đề
Tap link `https://suite-dev.masterisegroup.dev/staffportalmobile` không mở app.

## Root Cause Check

### ✅ Đã verify:
1. ✅ IPA có entitlements `com.apple.developer.associated-domains: ["applinks:suite-dev.masterisegroup.dev"]`
2. ✅ AASA file accessible tại `https://suite-dev.masterisegroup.dev/.well-known/apple-app-site-association`
3. ✅ AASA có đúng appID: `UD4C992DS7.com.masterisehomes.my.dev`
4. ✅ AASA có đúng paths: `/staffportalmobile`, `/staffportalmobile/*`
5. ✅ Provisioning profile có `associated-domains: "*"` (wildcard)

### ❓ Cần verify trên device:

## Method 1: Check iOS Console Logs

### Bước 1: Kết nối device với Mac
1. Cắm iPhone vào Mac bằng USB
2. Unlock iPhone
3. Trust computer nếu được hỏi

### Bước 2: Mở Console app trên Mac
1. Applications → Utilities → Console
2. Hoặc Cmd+Space → gõ "Console"

### Bước 3: Filter logs
Trong Console, filter theo:
```
process: swcd
```

Hoặc search:
```
subsystem:com.apple.swc category:associated domains
```

### Bước 4: Test và xem logs

**A. Uninstall app cũ hoàn toàn**
```
Settings → General → iPhone Storage → My Masterise Group DEV → Delete App
```

**B. Restart device**
- Tắt nguồn
- Đợi 30 giây
- Bật lại
- Đợi 2-3 phút

**C. Install IPA mới**
Install `My One Mount (1).ipa`

**D. Mở app 1 lần**
Mở app, login (nếu cần), rồi thoát

**E. ĐỢI 10 PHÚT**
iOS download AASA file ở background. Trong Console logs, tìm:

✅ **SUCCESS logs:**
```
Claiming applinks:suite-dev.masterisegroup.dev for com.masterisehomes.my.dev
```

❌ **FAILURE logs:**
```
No app to claim applinks:suite-dev.masterisegroup.dev
```

**F. Test link**
1. Mở Messages app
2. Gửi link: `https://suite-dev.masterisegroup.dev/staffportalmobile`
3. **Long press** link → phải thấy "Open in My Masterise Group DEV"
4. Tap link → app phải mở

## Method 2: Manual Force Update AASA

Nếu iOS không tự download AASA sau 10 phút:

### Bước 1: Uninstall & Reinstall
```
Settings → General → iPhone Storage → Delete App → Restart device → Reinstall
```

### Bước 2: Force trigger AASA download
1. Mở Safari trên iPhone
2. Vào: `https://suite-dev.masterisegroup.dev/staffportalmobile`
3. Tap "Open in App" banner (nếu có)
4. Hoặc tap link trong app khác (Notes, Mail, Messages)

### Bước 3: Check lại sau 5 phút

## Method 3: Verify với Settings

### iOS 17+:
```
Settings → My Masterise Group DEV → Associated Domains
```
Phải thấy: `suite-dev.masterisegroup.dev`

### iOS 16 và cũ hơn:
Không có UI để check, phải dùng Console logs.

## Common Issues

### Issue 1: "No app to claim" trong logs
**Nguyên nhân:** iOS chưa nhận diện được entitlements của app

**Fix:**
1. Verify bundle ID chính xác: `com.masterisehomes.my.dev`
2. Verify team ID chính xác: `UD4C992DS7`
3. Check AASA file có đúng appID: `UD4C992DS7.com.masterisehomes.my.dev`
4. Reinstall app

### Issue 2: iOS không download AASA
**Nguyên nhân:** Device không có internet hoặc bị iOS cache

**Fix:**
1. Verify device có internet (Wifi hoặc cellular)
2. Turn OFF Airplane mode
3. Reset network: Settings → General → Transfer or Reset iPhone → Reset → Reset Network Settings
4. Reinstall app

### Issue 3: Long press không thấy "Open in..."
**Nguyên nhân:** iOS chưa associate domain với app

**Fix:**
1. Đợi thêm 10-15 phút
2. Restart device
3. Force trigger AASA download (Method 2 ở trên)

### Issue 4: Có "Open in..." nhưng tap không mở app
**Nguyên nhân:** App không handle Universal Link URL

**Fix:** Check code JavaScript trong app:
```javascript
// In Cordova app (www/js/index.js or main app file)
document.addEventListener('deviceready', function() {
  // Listen for universal link events
  window.handleOpenURL = function(url) {
    console.log('Received URL:', url);
    // Handle the URL here
    // Navigate to appropriate screen based on URL
  };
  
  // For cordova-plugin-ionic-deeplink or similar
  window.IonicDeeplinkPlugin && window.IonicDeeplinkPlugin.onDeepLink(function(data) {
    console.log('Deep link data:', data);
  });
});
```

## Expected Console Log Flow (Success)

Khi test thành công, Console logs sẽ như thế này:

```
1. App installed:
swcd: Registering app com.masterisehomes.my.dev for domain suite-dev.masterisegroup.dev

2. iOS downloading AASA (sau vài phút):
swcd: Fetching AASA for suite-dev.masterisegroup.dev
swcd: Successfully downloaded AASA for suite-dev.masterisegroup.dev

3. iOS validating AASA:
swcd: Validating AASA for suite-dev.masterisegroup.dev
swcd: AASA validation succeeded for suite-dev.masterisegroup.dev

4. iOS claiming domain:
swcd: Claiming applinks:suite-dev.masterisegroup.dev for com.masterisehomes.my.dev

5. User taps link:
SpringBoard: Opening URL https://suite-dev.masterisegroup.dev/staffportalmobile in com.masterisehomes.my.dev
```

## Next Steps

1. **Ngay bây giờ:** Kết nối device vào Mac, mở Console, filter theo `swcd`
2. **Test:** Reinstall app theo Method 1
3. **Watch logs:** Xem iOS có claim domain không
4. **Report back:** Paste logs vào chat để tôi analyze

---

**Tài liệu tham khảo:**
- Apple: https://developer.apple.com/documentation/xcode/supporting-associated-domains
- Debug: https://developer.apple.com/library/archive/documentation/General/Conceptual/AppSearch/UniversalLinks.html
