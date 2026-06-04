# Installation Guide

## Quick Start

### Cordova CLI

```bash
cordova plugin add https://github.com/vnkhoado/cordova-plugin-change-app-info.git
```

Pin a version for reproducible builds:

```bash
cordova plugin add https://github.com/vnkhoado/cordova-plugin-change-app-info.git#v2.9.20
```

### OutSystems MABS

Add to the Extensibility Configuration in Service Studio:

```json
{
  "plugin": {
    "url": "https://github.com/vnkhoado/cordova-plugin-change-app-info.git#v2.9.20"
  },
  "preferences": {
    "global": [
      { "name": "APP_NAME", "value": "MyApp" },
      { "name": "VERSION_NUMBER", "value": "1.0.0" },
      { "name": "VERSION_CODE", "value": "1" },
      { "name": "CDN_ICON", "value": "https://cdn.example.com/icon-1024.png" }
    ]
  }
}
```

## Dependencies

### Required
- Cordova ≥ 9.0.0
- Node.js ≥ 14.0.0

### Optional (Image Processing)
- `sharp` ^0.33.0 — recommended, fast native library
- `jimp` ^1.6.0 — pure JavaScript fallback

These are auto-installed by `scripts/auto-install-deps.js` during the first build. No manual installation needed for MABS builds.

### Android
- `androidx.security:security-crypto:1.1.0-alpha06` — EncryptedSharedPreferences for TOTP
- `commons-codec:commons-codec:1.15` — HMAC utilities

### iOS
- `Security.framework` — Keychain and SecKey
- `WebKit.framework` — WKWebView and WKUserScript
- Swift 5

All native dependencies are declared in `plugin.xml` and installed automatically.

## Verification

After building, check that:

1. **App name** — shows the configured `APP_NAME` (not the default)
2. **App icon** — shows the CDN icon (if `CDN_ICON` configured)
3. **Runtime config** — open the JS console and check `window.CORDOVA_BUILD_CONFIG`
4. **Colors** — splash screen and status bar use the configured colors

### Android Logs

```bash
adb logcat -s CSSInjector:D SecureTotpPlugin:D
```

### iOS Logs

Filter Xcode console for `[CSSInjector]` or `[SecureTotpPlugin]`.

## Uninstall

```bash
cordova plugin remove cordova-plugin-change-app-info
```
