# Changelog

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
