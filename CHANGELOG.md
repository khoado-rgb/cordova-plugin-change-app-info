# Changelog

## v2.14.1 (2026-08-10)

### Fixed
- Applying the brand colour no longer shares a `try` block with the config-ready dispatch. At document start `documentElement` may not exist yet; the throw was swallowed by the outer `catch`, taking `cordova-config-ready` down with it. `applyBrandColor()` now owns its errors and retries on `DOMContentLoaded`

## v2.14.0 (2026-08-10)

### Added
- Brand colour is written inline on `documentElement` via `style.setProperty(name, value, 'important')`, so it outranks any `:root` rule from a stylesheet loaded later during SPA navigation and survives screen changes
- `PRIMARY_COLOR_VAR` preference selects the CSS custom property to write; defaults to `--color-primary` and is validated against `^--[a-zA-Z0-9_-]+$`
- `CSSInjector.applyPrimaryColor()` for re-applying if the style attribute is cleared

## v2.13.0 (2026-08-09)

### Performance (Android)
- Register config and stylesheet through `WebViewCompat.addDocumentStartJavaScript` — the counterpart of iOS's `WKUserScript`. Scripts now run before the page's own JavaScript and are re-run by the platform for every document, which removes the polling loop and closes the window where `window.AppConfig` was undefined after a reload. Requires WebView 83+; the polling path remains as fallback
- Origin rules are built from the same preferences `isSafeOrigin()` uses, never the `"*"` wildcard. `file://` cannot be expressed as a rule, so `documentStartCoversOrigin()` checks the current URL before skipping the legacy path
- The polling loop no longer re-sends work that already landed. Previously all 10 rounds ran, rebuilding and marshalling the full CDN stylesheet each time — roughly 6.6 MB across the bridge in the first two seconds
- `evaluateJavascript()` replaces the deprecated `loadUrl("javascript:")`, which caps payloads at the URL length limit and pushes a history entry

### Fixed
- The new injection guard also short-circuited the `injectCSS` action, whose documented purpose is re-injecting at runtime. `injectCSSIntoWebView` now takes a `force` flag so the JS-initiated call always re-injects

## v2.12.0 (2026-08-09)

### Added
- Brand colour resolved at build time from `PRIMARY_COLOR`, then `BackgroundColor`, then `--color-primary` in the stylesheet downloaded from `CDN_RESOURCE`, and published as `config.primaryColor`
- `hooks/lib/theme-color.js` normalises hex, `rgb()` and `rgba()` to hex and resolves one level of `var()` indirection. Named colours, `url(...)` and malformed values are rejected — the value is serialised into the config injected into the page
- `CSSInjector.getPrimaryColor()`, `getConfig()` and `onConfigReady()`. The last fires immediately when the config is already present, so a screen registering late does not wait on an event already dispatched

## v2.11.0 (2026-08-08)

### Added
- `URL_SCHEME` preference registers a custom scheme in `CFBundleURLTypes` (iOS) and as an intent-filter without `autoVerify` (Android), reachable from contexts that keep the URL instead of handing it to the OS — Chrome on iOS, Google Chat, in-app browsers. Scheme URLs arrive through the same `UniversalLinks.subscribe()` callback. Unset by default

## v2.10.0 (2026-08-07)

### Added
- Universal links are delivered to JavaScript at runtime. cordova-ios implements no `application:continueUserActivity:restorationHandler:` (checked against CordovaLib 6.2.0 and 7.1.1), so `CAIUniversalLinks` installs it on the AppDelegate class at `+load` — MABS regenerates `AppDelegate.m` on every build. Android reads the URL from the launching intent and `onNewIntent`, with a guard extra so `onResume` cannot replay it
- `cordova.plugins.UniversalLinks.subscribe()`. A cold-start link is held natively and replayed on subscribe, so registering late is safe

