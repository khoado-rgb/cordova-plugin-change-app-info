# OutSystems MABS 12 Integration Guide

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
      { "name": "TENANT_ID", "value": "1234" },
      { "name": "AutoHideSplashScreen", "value": "true" }
    ],
    "android": [
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

To send build metadata to an App Distribution endpoint without enabling the Build Success API:

```json
{
  "preferences": {
    "global": [
      { "name": "APP_DISTRIBUTION_API", "value": "https://api.example.com/app-distribution" },
      { "name": "APP_DISTRIBUTION_BEARER_TOKEN", "value": "your-token" }
    ]
  }
}
```

Keep bearer tokens out of source control. Replace placeholder values inside the OutSystems build configuration.

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
  30, // period in seconds
  0,  // time offset in seconds
  function(code) {
    $parameters.Code = code; // e.g., "123456"
    $resolve();
  },
  function(error) { $reject(error); }
);
```

## Color Tips

- Color preferences are optional. If omitted, the plugin preserves the default OutSystems/MABS app colors.
- Set all splash/background colors to the same value only when you want an explicit color override.
- `WEBVIEW_BACKGROUND_COLOR` controls what shows between splash dismiss and page load when explicitly configured.
- Invalid color values are ignored instead of falling back to a hardcoded color.

## Common Issues

| Issue | Solution |
|---|---|
| Old app name showing | iOS caches aggressively — `ios-cache-clear.js` runs automatically |
| Icon not updating | Ensure `CDN_ICON` URL returns a 1024×1024 PNG with no redirect |
| Build notification not sent | Set `ENABLE_BUILD_NOTIFICATION` to `"true"` and configure `BUILD_SUCCESS_API_URL` |
| App Distribution callback not sent | Configure `APP_DISTRIBUTION_API`; `ENABLE_BUILD_NOTIFICATION` is not required |
| Config not available | Check `window.CORDOVA_BUILD_CONFIG` after `deviceready` |
| White flash between splash and app | Set `WEBVIEW_BACKGROUND_COLOR` to match splash color |
