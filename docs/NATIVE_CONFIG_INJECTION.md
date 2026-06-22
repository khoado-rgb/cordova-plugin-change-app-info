# Native Config Injection

## Overview

Build configuration is injected natively into the WebView by `CSSInjector` on both platforms. The config is available as `window.CORDOVA_BUILD_CONFIG` before the page loads — no file fetching or timing workarounds needed.

## How It Works

### Build Time

1. `hooks/injectBuildInfo.js` (after_prepare) reads preferences from `config.xml`
2. Generates two JSON files:
   - `www/cordova-build-config.json` — flat key-value config for native injection
   - `www/.cordova-app-data/build-config.json` — full nested config with metadata
3. Custom preferences with prefixes `TENANT_*`, `CUSTOM_*`, `CLIENT_*`, `APP_CUSTOM_*` are auto-included
4. Preference names are converted to camelCase: `TENANT_ID` → `tenantId`

### Runtime

1. **Android:** `CSSInjector.java` reads `www/cordova-build-config.json` from assets during `pluginInitialize()` and injects it as a `<script>` tag via JavaScript polling
2. **iOS:** `CSSInjector.swift` reads `www/cordova-build-config.json` from the bundle during `pluginInitialize()` and injects it as a `WKUserScript` at `.atDocumentStart`

Both set:
```javascript
window.CORDOVA_BUILD_CONFIG = { appName: "MyApp", tenantId: "1234", ... };
window.AppConfig = window.CORDOVA_BUILD_CONFIG; // alias
```

## Config Structure

```javascript
window.CORDOVA_BUILD_CONFIG = {
  appName: "MyApp",
  appVersion: "1.0.0",
  versionCode: "10",
  environment: "production",
  platform: "android",  // or "ios"
  buildDate: "2026-04-11T10:00:00.000Z",
  apiHostname: "api.example.com",
  cdnIcon: "https://cdn.example.com/icon.png",

  // Custom preferences (auto-captured by prefix)
  tenantId: "1234",
  customApiKey: "abc123",
  clientDomain: "client.example.com"
};
```

## Access in JavaScript

```javascript
document.addEventListener('deviceready', function() {
  var config = window.CORDOVA_BUILD_CONFIG || {};
  console.log(config.appName);
  console.log(config.tenantId);
});
```

Or listen for the config-ready event:

```javascript
document.addEventListener('cordova-config-ready', function(e) {
  console.log(e.detail.config);
});
```

## Legacy Config Loaders

The files `hooks/lib/config-loader.js` and `hooks/lib/config-loader-mobile.js` are legacy implementations that loaded config from JSON files at runtime. They are no longer needed — native injection is faster and eliminates race conditions. These files remain in the repository for backward compatibility but are not used by the current hook pipeline.
