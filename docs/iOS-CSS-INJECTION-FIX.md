# iOS CSS Injection Fix

## Problem

On fresh iOS app installs, CSS styles from CDN were not applied on the first launch. The page would render without styles, and only on the second launch would the CSS appear.

## Root Cause

The original approach used a JavaScript polling interval to inject CSS after the page loaded. On a fresh install, the `deviceready` event fires and `evaluateJavaScript()` runs, but the timing is unreliable — the DOM may not be ready, or WKWebView may not have finished initial navigation.

## Solution: WKUserScript Injection

`CSSInjector.swift` now uses `WKUserScript` with `.atDocumentStart` injection time. This guarantees the script runs before the page renders — no race conditions.

### Implementation

During `pluginInitialize()`, the plugin:

1. Reads the background color from preferences (fallback chain: `WEBVIEW_BACKGROUND_COLOR` → `BackgroundColor` → `SplashScreenBackgroundColor`)
2. Reads `www/assets/cdn-styles.css` from the app bundle
3. Reads `www/cordova-build-config.json` from the app bundle
4. Installs three `WKUserScript` instances on the `WKWebView`'s `userContentController`:

| Script | Priority | Content |
|---|---|---|
| Config | 1 | Sets `window.CORDOVA_BUILD_CONFIG` |
| Background | 2 | Injects background color CSS + sets `document.documentElement.style.backgroundColor` |
| CSS | 3 | Base64-decodes and injects CDN CSS into `<style>` tag |

All scripts use `injectionTime: .atDocumentStart` and `forMainFrameOnly: true`.

### Background Color Validation

The `buildBackgroundUserScript(color:)` method validates the color using a regex pattern:

```swift
let hexPattern = try! NSRegularExpression(pattern: "^#?[A-Fa-f0-9]{6}([A-Fa-f0-9]{2})?$")
```

If the color is invalid, the background override is skipped so default app colors are preserved.

### CSS Injection

CSS content is Base64-encoded to avoid JavaScript string escaping issues:

```javascript
var css = atob('base64EncodedCSS');
var style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);
```

## Android Comparison

`CSSInjector.java` uses a different approach — it polls with a `Handler` and `evaluateJavascript()` because Android WebView doesn't support user scripts. The polling runs up to `MAX_INJECTION_ATTEMPTS` (10) times with delays to ensure the DOM is ready.

Both platforms validate hex colors before injection to prevent script injection.

## Compatibility

- iOS 15+
- Cordova iOS ≥ 6.x
- Xcode 14+
- Swift 5
- Works with `cordova-plugin-ionic-webview` and `cordova-plugin-wkwebview-engine`
