# OutSystems MABS Fixes

Common issues and fixes when using this plugin with OutSystems MABS cloud builds.

## CDN Icon Not Found

**Symptom:** Icon generation fails with "CDN_ICON not configured" or download error.

**Cause:** The `CDN_ICON` URL is missing, returns a redirect, or the image is not accessible.

**Fix:**
1. Ensure the `CDN_ICON` URL points directly to a PNG file (no redirects)
2. The image must be 1024×1024 pixels, PNG format, RGB color space
3. Test the URL in a browser — it should show the image directly

```json
{ "name": "CDN_ICON", "value": "https://cdn.example.com/icon-1024.png" }
```

## Duplicate app_name in strings.xml

**Symptom:** Build fails with "duplicate resource" error for `app_name` in `strings.xml`.

**Cause:** Both Cordova and this plugin try to set `<string name="app_name">`.

**Fix:** The `hooks/removeConflictingStringsXml.js` hook automatically removes duplicate `app_name` entries. This runs as part of `hooks/android/unified-prepare.js`. No manual action needed.

## App Name Not Updating on iOS

**Symptom:** The old app name appears on the home screen after rebuilding with a new name.

**Cause:** iOS caches `CFBundleDisplayName` and `CFBundleName` aggressively.

**Fix:**
1. The `hooks/ios-cache-clear.js` hook runs automatically in `before_prepare`
2. `hooks/ios/force-metadata-override.js` forces `Info.plist` values in `before_compile`
3. For manual testing, delete the app from the simulator/device and reinstall

## Plugin Variables Missing

**Symptom:** Build warns about missing plugin variables.

**Cause:** The plugin reads preferences directly from `config.xml` — no `<variable>` declarations needed.

**Fix:** Ensure preferences are in the JSON config under `preferences.global` or platform-specific sections. The OutSystems MABS build system converts them to `<preference>` elements in `config.xml`.

## Version Code Must Be Integer

**Symptom:** Build fails or version code is wrong.

**Fix:** `VERSION_CODE` must be a string containing only digits. It must increment with each build for app store uploads.

```json
{ "name": "VERSION_CODE", "value": "10" }
```

## Splash Screen Color Not Applying

See [Splash Screen Troubleshooting](docs/SPLASH_SCREEN_TROUBLESHOOTING.md) for detailed color debugging.

Quick checklist:
- Use `#RRGGBB` hex format (with `#` prefix)
- Set all four color preferences for consistency:
  - `SplashScreenBackgroundColor`
  - `AndroidWindowSplashScreenBackground`
  - `BackgroundColor`
  - `StatusBarBackgroundColor`
