# Testing Guide

## Build Verification

After a build, verify these items:

### 1. App Name

- **Android:** Check `platforms/android/app/src/main/res/values/strings.xml` for `<string name="app_name">`
- **iOS:** Check Info.plist for `CFBundleDisplayName` and `CFBundleName`

### 2. Version

- **Android:** Check `AndroidManifest.xml` for `android:versionName` and `android:versionCode`
- **iOS:** Check Info.plist for `CFBundleShortVersionString` and `CFBundleVersion`

### 3. Icons

- **Android:** Check `platforms/android/app/src/main/res/mipmap-*/` for icon PNGs
- **iOS:** Check `platforms/ios/*/Assets.xcassets/AppIcon.appiconset/` for icon PNGs and `Contents.json`

### 4. Colors

- **Android:** Check `platforms/android/app/src/main/res/values/colors.xml` for splash colors
- **iOS:** Check LaunchScreen.storyboard for background color RGB values

### 5. Runtime Config

Open a JavaScript console in the running app:

```javascript
console.log(JSON.stringify(window.CORDOVA_BUILD_CONFIG, null, 2));
```

Expected output:

```json
{
  "appName": "MyApp",
  "appVersion": "1.0.0",
  "versionCode": "10",
  "environment": "production",
  "platform": "android",
  "buildDate": "2026-04-11T...",
  "tenantId": "1234"
}
```

### 6. CSS Injection

Verify the CDN CSS was injected:

```javascript
// Check if CDN styles are present
document.querySelectorAll('style').forEach(s => console.log(s.textContent.substring(0, 100)));
```

### 7. SecureTotp

```javascript
// Test key generation
cordova.plugins.SecureTotpPlugin.getPublicKey(
  function(key) { console.log('Public key:', key.substring(0, 50) + '...'); },
  function(err) { console.error('Error:', err); }
);
```

## Android Debugging

### Logcat

```bash
# Plugin logs
adb logcat -s CSSInjector:D SecureTotpPlugin:D SecureTotpManager:D

# All plugin-related logs
adb logcat | grep -E "CSSInjector|SecureTotpPlugin|changeAppInfo|generateIcons"
```

### Build Hook Logs

Hook execution is logged to the console during build. Look for:

```
══════════════════════════════════
        GENERATE ICONS HOOK
══════════════════════════════════
✅ Using sharp for image processing
🌐 CDN URL: https://cdn.example.com/icon.png
```

## iOS Debugging

### Xcode Console

Filter for `[CSSInjector]` or `[SecureTotpPlugin]` in the Xcode console output.

### Safari Web Inspector

1. Enable Web Inspector on the device: Settings → Safari → Advanced → Web Inspector
2. Open Safari on Mac → Develop → [Device Name] → [App]
3. Check `window.CORDOVA_BUILD_CONFIG` in the console

## Common Test Scenarios

| Scenario | Expected Behavior |
|---|---|
| Fresh install | Config injected, CSS applied, icon correct |
| App update (same name) | Name/icon unchanged, version updated |
| App update (new name) | New name on home screen, old data preserved |
| No CDN_ICON configured | Default icon used, no errors |
| No CDN_RESOURCE configured | No CSS injected, no errors |
| No internet during build | CDN downloads fail gracefully, build succeeds |
| Invalid color format | Falls back to white (`#FFFFFF`) |
