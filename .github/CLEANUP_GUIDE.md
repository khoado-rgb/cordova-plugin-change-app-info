# Cleanup Guide

## Purpose

This guide documents how to remove deprecated hook files from local checkouts. The plugin has consolidated many individual hooks into unified hooks, and old files may remain on disk if you upgraded from an earlier version.

## Automatic Cleanup

Run the cleanup script:

```bash
node scripts/cleanup-old-ios-hooks.js
```

This script removes files that are no longer referenced in `plugin.xml`.

## Current Hook Architecture

All hooks registered in `plugin.xml` (these should NOT be deleted):

### Shared (both platforms)
- `hooks/downloadCDNResources.js`
- `scripts/auto-install-deps.js`
- `hooks/backupAppInfo.js`
- `hooks/injectBuildInfo.js`
- `hooks/customizeColors.js`
- `hooks/sendBuildSuccess.js`

### Android
- `hooks/android/unified-prepare.js`
- `hooks/android/unified-compile.js`

### iOS
- `hooks/ios-cache-clear.js`
- `hooks/ios/unified-prepare-standalone.js`
- `hooks/ios/inject-gradient-splash.js`
- `hooks/ios/force-metadata-override.js`
- `hooks/ios/fix-splash-flicker.js`
- `hooks/ios/unified-build.js`

### Supporting files (used by hooks above, do NOT delete)
- `hooks/utils.js`
- `hooks/changeAppInfo.js`
- `hooks/generateIcons.js`
- `hooks/customizeWebview.js`
- `hooks/gradient-parser.js`
- `hooks/removeConflictingStringsXml.js`
- `hooks/update-splash-theme-color.js`
- `hooks/android/utils.js`
- `hooks/android/aggressive-color-replace.js`
- `hooks/android/fix-red-flash.js`
- `hooks/android/fix-splash-flicker.js`
- `hooks/android/gradient-generator.js`
- `hooks/android/update-android-small-icon.js`
- `hooks/ios/gradient-generator.js`
- `hooks/utils/config-storage.js`

### Legacy files (safe to delete but kept for backward compatibility)
- `hooks/lib/config-loader.js`
- `hooks/lib/config-loader-mobile.js`

## Previously Removed Hooks

These files were deleted during the consolidation and should not exist in the repository:

- `hooks/fix-red-flash-enhanced.js` → merged into `hooks/android/unified-compile.js`
- `hooks/updateSplashScreen.js` → merged into `hooks/customizeColors.js`
- `hooks/ios/fix-launch-screen.js` → replaced by `hooks/ios/fix-splash-flicker.js`
- `hooks/ios/unified-compile.js` → split into `hooks/ios/force-metadata-override.js` + `hooks/ios/fix-splash-flicker.js`
