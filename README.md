# cordova-plugin-change-app-info

> Cordova plugin to change app display name, version, and icon from CDN at build time. Includes E2EE TOTP security, native config injection, gradient splash screens, and CSS/JS asset replacement.

**Version:** 2.9.20  
**License:** MIT  
**Author:** vnkhoado

## Features

- **App Info Override** — Change app name, version number, and version code at build time
- **CDN Icon** — Download and generate all icon sizes from a single CDN URL (1024×1024 PNG)
- **CDN Resource** — Download CSS from CDN and inject into the app at build time
- **Native Config Injection** — Build config available instantly via `window.CORDOVA_BUILD_CONFIG`
- **Gradient Splash Screens** — CSS gradient syntax for native splash screens on Android and iOS
- **Color Customization** — Splash screen, status bar, and webview background colors
- **E2EE TOTP** — RSA-2048 OAEP-SHA256 encryption with Android Keystore / iOS Keychain
- **OutSystems MABS 12** — Full compatibility with OutSystems cloud builds

## Requirements

- Cordova ≥ 9.0.0
- Node.js ≥ 14.0.0
- **Image processing** (optional, for icon generation):
  - `sharp` ^0.33.0 (recommended) or `jimp` ^1.6.0 (fallback)
  - Auto-installed by `scripts/auto-install-deps.js` during build

## Installation

```bash
cordova plugin add https://github.com/vnkhoado/cordova-plugin-change-app-info.git
```

Pin a specific version:

```bash
cordova plugin add https://github.com/vnkhoado/cordova-plugin-change-app-info.git#v2.9.20
```

## Configuration

Add preferences to `config.xml`:

```xml
<preference name="APP_NAME" value="MyApp" />
<preference name="VERSION_NUMBER" value="1.0.0" />
<preference name="VERSION_CODE" value="10" />
<preference name="CDN_ICON" value="https://cdn.example.com/icon-1024.png" />
<preference name="CDN_RESOURCE" value="https://cdn.example.com/app.css" />

<!-- Colors -->
<preference name="SplashScreenBackgroundColor" value="#112233" />
<preference name="AndroidWindowSplashScreenBackground" value="#112233" />
<preference name="BackgroundColor" value="#112233" />
<preference name="StatusBarBackgroundColor" value="#112233" />
<preference name="WEBVIEW_BACKGROUND_COLOR" value="#FFFFFF" />

<!-- Optional -->
<preference name="ENVIRONMENT" value="production" />
<preference name="TENANT_ID" value="1234" />
```

### OutSystems MABS 12 Config (JSON)

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
      { "name": "CDN_ICON", "value": "https://cdn.example.com/icon-1024.png" },
      { "name": "SplashScreenBackgroundColor", "value": "#112233" },
      { "name": "AndroidWindowSplashScreenBackground", "value": "#112233" },
      { "name": "BackgroundColor", "value": "#112233" },
      { "name": "TENANT_ID", "value": "1234" }
    ],
    "android": [
      { "name": "WEBVIEW_BACKGROUND_COLOR", "value": "#FFFFFF" }
    ],
    "ios": [
      { "name": "NSCameraUsageDescription", "value": "Camera access required." }
    ]
  }
}
```

## Supported Preferences

| Preference | Description | Example |
|---|---|---|
| `APP_NAME` | App display name | `"MyApp"` |
| `VERSION_NUMBER` | Semantic version | `"1.0.0"` |
| `VERSION_CODE` | Build number (integer) | `"10"` |
| `CDN_ICON` | URL to 1024×1024 PNG icon | `"https://..."` |
| `CDN_RESOURCE` | URL to CSS file | `"https://..."` |
| `ENVIRONMENT` | Environment label | `"production"` |
| `SplashScreenBackgroundColor` | Splash background (hex) | `"#112233"` |
| `AndroidWindowSplashScreenBackground` | Android 12+ splash | `"#112233"` |
| `BackgroundColor` | Fallback background | `"#112233"` |
| `StatusBarBackgroundColor` | Status bar color | `"#112233"` |
| `WEBVIEW_BACKGROUND_COLOR` | Pre-render webview color | `"#FFFFFF"` |
| `SPLASH_GRADIENT` | CSS gradient for splash | `"linear-gradient(...)"` |
| `ENABLE_BUILD_NOTIFICATION` | Send POST after build | `"true"` |
| `BUILD_SUCCESS_API_URL` | Notification endpoint | `"https://..."` |
| `BUILD_API_BEARER_TOKEN` | Bearer token | `"token"` |

### Custom Preferences (Auto-captured)

Preferences with these prefixes are automatically included in runtime config:

- `TENANT_*` → e.g., `TENANT_ID` becomes `window.CORDOVA_BUILD_CONFIG.tenantId`
- `CUSTOM_*` → e.g., `CUSTOM_REGION` becomes `customRegion`
- `CLIENT_*` → e.g., `CLIENT_ID` becomes `clientId`
- `APP_CUSTOM_*` → e.g., `APP_CUSTOM_THEME` becomes `appCustomTheme`

Names that look sensitive, such as `SECRET`, `TOKEN`, `PASSWORD`, `BEARER`, `AUTH`, or `API_KEY`, are skipped and never injected into `window.CORDOVA_BUILD_CONFIG`.

## Runtime Config Access

Build config is injected natively by `CSSInjector` before the page loads — no file fetch or waiting:

```javascript
document.addEventListener('deviceready', function() {
  const config = window.CORDOVA_BUILD_CONFIG;
  console.log(config.appName);       // "MyApp"
  console.log(config.appVersion);    // "1.0.0"
  console.log(config.versionCode);   // "10"
  console.log(config.environment);   // "production"
  console.log(config.tenantId);      // "1234"
  console.log(config.platform);      // "android" or "ios"
  console.log(config.buildDate);     // ISO timestamp
});
```

`window.AppConfig` is also set as an alias.

## SecureTotp Plugin (E2EE)

Hardware-backed RSA-2048 key pair for end-to-end encrypted TOTP:

```javascript
// Get device public key (PEM format)
cordova.plugins.SecureTotpPlugin.getPublicKey(successCb, errorCb);

