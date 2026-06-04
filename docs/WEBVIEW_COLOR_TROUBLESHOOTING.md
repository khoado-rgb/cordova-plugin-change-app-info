# WebView Color Troubleshooting

## Problem

A brief white (or wrong color) flash appears between the splash screen dismissing and the web page rendering.

## Cause

When the splash screen hides, the WebView's background color is visible before the HTML/CSS content loads. By default this is white.

## Solution

Set `WEBVIEW_BACKGROUND_COLOR` to match your splash screen color:

```json
{ "name": "WEBVIEW_BACKGROUND_COLOR", "value": "#001833" }
```

## How It Works

### Android

`CSSInjector.java` reads `WEBVIEW_BACKGROUND_COLOR` from preferences during `pluginInitialize()`:

```
Fallback chain: WEBVIEW_BACKGROUND_COLOR → BackgroundColor → SplashScreenBackgroundColor → #FFFFFF
```

It sets the WebView's native background color using `View.setBackgroundColor()` and injects CSS to match.

The color is validated by `isValidHexColor()` using the regex pattern `^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$`. Invalid colors are ignored.

### iOS

`CSSInjector.swift` reads the same preferences during `pluginInitialize()` and:
1. Sets `wkWebView.backgroundColor` and `wkWebView.scrollView.backgroundColor`
2. Installs a `WKUserScript` that sets `document.documentElement.style.backgroundColor` at document start

The color is validated by an `NSRegularExpression` matching `^#?[A-Fa-f0-9]{6}([A-Fa-f0-9]{2})?$`. Invalid colors fall back to `#FFFFFF`.

## Format

- Must be hex format: `#RRGGBB` or `#RRGGBBAA`
- The `#` prefix is optional in the preference but recommended
- Named colors (e.g., `white`, `blue`) are not supported
- `rgb()` format is not supported

## Testing

Set a bright test color to verify it's working:

```json
{ "name": "WEBVIEW_BACKGROUND_COLOR", "value": "#FF0000" }
```

You should see a red flash between splash and page load. Once confirmed, set it to your actual color.

## Tips

- For dark-themed apps, set `WEBVIEW_BACKGROUND_COLOR` to match `SplashScreenBackgroundColor`
- For light-themed apps, `#FFFFFF` (the default) is usually fine
- The Android `preferences.android` section should include this preference since it's typically platform-specific
