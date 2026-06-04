# CDN Assets Guide

## Overview

The plugin can download and replace CSS assets from a CDN at build time. This enables multi-tenant apps to customize styling per deployment without changing source code.

## CDN_RESOURCE Preference

Downloads a single CSS file from a CDN URL and places it in `www/assets/`:

```xml
<preference name="CDN_RESOURCE" value="https://cdn.example.com/tenant/app.css" />
```

The `hooks/downloadCDNResources.js` hook runs during `before_prepare` and:
1. Downloads the CSS file from the URL
2. Saves it to `www/assets/cdn-styles.css`
3. The CSS is then injected into the WebView by `CSSInjector` at runtime

### URL Requirements

- Must be a direct URL to a CSS file (HTTPS recommended)
- Supports query parameters for cache busting: `app.css?v=123`
- No redirects — the URL must return the CSS content directly
- Content-Type should be `text/css`

### Example

```json
{
  "preferences": {
    "global": [
      {
        "name": "CDN_RESOURCE",
        "value": "https://cdn.example.com/assets/tenant-123/styles.css"
      }
    ]
  }
}
```

## How CSS Is Injected

### Android
`CSSInjector.java` reads `www/assets/cdn-styles.css` from the APK assets during initialization. It Base64-encodes the CSS and injects it via JavaScript:

```javascript
var style = document.createElement('style');
style.textContent = atob('...base64...');
document.head.appendChild(style);
```

### iOS
`CSSInjector.swift` reads `www/assets/cdn-styles.css` from the app bundle. It creates a `WKUserScript` with `.atDocumentStart` injection time, ensuring the CSS is applied before the page renders.

## CDN Icon

The `CDN_ICON` preference downloads a 1024×1024 PNG and generates all required icon sizes:

```xml
<preference name="CDN_ICON" value="https://cdn.example.com/tenant/icon-1024.png" />
```

### Icon Requirements

- Format: PNG
- Size: 1024×1024 pixels minimum
- Color space: RGB (not CMYK)
- Background: Solid or transparent
- No rounded corners (iOS adds them automatically)

### Generated Sizes

**Android:** `mdpi` (48), `hdpi` (72), `xhdpi` (96), `xxhdpi` (144), `xxxhdpi` (192)

**iOS:** All required sizes from 20×20 to 1024×1024 including @2x and @3x scales for iPhone, iPad, and App Store

Image processing uses `sharp` (preferred) or `jimp` (fallback). These are auto-installed by `scripts/auto-install-deps.js`.

## Multi-Tenant Setup

For multi-tenant OutSystems apps, organize CDN assets by tenant:

```
https://cdn.example.com/assets/
  tenant-1234/
    styles.css
    icon-1024.png
  tenant-5678/
    styles.css
    icon-1024.png
```

Then configure each deployment with the appropriate URLs:

```json
{
  "preferences": {
    "global": [
      { "name": "CDN_ICON", "value": "https://cdn.example.com/assets/tenant-1234/icon-1024.png" },
      { "name": "CDN_RESOURCE", "value": "https://cdn.example.com/assets/tenant-1234/styles.css" },
      { "name": "TENANT_ID", "value": "1234" }
    ]
  }
}
```
