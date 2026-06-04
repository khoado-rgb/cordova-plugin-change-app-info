# OutSystems Integration Guide

## Setup

Add the plugin JSON to Service Studio > Extensibility Configuration:

```json
{
  "plugin": {
    "url": "https://github.com/vnkhoado/cordova-plugin-change-app-info.git#v2.9.20"
  },
  "preferences": {
    "global": [
      { "name": "APP_NAME", "value": "MyApp" },
      { "name": "VERSION_NUMBER", "value": "1.0.0" },
      { "name": "VERSION_CODE", "value": "10" },
      { "name": "ENVIRONMENT", "value": "production" },
      { "name": "CDN_ICON", "value": "https://cdn.example.com/icon-1024.png" },
      { "name": "CDN_RESOURCE", "value": "https://cdn.example.com/app.css" },
      { "name": "SplashScreenBackgroundColor", "value": "#001833" },
      { "name": "AndroidWindowSplashScreenBackground", "value": "#001833" },
      { "name": "BackgroundColor", "value": "#001833" },
      { "name": "StatusBarBackgroundColor", "value": "#001833" },
      { "name": "TENANT_ID", "value": "1234" },
      { "name": "AutoHideSplashScreen", "value": "true" }
    ],
    "android": [
      { "name": "WEBVIEW_BACKGROUND_COLOR", "value": "#FFFFFF" },
      { "name": "SplashScreenDelay", "value": "1500" },
      { "name": "FadeSplashScreen", "value": "true" },
      { "name": "FadeSplashScreenDuration", "value": "300" },
      { "name": "AndroidLaunchMode", "value": "singleTask" }
    ],
    "ios": [
      { "name": "FadeSplashScreen", "value": "true" },
      { "name": "FadeSplashScreenDuration", "value": "300" },
      { "name": "target-device", "value": "handset" },
      { "name": "NSCameraUsageDescription", "value": "Camera access required." },
      { "name": "NSPhotoLibraryUsageDescription", "value": "Photo library access required." },
      { "name": "AllowInlineMediaPlayback", "value": "true" },
      { "name": "NSAllowsArbitraryLoads", "value": "false" }
    ]
  }
}
```

## Accessing Config at Runtime

The build config is injected natively by `CSSInjector` and available immediately in JavaScript:

```javascript
// In OutSystems Client Action (JavaScript node)
var config = window.CORDOVA_BUILD_CONFIG || {};
$parameters.AppName = config.appName || '';
$parameters.TenantId = config.tenantId || '';
$parameters.Environment = config.environment || '';
$parameters.AppVersion = config.appVersion || '';
$parameters.Platform = config.platform || '';
```

### Available Config Properties

| Property | Source Preference | Example |
|---|---|---|
| `appName` | `APP_NAME` | `"MyApp"` |
| `appVersion` | `VERSION_NUMBER` | `"1.0.0"` |
| `versionCode` | `VERSION_CODE` | `"10"` |
| `environment` | `ENVIRONMENT` | `"production"` |
| `platform` | (auto-detected) | `"android"` or `"ios"` |
| `buildDate` | (auto-generated) | `"2026-04-11T..."` |
| `tenantId` | `TENANT_ID` | `"1234"` |
| `apiHostname` | `API_HOSTNAME` | `"api.example.com"` |

Custom preferences (`TENANT_*`, `CUSTOM_*`, `CLIENT_*`, `APP_CUSTOM_*`) are auto-converted to camelCase.

## Build Notifications

To receive a POST when the build completes:

```json
{
  "preferences": {
    "global": [
      { "name": "ENABLE_BUILD_NOTIFICATION", "value": "true" },
      { "name": "BUILD_SUCCESS_API_URL", "value": "https://api.example.com/build-notify" },
      { "name": "BUILD_API_BEARER_TOKEN", "value": "your-token" }
    ]
  }
}
```

The `hooks/sendBuildSuccess.js` hook sends a POST request with app name, version, platform, and domain after a successful build.

## SecureTotp in OutSystems

### Get Public Key

```javascript
// JavaScript node in Client Action
cordova.plugins.SecureTotpPlugin.getPublicKey(
  function(publicKey) {
    $resolve(publicKey);  // PEM-encoded RSA-2048 public key
  },
  function(error) {
    $reject(error);
  }
);
```

### Store Encrypted Secret

```javascript
// After server encrypts secret with device's public key (OAEP-SHA256)
cordova.plugins.SecureTotpPlugin.setEncryptedSecret(
  $parameters.EncryptedSecretBase64,
  function() { $resolve(); },
  function(error) { $reject(error); }
);
```

### Generate TOTP Code

```javascript
cordova.plugins.SecureTotpPlugin.getTotpCode(
  6,   // digits
  30,  // period in seconds
  function(result) {
    $parameters.Code = result.code;           // e.g., "123456"
    $parameters.Remaining = result.remaining; // seconds until expiry
    $resolve();
  },
  function(error) { $reject(error); }
);
```

## Color Tips

- Set all splash/background colors to the same value for a seamless app launch
- `WEBVIEW_BACKGROUND_COLOR` controls what shows between splash dismiss and page load
- If your app is dark-themed, set `WEBVIEW_BACKGROUND_COLOR` to match the splash color (not `#FFFFFF`)
- iOS falls back through `WEBVIEW_BACKGROUND_COLOR` → `BackgroundColor` → `SplashScreenBackgroundColor` → `#FFFFFF`

## Common Issues

| Issue | Solution |
|---|---|
| Old app name showing | iOS caches aggressively — `ios-cache-clear.js` runs automatically |
| Icon not updating | Ensure `CDN_ICON` URL returns a 1024×1024 PNG with no redirect |
| Build notification not sent | Set `ENABLE_BUILD_NOTIFICATION` to `"true"` |
| Config not available | Check `window.CORDOVA_BUILD_CONFIG` after `deviceready` |
| White flash between splash and app | Set `WEBVIEW_BACKGROUND_COLOR` to match splash color |
