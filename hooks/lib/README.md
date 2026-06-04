# Config Loaders (Legacy)

> **These files are legacy.** The current plugin uses native config injection via `CSSInjector` — see [Native Config Injection](../../NATIVE_CONFIG_INJECTION.md).

## Files

- `config-loader.js` — Node.js/server-side config loader
- `config-loader-mobile.js` — Browser/Cordova config loader

## What They Did

These files loaded build configuration from `www/.cordova-app-data/build-config.json` at runtime using `fetch()` or `fs.readFileSync()`. They set `window.cordovaAppConfig` and `window.CordovaConfigLoader`.

## Why They're Legacy

The current plugin injects config natively during `pluginInitialize()`:

- **Android:** `CSSInjector.java` reads config from assets and injects via JavaScript
- **iOS:** `CSSInjector.swift` reads config from the bundle and injects as a `WKUserScript`

This eliminates race conditions and provides config before the page loads via `window.CORDOVA_BUILD_CONFIG`.

## Can I Delete Them?

Yes. These files are not referenced in `plugin.xml` or used by any current hooks. They remain for backward compatibility with apps that may have imported them directly.