// Store server-encrypted secret
cordova.plugins.SecureTotpPlugin.setEncryptedSecret(encryptedBase64, successCb, errorCb);

// Generate TOTP code
cordova.plugins.SecureTotpPlugin.getTotpCode(30, 0, function(code) {
  console.log(code); // "123456"
}, errorCb);
```

### Security

| Feature | Android | iOS |
|---|---|---|
| Key Storage | Android Keystore (StrongBox/TEE) | iOS Keychain |
| RSA Padding | OAEP-SHA256 | OAEP-SHA256 |
| Secret Storage | EncryptedSharedPreferences (AES-256-GCM) | Keychain |
| TOTP Algorithm | HMAC-SHA256 (RFC 6238) | HMAC-SHA256 (RFC 6238) |
| Origin Check | Exact host match via `Uri.parse()` | Exact host match via `url.host` |

## Build Hook Pipeline

### Android

| Phase | Hook | Purpose |
|---|---|---|
| before_prepare | `hooks/downloadCDNResources.js` | Download CSS from CDN |
| before_prepare | `scripts/auto-install-deps.js` | Install sharp/jimp if needed |
| before_prepare | `hooks/backupAppInfo.js` | Backup original app info |
| after_prepare | `hooks/android/unified-prepare.js` | App name, version, icons, splash |
| after_prepare | `hooks/injectBuildInfo.js` | Write build config JSON |
| after_prepare | `hooks/customizeColors.js` | Apply color preferences |
| before_compile | `hooks/android/unified-compile.js` | Final native file overrides |
| after_build | `hooks/sendBuildSuccess.js` | POST build notification |

### iOS

| Phase | Hook | Purpose |
|---|---|---|
| before_prepare | `hooks/downloadCDNResources.js` | Download CSS from CDN |
| before_prepare | `scripts/auto-install-deps.js` | Install sharp/jimp if needed |
| before_prepare | `hooks/backupAppInfo.js` | Backup original app info |
| before_prepare | `hooks/ios-cache-clear.js` | Clear icon/name cache |
| after_prepare | `hooks/ios/unified-prepare-standalone.js` | App name, version, icons, splash |
| after_prepare | `hooks/ios/inject-gradient-splash.js` | Gradient splash images |
| after_prepare | `hooks/injectBuildInfo.js` | Write build config JSON |
| after_prepare | `hooks/customizeColors.js` | Apply color preferences |
| before_compile | `hooks/ios/force-metadata-override.js` | Force Info.plist overrides |
| before_compile | `hooks/ios/fix-splash-flicker.js` | Remove UILaunchStoryboardName |
| before_build | `hooks/ios/unified-build.js` | Xcode project fixes |
| after_build | `hooks/sendBuildSuccess.js` | POST build notification |

## Project Structure

```
plugin.xml                           # Plugin manifest (v2.9.20)
package.json                         # npm metadata & dependencies
src/
  android/
    CSSInjector.java                 # CSS/config injection into WebView
    LogUtil.java                     # Debug-only logging utility
    SecureTotpManager.java           # RSA key management + TOTP generation
    SecureTotpPlugin.java            # Cordova bridge for TOTP actions
    res/values/colors.xml            # Default color resources
    res/values/styles.xml            # Default theme styles
    res/values-night/colors.xml      # Dark mode colors
  ios/
    CSSInjector.swift                # WKUserScript injection for CSS/config
    SecureTotpManager.swift          # RSA key management + TOTP generation
    SecureTotpPlugin.swift           # Cordova bridge for TOTP actions