### Fixed
- Associated domains are written to every entitlements file the Xcode project references, not just the first. `updateXcodeEntitlementsSetting` no longer overwrites settings that are already present — it wrote one path over every build configuration, repointing Release at `Entitlements-Debug.plist` so release builds signed with `get-task-allow` and `aps-environment=development`

## v2.9.20 (2026-04-11)

### Security Hardening
- Migrate RSA padding from PKCS1 to OAEP-SHA256 on both Android and iOS
- Fix origin bypass: exact host match via `Uri.parse()` / `url.host` instead of substring `.contains()`
- Add hex color validation before CSS injection (Android `isValidHexColor()`, iOS `NSRegularExpression`)
- Add argument bounds checks in `SecureTotpPlugin` on both platforms
- Cache `EncryptedSharedPreferences` via `getEncryptedPrefs()` to avoid repeated re-creation
- Zero sensitive byte arrays (`Arrays.fill()`) after cryptographic operations
- Add division-by-zero guard on TOTP expiry calculation
- Reduce config logging to prevent sensitive data exposure

### Hook Refactoring
- Create `hooks/android/unified-prepare.js` and `hooks/android/unified-compile.js`
- Consolidate duplicate utility functions into `hooks/utils.js`
- Rewrite `hooks/android/utils.js` as thin wrapper over shared `hooks/utils.js`
- Remove orphan hooks: `fix-red-flash-enhanced.js`, `updateSplashScreen.js`, `ios/fix-launch-screen.js`, `ios/unified-compile.js`

### Dead Code Removal
- Remove unused `readHTMLFromAssets()`, `readStream()` from `CSSInjector.java`
- Remove unused imports (`WebView`, `ByteArrayInputStream`) and `INDEX_HTML_PATH` constant
- Clean up unused imports across native source files

### Dependency Updates
- Fix 5 npm vulnerabilities (1 critical, 3 high, 1 moderate)
- Update `@xmldom/xmldom`, `ini`, `minimist`, `semver`, `xml2js` to safe versions
- Upgrade `jimp` from ^0.22.0 to ^1.6.1 (major version)
- Update all hooks to jimp v1.x API: `require('jimp').Jimp`, `fromBuffer()`, `resize({w,h})`, `write()`

## v2.9.13

### Color Consolidation
- New unified `hooks/customizeColors.js` — single source of truth for all color preferences
- Enhanced `hooks/utils.js` with `validateHexColor()` and `normalizeHexColor()`
- New `hooks/ios/fix-splash-flicker.js` — removes `UILaunchStoryboardName` to fix iOS splash flash

## v2.9.7

### iOS Build Optimization
- Consolidate 14 iOS hooks into 3 unified hooks:
  - `hooks/ios/unified-prepare-standalone.js` (after_prepare)
  - `hooks/ios/unified-build.js` (before_build)
  - `hooks/ios/fix-splash-flicker.js` (before_compile)
- Eliminate hook conflicts and duplicate file modifications
- Add `hooks/ios/force-metadata-override.js` for reliable Info.plist overrides

## v2.9.0

### Native Config Injection
- Build config injected natively via `CSSInjector.java` / `CSSInjector.swift`
- Config available as `window.CORDOVA_BUILD_CONFIG` before page loads
- No file-based config loading required — eliminates race conditions
- Custom preference prefixes auto-captured: `TENANT_*`, `CUSTOM_*`, `CLIENT_*`, `APP_CUSTOM_*`

## v2.7.0

### CDN Resource Download
- `hooks/downloadCDNResources.js` downloads CSS from CDN at build time
- Automatic injection into app assets
- Support for CSS files with cache-busting query parameters

### Gradient Splash Screens
- `SPLASH_GRADIENT` preference for CSS gradient splash screens
- Native gradient generation using `sharp` or `jimp`
- Support for linear gradients with angles and color stops

## v2.0.0

### Initial Features
- App name, version number, version code override from config.xml
- CDN icon download and icon generation for all sizes
- Build success notification API
- OutSystems MABS compatibility
