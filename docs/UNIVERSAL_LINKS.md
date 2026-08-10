# Universal Links & App Links

How the plugin claims your domains, how the tapped URL reaches your app, and how to work out which of the two is broken.

## What the plugin does, and what it does not

Opening the app from a link needs three things to line up. The plugin owns two of them:

| | Owner | Notes |
|---|---|---|
| Register the domain in the build | **plugin** | Entitlements (iOS), intent-filters (Android) |
| Deliver the URL to JavaScript | **plugin** | `UniversalLinks.subscribe()` |
| Serve the verification file | **your server** | `apple-app-site-association`, `assetlinks.json` |
| Route to the right screen | **your app** | What you do inside `subscribe()` |

Most failures are in the third row. The plugin cannot detect or fix those, so the diagnostics below separate them explicitly.

## Configuration

```json
{ "name": "UNIVERSAL_LINKS",
  "value": "[\"app.example.com/orders\",\"app.example.com/orders/*\"]" }
```

A JSON array, a comma-separated list, or a single value all work. `UNIVERSAL_LINK_HOSTS` is an alias and is merged in. When neither is set, `API_HOSTNAME` is used as the host with no path restriction.

**Paths affect Android only.** They become `android:path` and `android:pathPattern`. iOS ignores them entirely — path matching there is decided by the AASA file on your server. Two consequences:

- `android:path` is an exact match, so `/orders` does **not** match `/orders/123`. Declare both `/orders` and `/orders/*` if you need each.
- Both `android:path` and `android:pathPattern` are **case-sensitive**, and Android has no case-insensitive option. The value must match the real URL casing.

## Server-side files

### iOS — `/.well-known/apple-app-site-association`