www/
    CSSInjector.js                   # JS bridge for CSSInjector
    SecureTotpPlugin.js              # JS bridge for SecureTotpPlugin
hooks/
    utils.js                         # Shared utilities (image, color, config)
    downloadCDNResources.js          # CDN CSS download
    backupAppInfo.js                 # Backup original app info
    changeAppInfo.js                 # Modify app name/version in native files
    generateIcons.js                 # Generate icon sizes from CDN image
    injectBuildInfo.js               # Write build config JSON for native injection
    customizeColors.js               # Apply splash/status bar/webview colors
    customizeWebview.js              # Webview background color helper
    sendBuildSuccess.js              # POST build success notification
    gradient-parser.js               # Parse CSS gradient syntax
    ios-cache-clear.js               # iOS icon/name cache clearing
    removeConflictingStringsXml.js   # Remove duplicate Android strings
    update-splash-theme-color.js     # Update splash theme color resources
    android/
      unified-prepare.js             # Android after_prepare (consolidated)
      unified-compile.js             # Android before_compile (consolidated)
      aggressive-color-replace.js    # Deep Android color replacement
      fix-red-flash.js               # Fix red/purple flash after splash
      fix-splash-flicker.js          # Fix splash screen flicker
      gradient-generator.js          # Android gradient image generation
      update-android-small-icon.js   # Android notification small icon
      utils.js                       # Android utils (wraps hooks/utils.js)
    ios/
      unified-prepare-standalone.js  # iOS after_prepare (consolidated)
      unified-build.js               # iOS before_build
      fix-splash-flicker.js          # Remove UILaunchStoryboardName
      force-metadata-override.js     # Force Info.plist values
      inject-gradient-splash.js      # iOS gradient splash injection
      gradient-generator.js          # iOS gradient image generation
    lib/
      config-loader.js               # Node.js config loader (legacy)
      config-loader-mobile.js        # Mobile config loader (legacy)
    utils/
      config-storage.js              # JSON config file storage
scripts/
    auto-install-deps.js             # Auto-install sharp/jimp at build time
    before-compile.js                # Before compile helper
    cleanup-old-ios-hooks.js         # Remove deprecated hook files
    npmInstall.js                    # npm install helper
    postinstall.js                   # Post-install setup
```

## Documentation

| Guide | Description |
|---|---|
| [Splash Screen Troubleshooting](docs/SPLASH_SCREEN_TROUBLESHOOTING.md) | Color not applying, format issues |
| [WebView Color Troubleshooting](docs/WEBVIEW_COLOR_TROUBLESHOOTING.md) | Pre-render background issues |
| [iOS CSS Injection Fix](docs/iOS-CSS-INJECTION-FIX.md) | WKUserScript timing fix |
| [Gradient Implementation](docs/GRADIENT_IMPLEMENTATION.md) | CSS gradient splash screens |
| [Red Flash Fix](docs/FIX_RED_FLASH.md) | Android red/purple flash fix |
| [CDN Assets Guide](CDN_ASSETS_GUIDE.md) | Multi-asset CDN replacement |
| [CDN Resource Downloader](CDN-RESOURCE-DOWNLOADER.md) | CSS download from CDN |
| [Native Config Injection](NATIVE_CONFIG_INJECTION.md) | How native injection works |
| [OutSystems Integration](OUTSYSTEMS_INTEGRATION.md) | OutSystems setup guide |
| [Installation Guide](INSTALLATION_GUIDE.md) | Detailed installation steps |

## License

MIT
