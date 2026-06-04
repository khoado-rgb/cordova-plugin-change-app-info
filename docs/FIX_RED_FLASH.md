# Fix Red/Purple Flash (Android)

## Problem

After the splash screen dismisses on Android, a brief red or purple flash appears before the WebView content is visible.

## Cause

Android's default theme may set `android:windowBackground` to a color that doesn't match the splash screen. During the transition from splash → WebView, this default color is briefly visible.

## Solution

The plugin fixes this with a two-pronged approach:

### 1. Build-time Fix (hooks)

`hooks/android/unified-compile.js` handles color injection during the build:

- Sets `android:windowBackground` in `styles.xml` to match `SplashScreenBackgroundColor`
- Updates `colors.xml` with the splash background color
- Applies `AndroidWindowSplashScreenBackground` for Android 12+ (API 31+)

`hooks/customizeColors.js` applies color preferences to Android resource files:

- `res/values/colors.xml` — splash background color
- `res/values/styles.xml` — window background theme attribute

### 2. Runtime Fix (native)

`CSSInjector.java` sets the WebView's native background color in `pluginInitialize()` before any page loads:

```java
String bgColor = preferences.getString("WEBVIEW_BACKGROUND_COLOR", null);
// Fallback chain: WEBVIEW_BACKGROUND_COLOR → BackgroundColor → SplashScreenBackgroundColor → #FFFFFF
```

The color is validated with `isValidHexColor()` to prevent injection. Invalid colors are ignored.

## Configuration

Set all color preferences to the same value for a seamless transition:

```json
{ "name": "SplashScreenBackgroundColor", "value": "#001833" },
{ "name": "AndroidWindowSplashScreenBackground", "value": "#001833" },
{ "name": "BackgroundColor", "value": "#001833" },
{ "name": "StatusBarBackgroundColor", "value": "#001833" },
{ "name": "WEBVIEW_BACKGROUND_COLOR", "value": "#001833" }
```

## Debugging

```bash
# Check color resources
cat platforms/android/app/src/main/res/values/colors.xml
cat platforms/android/app/src/main/res/values/styles.xml

# Check runtime logs
adb logcat -s CSSInjector:D | grep -i "background\|color"
```

## Compatibility

- Cordova Android 10.x – 13.x
- Android 7.0+ (API 24+)
- Android 12+ (API 31+) with `AndroidWindowSplashScreenBackground`
- OutSystems MABS builds
