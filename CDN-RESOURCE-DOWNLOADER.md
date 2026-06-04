# CDN Resource Downloader

## Overview

The `hooks/downloadCDNResources.js` hook downloads a CSS file from a CDN URL at build time and saves it for runtime injection by `CSSInjector`.

## Configuration

```xml
<preference name="CDN_RESOURCE" value="https://cdn.example.com/app-styles.css" />
```

Or in OutSystems JSON:

```json
{ "name": "CDN_RESOURCE", "value": "https://cdn.example.com/app-styles.css" }
```

## Behavior

1. Runs during `before_prepare` phase (before platform files are copied)
2. Downloads the CSS file via HTTPS
3. Saves to `www/assets/cdn-styles.css`
4. If the download fails, the build continues without the CSS (warning logged)

## Runtime Injection

- **Android:** `CSSInjector.java` reads `www/assets/cdn-styles.css` from APK assets, Base64-encodes it, and injects via JavaScript
- **iOS:** `CSSInjector.swift` reads `www/assets/cdn-styles.css` from the bundle and injects as a `WKUserScript` at document start

## URL Format

```
https://cdn.example.com/path/to/styles.css
https://cdn.example.com/path/to/styles.css?v=1234
https://cdn.example.com/path/to/styles.min.css
```

- HTTPS required
- Query parameters supported (for cache busting)
- File must return CSS content directly (no redirects)

## Limitations

- One CSS file per app (the `CDN_RESOURCE` preference holds a single URL)
- The file is downloaded once at build time, not updated at runtime
- If the CDN is unreachable during build, the CSS will be missing but the build will succeed
