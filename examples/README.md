# Configuration Examples

This folder contains example configurations for OutSystems MABS and Cordova.

## Files

| File | Description |
|---|---|
| `outsystems-config-dev.json` | Development environment config |
| `outsystems-config-staging.json` | Staging environment config |
| `outsystems-config-production.json` | Production config with build notifications |
| `outsystems-config-mabs12-app-distribution.json` | MABS 12 test-build config with App Distribution callback |
| `outsystems-config-with-splash-color.json` | Custom splash screen color |
| `outsystems-config-with-webview-color.json` | Custom webview background color |
| `cordova-config.xml` | Standard Cordova config.xml example |

## OutSystems JSON Format

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
      { "name": "CDN_ICON", "value": "https://cdn.example.com/icon-1024.png" }
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

## Key Preferences

### Required
- `APP_NAME` — Display name on home screen
- `VERSION_NUMBER` — Semantic version (e.g., `1.0.0`)
- `VERSION_CODE` — Integer build number, must increment for app store uploads

### Recommended
- `CDN_ICON` — URL to 1024×1024 PNG icon
- `ENVIRONMENT` — `development`, `staging`, or `production`
- `SplashScreenBackgroundColor` — Hex color for native splash
- `AndroidWindowSplashScreenBackground` — Android 12+ splash color

### Icon Requirements
- Format: PNG
- Size: 1024×1024 pixels
- Color space: RGB (not CMYK)
- No rounded corners (iOS adds these automatically)
- Directly accessible URL (no redirects)

## Environment-Specific Tips

### Development
- Use a distinct `APP_NAME` suffix (e.g., `"MyApp DEV"`) to distinguish from production
- Set `ENVIRONMENT` to `"development"` for runtime identification
- Keep build notifications disabled to reduce noise

### Production
- Pin the plugin to a specific version tag (`#v2.9.20`)
- Enable build notifications for deployment tracking
- `APP_DISTRIBUTION_API` can be used without `ENABLE_BUILD_NOTIFICATION`
- Use separate bearer tokens per environment
- Set `VERSION_CODE` to a higher value than any previous release

## Color Consistency

Color preferences are optional. If you omit them, the plugin preserves the default OutSystems/MABS app colors.

For an explicit seamless launch color override, set all color preferences to the same value:

```json
{ "name": "SplashScreenBackgroundColor", "value": "#112233" },
{ "name": "AndroidWindowSplashScreenBackground", "value": "#112233" },
{ "name": "BackgroundColor", "value": "#112233" },
{ "name": "StatusBarBackgroundColor", "value": "#112233" }
```

Set `WEBVIEW_BACKGROUND_COLOR` only when you need to override the pre-render WebView color.
