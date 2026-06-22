# iOS Build Fix

## Overview

iOS hooks were consolidated from many individual hooks into a small set of unified hooks to prevent conflicts, duplicate file modifications, and build failures.

## Current iOS Hook Pipeline

| Phase | Hook | Purpose |
|---|---|---|
| before_prepare | `hooks/downloadCDNResources.js` | Download CSS from CDN |
| before_prepare | `scripts/auto-install-deps.js` | Install image processing libs |
| before_prepare | `hooks/backupAppInfo.js` | Backup original app info |
| before_prepare | `hooks/ios-cache-clear.js` | Clear icon/name cache |
| after_prepare | `hooks/ios/unified-prepare-standalone.js` | App name, version, icons |
| after_prepare | `hooks/ios/inject-gradient-splash.js` | Gradient splash images |
| after_prepare | `hooks/injectBuildInfo.js` | Write build config JSON |
| after_prepare | `hooks/customizeColors.js` | Apply color preferences |
| before_compile | `hooks/ios/force-metadata-override.js` | Force Info.plist overrides |
| before_compile | `hooks/ios/fix-splash-flicker.js` | Remove UILaunchStoryboardName |
| before_build | `hooks/ios/unified-build.js` | Xcode project fixes |
| after_build | `hooks/sendBuildSuccess.js` | POST build notification |

## What the Unified Hooks Do

### `hooks/ios/unified-prepare-standalone.js` (after_prepare)

Handles all post-prepare iOS tasks in one pass:
- Set `CFBundleDisplayName` and `CFBundleName` in Info.plist
- Set `CFBundleShortVersionString` and `CFBundleVersion`
- Download and generate all icon sizes from CDN
- Write `Contents.json` for the icon asset catalog
- Apply splash screen background color to LaunchScreen.storyboard

### `hooks/ios/unified-build.js` (before_build)

Final Xcode project adjustments:
- Force `PRODUCT_NAME` in build settings
- Verify Info.plist values are correct
- Clean build artifacts if needed

### `hooks/ios/fix-splash-flicker.js` (before_compile)

Removes `UILaunchStoryboardName` from Info.plist to prevent the splash screen from flashing a default storyboard before the configured colors take effect.

### `hooks/ios/force-metadata-override.js` (before_compile)

Forces Info.plist values that may have been overwritten by other plugins or Cordova's own prepare step. Ensures `CFBundleName` and `CFBundleDisplayName` match the configured `APP_NAME`.

## Compatibility

- Cordova iOS ≥ 6.x
- Xcode 14+
- iOS 15+
- OutSystems MABS 12
- Compatible with: `cordova-plugin-splashscreen`, `cordova-plugin-ionic-webview`, `cordova-plugin-statusbar`, `cordova-sqlite-storage`

## Cleanup

Old individual hooks that were replaced by the unified hooks have been removed. If you have a local checkout with leftover files, run:

```bash
node scripts/cleanup-old-ios-hooks.js
```
