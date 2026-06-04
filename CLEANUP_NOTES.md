# Cleanup Notes

## Hook Consolidation Summary

The plugin has undergone several rounds of hook consolidation to reduce conflicts, improve build reliability, and simplify maintenance.

### Current Hook Architecture

**Shared hooks** (used by both platforms):

| Hook | Phase | Purpose |
|---|---|---|
| `hooks/downloadCDNResources.js` | before_prepare | Download CSS from CDN |
| `hooks/backupAppInfo.js` | before_prepare | Backup original app info |
| `hooks/injectBuildInfo.js` | after_prepare | Write build config JSON |
| `hooks/customizeColors.js` | after_prepare | Apply all color preferences |
| `hooks/sendBuildSuccess.js` | after_build | POST build notification |

**Android-specific hooks:**

| Hook | Phase | Purpose |
|---|---|---|
| `hooks/android/unified-prepare.js` | after_prepare | App name, version, icons, splash |
| `hooks/android/unified-compile.js` | before_compile | Final native file overrides |

**iOS-specific hooks:**

| Hook | Phase | Purpose |
|---|---|---|
| `hooks/ios-cache-clear.js` | before_prepare | Clear icon/name cache |
| `hooks/ios/unified-prepare-standalone.js` | after_prepare | App name, version, icons |
| `hooks/ios/inject-gradient-splash.js` | after_prepare | Gradient splash images |
| `hooks/ios/force-metadata-override.js` | before_compile | Force Info.plist values |
| `hooks/ios/fix-splash-flicker.js` | before_compile | Remove UILaunchStoryboardName |
| `hooks/ios/unified-build.js` | before_build | Xcode project fixes |

### Shared Utilities

`hooks/utils.js` provides common functions used across all hooks:

- `getConfigParser(context)` — get Cordova ConfigParser
- `validateHexColor(color)` — validate `#RRGGBB` or `#RRGGBBAA` format
- `normalizeHexColor(color)` — normalize to `#RRGGBB`
- `getImageProcessor()` — load sharp or jimp
- `resizeImage(buffer, path, size)` — resize image with available processor
- `downloadFile(url)` — download file from URL
- `ensureDir(dirPath)` — create directory recursively

`hooks/android/utils.js` is a thin wrapper that re-exports functions from `hooks/utils.js` for backward compatibility.

### Removed Hooks

These files have been deleted and their functionality merged into the unified hooks:

| Removed File | Replaced By |
|---|---|
| `hooks/fix-red-flash-enhanced.js` | `hooks/android/unified-compile.js` |
| `hooks/updateSplashScreen.js` | `hooks/customizeColors.js` |
| `hooks/ios/fix-launch-screen.js` | `hooks/ios/fix-splash-flicker.js` |
| `hooks/ios/unified-compile.js` | `hooks/ios/force-metadata-override.js` + `hooks/ios/fix-splash-flicker.js` |

### Color Handling

All color preferences are processed by `hooks/customizeColors.js` (single source of truth):

- `SplashScreenBackgroundColor` → splash background on both platforms
- `AndroidWindowSplashScreenBackground` → Android 12+ splash
- `BackgroundColor` → fallback background
- `StatusBarBackgroundColor` → status bar
- `WEBVIEW_BACKGROUND_COLOR` → pre-render webview background

Color validation uses `validateHexColor()` from `hooks/utils.js`. Invalid colors are logged and skipped.

### Cleanup Script

To remove any leftover deprecated hook files from a local checkout:

```bash
node scripts/cleanup-old-ios-hooks.js
```

This is safe to run — it only deletes files that are no longer referenced in `plugin.xml`.