Served over HTTPS as JSON, no redirects, no authentication.

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.example.app",
        "paths": ["/orders", "/orders/*"],
        "components": [
          { "/": "/orders",   "caseSensitive": false },
          { "/": "/orders/*", "caseSensitive": false }
        ]
      }
    ]
  }
}
```

Apple's `paths` matching is **case-sensitive**: `/Orders/123` does not match `/orders/*`. This is a common and hard-to-spot failure, because the domain association still succeeds — the app simply never claims the URL. Declaring `components` with `"caseSensitive": false` removes that whole class of mismatch. iOS 13+ prefers `components` and ignores `paths`; keep `paths` as the fallback for older versions.

If a build pipeline rewrites the file on upload (some CMS and asset pipelines normalise URL paths to lowercase), `components` with `caseSensitive: false` survives that too, since it no longer matters what case the path ends up in.

**Propagation.** Devices do not fetch this file from your server — they fetch Apple's cached copy:

```bash
curl https://app-site-association.cdn-apple.com/a/v1/app.example.com
```

The CDN response carries `Cache-Control: max-age=3600`, and in practice it tracks the origin within about an hour; Apple documents up to 24 hours. There is no way to request a re-crawl. **A device only fetches the AASA at install time**, so after the CDN updates you still have to reinstall the app.

For development you can bypass the CDN with `applinks:app.example.com?mode=developer`, which makes iOS fetch straight from your server. It requires Developer mode and *Settings → Developer → Associated Domains Development* on the device. The plugin does not emit `?mode=developer`.

### Android — `/.well-known/assetlinks.json`

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.example.app",
    "sha256_cert_fingerprints": ["AB:CD:..."]
  }
}]
```

No paths here — this file authorises the app for the whole host. Path filtering is entirely in the intent-filters the plugin writes.

**It must return HTTP 200 with no redirect.** The verifier refuses to follow redirects, by design: if an attacker could add a redirect on your domain, they could claim your app's links. A 301/302 anywhere in the chain fails verification with `ERROR_CODE_REDIRECT`, and on Android 12+ that means links never open the app.

Two things make this easy to miss:

- The verifier requests the fully-qualified hostname **with a trailing dot** (`app.example.com.`). A CDN or WAF rule can treat that differently from the normal hostname.
- A redirect may only fire for the verifier's own IP ranges, so `curl` from a laptop returns 200 while verification still fails. Bot protection, WAF rules, edge workers and access policies are all common causes. The usual fix is an explicit bypass for `/.well-known/*`.

Check with the same API the device uses:

```bash
curl -sS --get "https://digitalassetlinks.googleapis.com/v1/statements:list" \
  --data-urlencode "source.web.site=https://app.example.com" \
  --data-urlencode "relation=delegate_permission/common.handle_all_urls"
```

A populated `statements` array and no `errorCode` means it will verify. Anything else will not.

## Receiving the URL

Registration only gets the app opened. Without a subscriber the app lands on its default screen and the URL is discarded.

```javascript
cordova.plugins.UniversalLinks.subscribe(function (link) {
  // link.url    "https://app.example.com/orders/123?ref=x"
  // link.path   "/orders/123"
  // link.params { ref: "x" }
  routeTo(link.path, link.params);
});
```

A link that cold-started the app is held natively and replayed as soon as you subscribe, so registering late is safe. In an SPA, subscribe once at startup rather than per screen.

## Links that never reach the OS

Chrome on iOS, Google Chat, Gmail and in-app browsers keep the URL instead of handing it to the OS, so iOS is never asked whether an app claims it. No AASA or entitlements change affects this — it is the other app's choice.

Typing or pasting a URL into a browser address bar also never triggers a universal link, including in Safari. Apple treats that as an explicit request to browse. Safari shows its own "open in app" affordance as a fallback; other browsers do not.

The only reliable escape is a custom scheme, which those contexts can reach:

```json
{ "name": "URL_SCHEME", "value": "myapp" }
```

Scheme URLs arrive through the same `subscribe()` callback. They still need something to link to `myapp://…` — typically a button on the page the browser landed on. Give each environment its own scheme so parallel installs do not fight over it.

## Diagnostics

Work top-down; each step assumes the ones above passed.

### 1. Is the domain in the build?

**iOS** — unzip the IPA and check the embedded entitlements:

```bash
unzip -p MyApp.ipa 'Payload/*.app/embedded.mobileprovision' \
  | security cms -D | plutil -p - | grep -A3 associated-domains
```

Expect `applinks:app.example.com`. Note the plugin writes the domains into **every** entitlements file the Xcode project references — a build that signs Release against `Entitlements-Release.plist` needs them there, not only in `Entitlements-Debug.plist`.

In the build log:

```
Associated domains written to MyApp/Entitlements-Debug.plist
Associated domains written to MyApp/Entitlements-Release.plist
```

Only one line means only one configuration got them.

**Android** — check the merged manifest, or just look for the marker comment the plugin leaves:

```
<!-- cordova-plugin-change-app-info universal-links:start -->
```

### 2. Does the OS accept the domain?

**Android:**

```bash
adb shell pm get-app-links com.example.app
```

| State | Meaning |
|---|---|
| `1` | Verified — links open the app |
| `1024` and above | Verifier-defined failure; the file was unreachable, redirected, or did not match |
| `0` | No response yet |

Force a re-check with `adb shell pm verify-app-links --re-verify com.example.app`. For testing only, a user can override verification at *Settings → Apps → your app → Open by default*.

**iOS** — connect the device, open Console.app and filter on `swcd` while tapping a link:

- `Claiming applinks:app.example.com` — the association is live
- `No app to claim` — entitlements or provisioning problem
- download failures — AASA problem

### 3. Does the app open, but on the wrong screen?

That is the runtime half. The domain works; nothing is consuming the URL. Check that `subscribe()` runs and that the routing it calls handles the path.

### 4. The app does not open at all

Confirm where the link was tapped. Notes, Messages and Mail hand the URL to the OS; browsers and several chat apps do not — see the previous section. A link that works from Notes but not from Chrome is not a configuration bug.

## Common causes

| Symptom | Cause |
|---|---|
| Works from Notes, not from Chrome or Google Chat | Expected — those apps bypass the OS. Use a custom scheme |
| Nothing at all on iOS after a correct AASA | Device has not refetched. Reinstall; the AASA is only read at install |
| iOS opens Safari for one path but works for another | `paths` is case-sensitive. Use `components` with `caseSensitive: false` |
| Android verification stuck at `1024` | `assetlinks.json` redirects, or is blocked for the verifier's IPs |
| Android opens app for `/orders` but not `/orders/123` | `android:path` is exact. Add the `/*` variant |
| Android ignores the link entirely after a rename | Path casing changed; Android path matching is case-sensitive |
| Release build lost associated domains | Release signed against an entitlements file the domains were not written to |
| App opens on the home screen every time | No `subscribe()` in the app |

## References

- [Supporting associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
- [Verify Android App Links](https://developer.android.com/training/app-links/verify-android-applinks)
- [Digital Asset Links API](https://developers.google.com/digital-asset-links/reference/rest/v1/statements/list)
