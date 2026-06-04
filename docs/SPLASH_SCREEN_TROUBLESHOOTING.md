# Splash Screen Troubleshooting

## Color Not Applying

### Check Color Format

Colors must be in `#RRGGBB` hex format:

```xml
<!-- Correct -->
<preference name="SplashScreenBackgroundColor" value="#001833" />

<!-- Wrong -->
<preference name="SplashScreenBackgroundColor" value="001833" />
<preference name="SplashScreenBackgroundColor" value="rgb(0,24,51)" />
<preference name="SplashScreenBackgroundColor" value="darkblue" />
```

### Set All Color Preferences

For consistent behavior across platforms, set all four:

```json
{ "name": "SplashScreenBackgroundColor", "value": "#001833" },
{ "name": "AndroidWindowSplashScreenBackground", "value": "#001833" },
{ "name": "BackgroundColor", "value": "#001833" },
{ "name": "StatusBarBackgroundColor", "value": "#001833" }
```

### Android-Specific

- `AndroidWindowSplashScreenBackground` is required for Android 12+ (API 31+)
- `SplashScreenBackgroundColor` handles older Android versions
- Both are processed by `hooks/customizeColors.js`

### iOS-Specific

- Colors are injected into `LaunchScreen.storyboard` as RGB float values
- `hooks/ios/fix-splash-flicker.js` removes `UILaunchStoryboardName` to prevent default storyboard flash
- `hooks/ios/force-metadata-override.js` ensures values aren't overwritten

## White Flash Between Splash and App

If you see a brief white flash after the splash screen dismisses:

1. Set `WEBVIEW_BACKGROUND_COLOR` to match the splash color:
   ```json
   { "name": "WEBVIEW_BACKGROUND_COLOR", "value": "#001833" }
   ```

2. The `CSSInjector` sets the webview background color before any page loads

3. iOS fallback chain: `WEBVIEW_BACKGROUND_COLOR` → `BackgroundColor` → `SplashScreenBackgroundColor` → `#FFFFFF`

## Gradient Splash Screens

Use the `SPLASH_GRADIENT` preference for CSS gradient splash screens:

```xml
<preference name="SPLASH_GRADIENT" value="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" />
```

See [Gradient Implementation](GRADIENT_IMPLEMENTATION.md) for details.

## Splash Screen Delay

```json
{ "name": "SplashScreenDelay", "value": "1500" },
{ "name": "FadeSplashScreen", "value": "true" },
{ "name": "FadeSplashScreenDuration", "value": "300" },
{ "name": "AutoHideSplashScreen", "value": "true" }
```

## Debugging

### Android

```bash
adb logcat -s CSSInjector:D | grep -i "background\|color\|splash"
```

### iOS

Filter Xcode console for `[CSSInjector]` — look for "Background UserScript installed" messages.
