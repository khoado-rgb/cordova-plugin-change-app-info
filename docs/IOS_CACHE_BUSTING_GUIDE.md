# iOS Cache Busting Guide

## Problem

iOS aggressively caches the app name and icon. After rebuilding with a new `APP_NAME` or `CDN_ICON`, the old name/icon may still appear on the home screen.

## Automatic Fix

The plugin handles this automatically:

1. **`hooks/ios-cache-clear.js`** (before_prepare) — clears cached icon assets and forces a fresh copy
2. **`hooks/ios/force-metadata-override.js`** (before_compile) — forces `CFBundleName` and `CFBundleDisplayName` in Info.plist, even if other plugins overwrote them
3. **`hooks/ios/unified-prepare-standalone.js`** (after_prepare) — regenerates all icon sizes and writes a fresh `Contents.json`

## Manual Debugging

If the old name/icon still appears after a clean build:

### Check Info.plist

```bash
# Find the project name
ls platforms/ios/*.xcodeproj

# Check the plist values
/usr/libexec/PlistBuddy -c "Print CFBundleDisplayName" platforms/ios/MyApp/MyApp-Info.plist
/usr/libexec/PlistBuddy -c "Print CFBundleName" platforms/ios/MyApp/MyApp-Info.plist
```

Both should show your configured `APP_NAME`.

### Check Icon Assets

```bash
ls platforms/ios/MyApp/Assets.xcassets/AppIcon.appiconset/
cat platforms/ios/MyApp/Assets.xcassets/AppIcon.appiconset/Contents.json
```

Verify PNG files exist and `Contents.json` references them correctly.

### Clean Rebuild

```bash
# Remove platform and re-add
cordova platform remove ios
cordova platform add ios
cordova build ios
```

### Simulator Cache

For the iOS Simulator, reset the simulator to clear icon cache:

- Simulator menu → Device → Erase All Content and Settings

### Device Cache

On a physical device:
1. Delete the app from the device
2. Rebuild and reinstall
3. The new name/icon should appear immediately

## Xcode Build Cache

If building via Xcode:
1. Product → Clean Build Folder (Shift+Cmd+K)
2. Close and reopen the project
3. Build again
