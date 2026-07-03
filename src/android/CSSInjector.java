package com.vnkhoado.cordova.plugin;

import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CordovaWebView;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public class CSSInjector extends CordovaPlugin {

    private static final String TAG = "CSSInjector";
    private static final String CSS_FILE_PATH = "www/assets/cdn-styles.css";
    private static final String CONFIG_FILE_PATH = "www/cordova-build-config.json";
    
    private String cachedCSS = null;
    private JSONObject cachedConfig = null;
    private Handler handler;
    private String backgroundColor = null;
    private boolean initialInjectionDone = false;
    private boolean isFirstPageLoad = true;
    private String configScript = null;
    private String cssInlineScript = null;
    private int injectionAttempts = 0;
    private static final int MAX_INJECTION_ATTEMPTS = 10;
    private static final java.util.regex.Pattern HEX_COLOR_PATTERN = 
        java.util.regex.Pattern.compile("^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$");

    private boolean isValidHexColor(String color) {
        return color != null && HEX_COLOR_PATTERN.matcher(color.trim()).matches();
    }

    /**
     * Convert any accepted hex form into a CSS-safe `#RRGGBB[AA]`.
     *
     * Android resources / Cordova preferences emit `#AARRGGBB` (alpha first).
     * If we drop that string straight into CSS, the browser parses it as
     * `#RRGGBBAA` (alpha last) — turning navy `#ff1e1464` into 39%-alpha red,
     * which composites to a pink first-paint flash.
     *
     * Heuristic: when the leading byte is `ff` (fully opaque) we treat the
     * value as Android `#AARRGGBB` and drop the leading alpha. Otherwise we
     * leave it alone — the value is either already 6-char, already CSS
     * `#RRGGBBAA`, or a translucent Android color we cannot safely shorten.
     */
    private String normalizeHexForCss(String color) {
        if (color == null) return null;
        String hex = color.trim();
        if (hex.startsWith("#")) hex = hex.substring(1);
        if (hex.length() == 8 && hex.regionMatches(true, 0, "ff", 0, 2)) {
            return "#" + hex.substring(2);
        }
        return color.startsWith("#") ? color : "#" + color;
    }

    private boolean isSafeOrigin(String currentUrl) {
        if (currentUrl == null || currentUrl.isEmpty()) return false;

        String urlLower = currentUrl.toLowerCase();
        if (urlLower.startsWith("file:///android_asset/www/")) return true;

        Uri uri = Uri.parse(urlLower);
        String scheme = uri.getScheme();
        String host = uri.getHost();

        if ("outsystems".equals(scheme)) return true;
        if ("https".equals(scheme) && "localhost".equals(host)) return true;

        if (host != null) {
            String osDefaultHost = preferences.getString("DefaultHostname", "").toLowerCase();
            String cordovaHost = preferences.getString("hostname", "").toLowerCase();

            if (!osDefaultHost.isEmpty() && host.equals(osDefaultHost)) return true;
            if (!cordovaHost.isEmpty() && host.equals(cordovaHost)) return true;
        }

        return false;
    }

    private boolean isCurrentOriginSafe() {
        String currentUrl = webView != null ? webView.getUrl() : null;
        boolean safe = isSafeOrigin(currentUrl);
        if (!safe) {
            android.util.Log.w(TAG, "Skipping injection for unsafe origin: " + currentUrl);
        }
        return safe;
    }

    private String getGeneratedBackgroundColor() {
        if (cordova == null || cordova.getActivity() == null) {
            return null;
        }

        String[] colorNames = {
            "webview_background",
            "cordova_splash_background",
            "splash_background",
            "cdv_splashscreen_background_color",
            "cdv_background_color",
            "cdv_splashscreen_background"
        };

        String packageName = cordova.getActivity().getPackageName();
        android.content.res.Resources resources = cordova.getActivity().getResources();

        for (String colorName : colorNames) {
            int colorId = resources.getIdentifier(colorName, "color", packageName);
            if (colorId == 0) {
                continue;
            }

            try {
                int color;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    color = resources.getColor(colorId, cordova.getActivity().getTheme());
                } else {
                    color = resources.getColor(colorId);
                }
                String hexColor = String.format(Locale.US, "#%06X", (0xFFFFFF & color));
                android.util.Log.d(TAG, "Resolved generated background color " + hexColor + " from @" + colorName);
                return hexColor;
            } catch (Exception e) {
                android.util.Log.w(TAG, "Could not read generated color @" + colorName, e);
            }
        }

        return null;
    }

    @Override
    public void pluginInitialize() {
        super.pluginInitialize();
        
        android.util.Log.d(TAG, "=== CSSInjector pluginInitialize START ===");
        
        // BackgroundColor is the canonical OutSystems preference. The webview
        // color remains only a fallback for older configs.
        String bgColor = preferences.getString("BackgroundColor", null);
        if (bgColor == null || bgColor.isEmpty()) {
            bgColor = preferences.getString("SplashScreenBackgroundColor", null);
        }
        if (bgColor == null || bgColor.isEmpty()) {
            bgColor = preferences.getString("AndroidWindowSplashScreenBackground", null);
        }
        if (bgColor == null || bgColor.isEmpty()) {
            bgColor = preferences.getString("AndroidWindowSplashScreenBackgroundColor", null);
        }
        if (bgColor == null || bgColor.isEmpty()) {
            bgColor = preferences.getString("WEBVIEW_BACKGROUND_COLOR", null);
        }
        
        if (bgColor == null || bgColor.isEmpty()) {
            bgColor = getGeneratedBackgroundColor();
            if (bgColor == null || bgColor.isEmpty()) {
                backgroundColor = null;
                android.util.Log.d(TAG, "No custom or generated background color found; preserving default app colors");
            } else {
                backgroundColor = normalizeHexForCss(bgColor.trim());
                android.util.Log.d(TAG, "Using generated default app background: " + backgroundColor);
            }
        } else if (!isValidHexColor(bgColor)) {
            backgroundColor = null;
            android.util.Log.e(TAG, "Invalid background color format; preserving default app colors");
        } else {
            backgroundColor = normalizeHexForCss(bgColor.trim());
        }

        if (backgroundColor != null && !backgroundColor.isEmpty()) {
            // Set WebView and Activity background using either configured or generated app color.
            final String finalBgColor = backgroundColor;
            cordova.getActivity().runOnUiThread(() -> {
                try {
                    int color = parseHexColor(finalBgColor);
                    cordova.getActivity().getWindow().setBackgroundDrawable(
                        new android.graphics.drawable.ColorDrawable(color)
                    );
                    cordova.getActivity().getWindow().getDecorView().setBackgroundColor(color);
                    if (webView != null && webView.getView() != null) {
                        webView.getView().setBackgroundColor(color);
                    }
                    android.util.Log.d(TAG, "Background set to: " + finalBgColor);
                } catch (IllegalArgumentException e) {
                    android.util.Log.e(TAG, "Invalid color: " + finalBgColor, e);
                }
            });
        }
        
        // Pre-load CSS and config
        android.util.Log.d(TAG, "Reading CSS and config from assets...");
        cachedCSS = readCSSFromAssets();
        cachedConfig = readConfigFromAssets();
        
        if (cachedCSS != null) {
            android.util.Log.d(TAG, "CSS loaded: " + cachedCSS.length() + " bytes");
        } else {
            android.util.Log.e(TAG, "CSS NOT loaded - file missing or error");
        }
        
        if (cachedConfig != null) {
            android.util.Log.d(TAG, "Config loaded successfully");
        } else {
            android.util.Log.e(TAG, "Config NOT loaded - file missing or error");
        }
        
        handler = new Handler(Looper.getMainLooper());
        
        // Run one idempotent pass during initialization. Later page lifecycle
        // hooks re-apply on navigation; avoid fixed-interval startup polling.
        injectBuildConfig();
        if (backgroundColor != null && !backgroundColor.isEmpty()) {
            injectBackgroundColorCSS(backgroundColor);
        }
        injectCSSIntoWebView();
        
        android.util.Log.d(TAG, "=== CSSInjector pluginInitialize END ===");
    }

    /**
     * Start polling-based injection to ensure CSS/config loads
     * This runs every 200ms until successful or max attempts reached
     */
    private void startPollingInjection() {
        handler.post(new Runnable() {
            @Override
            public void run() {
                if (injectionAttempts < MAX_INJECTION_ATTEMPTS) {
                    android.util.Log.d(TAG, "[Polling] Injection attempt #" + (injectionAttempts + 1));
                    
                    // Try to inject
                    injectBuildConfig();
                    if (backgroundColor != null && !backgroundColor.isEmpty()) {
                        injectBackgroundColorCSS(backgroundColor);
                    }
                    injectCSSIntoWebView();
                    
                    injectionAttempts++;
                    
                    // Schedule next attempt
                    handler.postDelayed(this, 200);
                } else {
                    android.util.Log.d(TAG, "[Polling] Stopped after " + MAX_INJECTION_ATTEMPTS + " attempts");
                }
            }
        });
    }

    /**
     * Build config script that will be injected into HTML <head>
     */
    private void buildConfigScript() {
        try {
            JSONObject config = cachedConfig;
            if (config == null) {
                config = readConfigFromAssets();
                cachedConfig = config;
            }
            
            if (config == null) {
                android.util.Log.e(TAG, "Cannot build config script - no config available");
                // Create empty config as fallback
                config = new JSONObject();
                config.put("error", "Config file not found");
            }
            
            // Add background color to config
            if (backgroundColor != null && !backgroundColor.isEmpty()) {
                config.put("backgroundColor", backgroundColor);
            }
            
            String configJSON = config.toString();
            
            // Build inline script that runs IMMEDIATELY
            configScript = "<script type='text/javascript'>" +
                "(function(){" +
                "try{" +
                "var config=" + configJSON + ";" +
                "window.CORDOVA_BUILD_CONFIG=config;" +
                "window.AppConfig=config;" +
                "console.log('[Inline-Config] Injected:',config);" +
                "}catch(e){" +
                "console.error('[Inline-Config] Failed:',e);" +
                "}" +
                "})();" +
                "</script>";
            
            android.util.Log.d(TAG, "✓ Config script built (" + configScript.length() + " bytes)");
        } catch (Exception e) {
            android.util.Log.e(TAG, "Failed to build config script", e);
        }
    }

    /**
     * Build CSS inline script that will be injected into HTML <head>
     */
    private void buildCSSInlineScript() {
        try {
            String cssContent = cachedCSS;
            if (cssContent == null || cssContent.isEmpty()) {
                cssContent = readCSSFromAssets();
                cachedCSS = cssContent;
            }
            
            if (cssContent == null || cssContent.isEmpty()) {
                android.util.Log.e(TAG, "Cannot build CSS script - no CSS content");
                return;
            }
            
            // Encode CSS to base64 for safe inline injection
            byte[] cssBytes = cssContent.getBytes(StandardCharsets.UTF_8);
            String base64CSS = Base64.encodeToString(cssBytes, Base64.NO_WRAP);
            
            // Build inline script
            cssInlineScript = "<script type='text/javascript'>" +
                "(function(){" +
                "try{" +
                "var b64='" + base64CSS + "';" +
                "var css=decodeURIComponent(escape(atob(b64)));" +
                "var s=document.createElement('style');" +
                "s.id='cdn-styles-inline';" +
                "s.textContent=css;" +
                "(document.head||document.getElementsByTagName('head')[0]).appendChild(s);" +
                "console.log('[Inline-CSS] Injected',css.length,'bytes');" +
                "}catch(e){" +
                "console.error('[Inline-CSS] Failed:',e);" +
                "}" +
                "})();" +
                "</script>";
            
            android.util.Log.d(TAG, "✓ CSS inline script built (" + cssContent.length() + " bytes CSS)");
        } catch (Exception e) {
            android.util.Log.e(TAG, "Failed to build CSS inline script", e);
        }
    }

    @Override
    public void onResume(boolean multitasking) {
        super.onResume(multitasking);
        
        if (!initialInjectionDone) {
            // Inject immediately
            injectBuildConfig();
            if (backgroundColor != null && !backgroundColor.isEmpty()) {
                injectBackgroundColorCSS(backgroundColor);
            }
            injectCSSIntoWebView();
            initialInjectionDone = true;
            android.util.Log.d(TAG, "onResume - immediate injection");
        }
        
        android.util.Log.d(TAG, "onResume");
    }

    /**
     * Hook every Cordova lifecycle/WebView event so we can inject the background
     * CSS at the earliest possible moment for each page load. The polling loop
     * runs every 200 ms which is too slow to beat the WebView's first paint of
     * the remote HTML body — by the time the first poll fires the browser has
     * already rendered one frame of the OutSystems default body color (a brand
     * red on this app). onPageStarted fires from WebViewClient.onPageStarted
     * before any HTML is parsed, so the JS we queue here lands in the page's
     * JS context before <body> is rendered.
     */
    @Override
    public Object onMessage(String id, Object data) {
        if (id == null) return null;
        if ("onPageStarted".equals(id)) {
            // Bypass the safe-origin gate here: we are *about* to navigate
            // to this URL and we are only painting our own background color.
            injectEarlyBackgroundCSS();
        } else if ("onPageFinished".equals(id) || "onReceivedError".equals(id)) {
            if (backgroundColor != null && !backgroundColor.isEmpty()) {
                injectBackgroundColorCSS(backgroundColor);
            }
            injectBuildConfig();
            injectCSSIntoWebView();
        }
        return null;
    }

    /**
     * Inject the minimum CSS needed to suppress the red first-paint flash.
     * Called from onMessage("onPageStarted", ...) which fires before the
     * WebView parses the new page's HTML, so this script reaches the new
     * page's JS context ahead of <body> rendering.
     */
    private void injectEarlyBackgroundCSS() {
        if (backgroundColor == null || backgroundColor.isEmpty()) return;
        if (!isValidHexColor(backgroundColor)) return;

        final String bgColor = backgroundColor;
        cordova.getActivity().runOnUiThread(() -> {
            try {
                CordovaWebView cordovaWebView = this.webView;
                if (cordovaWebView == null) return;

                if (cordovaWebView.getView() != null) {
                    try {
                        cordovaWebView.getView().setBackgroundColor(parseHexColor(bgColor));
                    } catch (Exception ignored) {}
                }

                // Only paint bare html/body. Do NOT target OutSystems'
                // own .splash-screen / .login-screen classes — those are
                // owned by the remote app and must keep their styling.
                String css = "html,body{" +
                    "background-color:" + bgColor + " !important;" +
                    "background:" + bgColor + " !important;" +
                    "margin:0;padding:0;" +
                    "}";

                String javascript = "(function(){" +
                    "function ap(){try{" +
                    "if(typeof document==='undefined')return;" +
                    "if(document.documentElement)document.documentElement.style.backgroundColor='" + bgColor + "';" +
                    "if(document.body)document.body.style.backgroundColor='" + bgColor + "';" +
                    "var t=document.head||document.getElementsByTagName('head')[0]||document.documentElement;" +
                    "if(!t){setTimeout(ap,16);return;}" +
                    "if(!document.getElementById('cordova-bg-early')){" +
                    "var s=document.createElement('style');" +
                    "s.id='cordova-bg-early';" +
                    "s.textContent='" + css.replace("'", "\\'") + "';" +
                    "if(t.firstChild)t.insertBefore(s,t.firstChild);else t.appendChild(s);" +
                    "}" +
                    "}catch(e){}}" +
                    "ap();" +
                    "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ap);" +
                    "})();";

                cordovaWebView.loadUrl("javascript:" + javascript);
                android.util.Log.d(TAG, "[Early-BG] injected on onPageStarted: " + bgColor);
            } catch (Exception e) {
                android.util.Log.e(TAG, "Early BG injection failed", e);
            }
        });
    }

    /**
     * Inject build config from JSON file into window variable
     */
    private void injectBuildConfig() {
        cordova.getActivity().runOnUiThread(() -> {
            try {
                if (!isCurrentOriginSafe()) {
                    return;
                }

                JSONObject config = cachedConfig;
                if (config == null) {
                    config = readConfigFromAssets();
                    cachedConfig = config;
                }
                
                if (config == null) {
                    android.util.Log.w(TAG, "No config found, skipping injection");
                    return;
                }
                
                if (backgroundColor != null && !backgroundColor.isEmpty()) {
                    config.put("backgroundColor", backgroundColor);
                }
                
                String configJSON = config.toString();
                String escapedJSON = configJSON
                    .replace("\\", "\\\\")
                    .replace("'", "\\'")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n");
                
                CordovaWebView cordovaWebView = this.webView;
                if (cordovaWebView != null) {
                    String javascript = "(function() {" +
                        "  try {" +
                        "    if (typeof window === 'undefined') return;" +
                        "    var config = JSON.parse(\"" + escapedJSON + "\");" +
                        "    window.CORDOVA_BUILD_CONFIG = config;" +
                        "    window.AppConfig = config;" +
                        "    console.log('[Native-JS] Build config injected:', config);" +
                        "    " +
                        "    if (typeof CustomEvent !== 'undefined') {" +
                        "      window.dispatchEvent(new CustomEvent('cordova-config-ready', { detail: config }));" +
                        "    }" +
                        "  } catch(e) {" +
                        "    console.error('[Native-JS] Config injection failed:', e);" +
                        "  }" +
                        "})();";
                    
                    cordovaWebView.loadUrl("javascript:" + javascript);
                    android.util.Log.d(TAG, "[JS] Config injected");
                }
            } catch (Exception e) {
                android.util.Log.e(TAG, "Failed to inject build config", e);
            }
        });
    }

    /**
     * Read config JSON from assets
     */
    private JSONObject readConfigFromAssets() {
        try (InputStream inputStream = cordova.getActivity().getAssets().open(CONFIG_FILE_PATH);
             BufferedReader reader = new BufferedReader(
                new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            
            StringBuilder content = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                content.append(line);
            }
            
            return new JSONObject(content.toString());
            
        } catch (IOException e) {
            android.util.Log.e(TAG, "Config file not found: " + CONFIG_FILE_PATH, e);
            return null;
        } catch (JSONException e) {
            android.util.Log.e(TAG, "Failed to parse config JSON", e);
            return null;
        }
    }

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException {
        if (!isCurrentOriginSafe()) {
            callbackContext.error("SECURITY: Command rejected due to invalid Origin.");
            return true;
        }

        if (action.equals("injectCSS")) {
            injectCSSIntoWebView();
            callbackContext.success("CSS injected");
            return true;
        } else if (action.equals("getConfig")) {
            JSONObject config = cachedConfig != null ? cachedConfig : readConfigFromAssets();
            if (config != null) {
                callbackContext.success(config);
            } else {
                callbackContext.error("Config not available");
            }
            return true;
        } else if (action.equals("injectBackground")) {
            if (backgroundColor != null && !backgroundColor.isEmpty()) {
                injectBackgroundColorCSS(backgroundColor);
                callbackContext.success("Background injected: " + backgroundColor);
            } else {
                callbackContext.error("No background color configured");
            }
            return true;
        }
        return false;
    }

    private int parseHexColor(String hexColor) throws IllegalArgumentException {
        String hex = hexColor.trim();
        if (hex.startsWith("#")) {
            hex = hex.substring(1);
        }
        if (hex.length() != 6 && hex.length() != 8) {
            throw new IllegalArgumentException("Hex must be 6 or 8 chars");
        }
        try {
            if (hex.length() == 6) {
                return Color.parseColor("#FF" + hex);
            } else {
                return Color.parseColor("#" + hex);
            }
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid color: " + hexColor, e);
        }
    }

    /**
     * Inject background color CSS
     */
    private void injectBackgroundColorCSS(final String bgColor) {
        if (!isValidHexColor(bgColor)) {
            android.util.Log.d(TAG, "No valid background color configured; skipping background CSS injection");
            return;
        }

        cordova.getActivity().runOnUiThread(() -> {
            try {
                if (!isCurrentOriginSafe()) {
                    return;
                }

                if (webView != null && webView.getView() != null) {
                    try {
                        int color = parseHexColor(bgColor);
                        webView.getView().setBackgroundColor(color);
                    } catch (Exception e) {
                        android.util.Log.e(TAG, "Failed to set native bg", e);
                    }
                }
                
                CordovaWebView cordovaWebView = this.webView;
                if (cordovaWebView != null) {
                    // Only paint background on bare html/body so the gap
                    // between the native splash and the first OutSystems
                    // React render does not flash red. Do NOT target
                    // .splash-screen / .login-screen — those are owned by
                    // OutSystems and have their own intentional colors.
                    String css = "html, body { " +
                        "background-color: " + bgColor + " !important; " +
                        "background: " + bgColor + " !important; " +
                        "margin: 0; padding: 0; " +
                        "}";
                    
                    String javascript = buildBackgroundGuardScript(bgColor, css);
                    
                    cordovaWebView.loadUrl("javascript:" + javascript);
                }
            } catch (Exception e) {
                android.util.Log.e(TAG, "Background CSS failed", e);
            }
        });
    }

    private String buildBackgroundGuardScript(String bgColor, String css) {
        String escapedColor = escapeForSingleQuotedJs(bgColor);
        String escapedCss = escapeForSingleQuotedJs(css);

        return "(function() {" +
               "  try {" +
               "    if (typeof window === 'undefined' || typeof document === 'undefined') return;" +
               "    var bg = '" + escapedColor + "';" +
               "    var css = '" + escapedCss + "';" +
               "    var normalizedBg = bg;" +
               "    try {" +
               "      var probe = document.createElement('div');" +
               "      probe.style.backgroundColor = bg;" +
               "      normalizedBg = probe.style.backgroundColor || bg;" +
               "    } catch (e) {}" +
               "    function setBg(el) {" +
               "      if (!el || !el.style) return;" +
               "      var current = el.style.backgroundColor || el.style.getPropertyValue('background-color');" +
               "      var priority = el.style.getPropertyPriority('background-color');" +
               "      if (priority !== 'important' || (current !== bg && current !== normalizedBg)) {" +
               "        el.style.setProperty('background-color', bg, 'important');" +
               "      }" +
               "    }" +
               "    function ensureStyle() {" +
               "      var target = document.head || document.getElementsByTagName('head')[0] || document.documentElement;" +
               "      if (!target) return false;" +
               "      var s = document.getElementById('cordova-bg');" +
               "      if (!s) {" +
               "        s = document.createElement('style');" +
               "        s.id = 'cordova-bg';" +
               "        if (target.firstChild) { target.insertBefore(s, target.firstChild); } else { target.appendChild(s); }" +
               "      }" +
               "      if (s.textContent !== css) s.textContent = css;" +
               "      return true;" +
               "    }" +
               "    function applyBg() {" +
               "      try {" +
               "        setBg(document.documentElement);" +
               "        setBg(document.body);" +
               "        if (!ensureStyle()) setTimeout(applyBg, 16);" +
               "      } catch (e) { console.error('[Native-BG] Failed:', e); }" +
               "    }" +
               "    var previousGuard = window.__cordovaBgGuard;" +
               "    if (previousGuard && previousGuard.color === bg && previousGuard.observer) {" +
               "      previousGuard.apply = applyBg;" +
               "      previousGuard.schedule = scheduleBg;" +
               "      previousGuard.apply();" +
               "      return;" +
               "    }" +
               "    var scheduled = false;" +
               "    function scheduleBg() {" +
               "      if (scheduled) return;" +
               "      scheduled = true;" +
               "      var run = function() { scheduled = false; applyBg(); };" +
               "      if (window.requestAnimationFrame) window.requestAnimationFrame(run); else setTimeout(run, 0);" +
               "      setTimeout(applyBg, 50);" +
               "      setTimeout(applyBg, 150);" +
               "    }" +
               "    function routeChanged() {" +
               "      var guard = window.__cordovaBgGuard;" +
               "      if (guard && typeof guard.schedule === 'function') guard.schedule();" +
               "    }" +
               "    function wrapHistory(name) {" +
               "      try {" +
               "        var original = window.history && window.history[name];" +
               "        if (typeof original !== 'function' || original.__cordovaBgWrapped) return;" +
               "        var wrapped = function() {" +
               "          var result = original.apply(this, arguments);" +
               "          routeChanged();" +
               "          return result;" +
               "        };" +
               "        wrapped.__cordovaBgWrapped = true;" +
               "        window.history[name] = wrapped;" +
               "      } catch (e) {}" +
               "    }" +
               "    if (previousGuard && previousGuard.observer) {" +
               "      try { previousGuard.observer.disconnect(); } catch (e) {}" +
               "    }" +
               "    window.__cordovaBgGuard = { color: bg, apply: applyBg, schedule: scheduleBg, observer: null };" +
               "    applyBg();" +
               "    if (!window.__cordovaBgGuardListenersInstalled) {" +
               "      wrapHistory('pushState');" +
               "      wrapHistory('replaceState');" +
               "      window.addEventListener('popstate', routeChanged, true);" +
               "      window.addEventListener('hashchange', routeChanged, true);" +
               "      window.addEventListener('pageshow', routeChanged, true);" +
               "      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', routeChanged, true);" +
               "      window.__cordovaBgGuardListenersInstalled = true;" +
               "    }" +
               "    if (window.MutationObserver && document.documentElement) {" +
               "      var observer = new MutationObserver(routeChanged);" +
               "      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });" +
               "      window.__cordovaBgGuard.observer = observer;" +
               "    }" +
               "    console.log('[Native-BG] SPA background guard installed: " + escapedColor + "');" +
               "  } catch(e) { console.error('[Native-BG] Guard failed:', e); }" +
               "})();";
    }

    private String escapeForSingleQuotedJs(String value) {
        if (value == null) return "";
        return value
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "");
    }

    private void injectCSSIntoWebView() {
        cordova.getActivity().runOnUiThread(() -> {
            try {
                if (!isCurrentOriginSafe()) {
                    return;
                }

                String cssContent = cachedCSS;
                if (cssContent == null || cssContent.isEmpty()) {
                    cssContent = readCSSFromAssets();
                    cachedCSS = cssContent;
                }
                
                if (cssContent != null && !cssContent.isEmpty()) {
                    CordovaWebView cordovaWebView = this.webView;
                    if (cordovaWebView != null) {
                        String javascript = buildCSSInjectionScript(cssContent);
                        cordovaWebView.loadUrl("javascript:" + javascript);
                        android.util.Log.d(TAG, "[JS] CSS injected (" + cssContent.length() + " bytes)");
                    }
                } else {
                    android.util.Log.e(TAG, "Cannot inject CSS - content is empty or null");
                }
            } catch (Exception e) {
                android.util.Log.e(TAG, "CSS injection failed", e);
            }
        });
    }

    private String readCSSFromAssets() {
        try (InputStream inputStream = cordova.getActivity().getAssets().open(CSS_FILE_PATH);
             BufferedReader reader = new BufferedReader(
                new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            
            StringBuilder cssContent = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                cssContent.append(line).append("\n");
            }
            return cssContent.toString();
        } catch (IOException e) {
            android.util.Log.e(TAG, "Failed to read CSS from: " + CSS_FILE_PATH, e);
            return null;
        }
    }

    private String buildCSSInjectionScript(String cssContent) {
        try {
            byte[] cssBytes = cssContent.getBytes(StandardCharsets.UTF_8);
            String base64CSS = Base64.encodeToString(cssBytes, Base64.NO_WRAP);
            
            return "(function() {" +
                   "  function inject() {" +
                   "    try {" +
                   "      if (typeof document === 'undefined') return;" +
                   "      var target = document.head || document.getElementsByTagName('head')[0] || document.documentElement;" +
                   "      if (!target) {" +
                   "        setTimeout(inject, 100);" +
                   "        return;" +
                   "      }" +
                   "      if (!document.getElementById('cdn-styles')) {" +
                   "        var b64 = '" + base64CSS + "';" +
                   "        var css = decodeURIComponent(escape(atob(b64)));" +
                   "        var s = document.createElement('style');" +
                   "        s.id = 'cdn-styles';" +
                   "        s.textContent = css;" +
                   "        target.appendChild(s);" +
                   "        console.log('[Native-CSS] Loaded (" + cssContent.length() + " bytes)');" +
                   "      }" +
                   "    } catch(e) { console.error('[Native-CSS] Failed:', e); }" +
                   "  }" +
                   "  if (document.readyState === 'loading') {" +
                   "    document.addEventListener('DOMContentLoaded', inject);" +
                   "  } else {" +
                   "    inject();" +
                   "  }" +
                   "})();";
        } catch (Exception e) {
            return buildFallbackInjectionScript(cssContent);
        }
    }

    private String buildFallbackInjectionScript(String cssContent) {
        String escaped = cssContent
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "")
            .replace("\t", "\\t");
        
        return "(function() {" +
               "  function inject() {" +
               "    try {" +
               "      if (typeof document === 'undefined') return;" +
               "      var target = document.head || document.getElementsByTagName('head')[0] || document.documentElement;" +
               "      if (!target) {" +
               "        setTimeout(inject, 100);" +
               "        return;" +
               "      }" +
               "      if (!document.getElementById('cdn-styles')) {" +
               "        var s = document.createElement('style');" +
               "        s.id = 'cdn-styles';" +
               "        s.textContent = '" + escaped + "';" +
               "        target.appendChild(s);" +
               "        console.log('[Native-CSS] Loaded');" +
               "      }" +
               "    } catch(e) { console.error('[Native-CSS] Failed:', e); }" +
               "  }" +
               "  if (document.readyState === 'loading') {" +
               "    document.addEventListener('DOMContentLoaded', inject);" +
               "  } else {" +
               "    inject();" +
               "  }" +
               "})();";
    }
}
