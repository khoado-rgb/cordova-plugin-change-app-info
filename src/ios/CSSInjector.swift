import Foundation
import WebKit
import UIKit

#if canImport(Cordova)
import Cordova
#endif

@objc(CSSInjector)
class CSSInjector: CDVPlugin {
    
    private static let CSS_FILE_PATH = "www/assets/cdn-styles.css"
    private static let CONFIG_FILE_PATH = "www/cordova-build-config.json"
    private var cachedCSS: String?
    private var cachedConfig: [String: Any]?

    private func configuredAllowedHosts() -> [String] {
        let osDefaultHost = (self.commandDelegate.settings["defaulthostname"] as? String ?? "").lowercased()
        let cordovaHost = (self.commandDelegate.settings["hostname"] as? String ?? "").lowercased()
        return [osDefaultHost, cordovaHost].filter { !$0.isEmpty }
    }

    private func buildOriginGuardJavaScript() -> String {
        let hosts = configuredAllowedHosts()
        let data = try? JSONSerialization.data(withJSONObject: hosts, options: [])
        let hostsJSON = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[]"

        return "(function(){var scheme=(window.location.protocol||'').replace(':','').toLowerCase();var host=(window.location.hostname||'').toLowerCase();if(scheme==='file'||scheme==='outsystems'||scheme==='ionic')return true;if(scheme==='https'&&host==='localhost')return true;var allowedHosts=\(hostsJSON);return allowedHosts.indexOf(host)!==-1;})()"
    }

    private func isSafeCurrentOrigin() -> Bool {
        guard let wkWebView = self.webView as? WKWebView,
              let url = wkWebView.url else {
            return false
        }

        let scheme = url.scheme?.lowercased() ?? ""
        let host = url.host?.lowercased() ?? ""

        if scheme == "file" {
            let filePath = url.standardizedFileURL.path
            let bundlePath = Bundle.main.bundleURL.standardizedFileURL.path
            return filePath == bundlePath || filePath.hasPrefix(bundlePath + "/")
        }

        if scheme == "outsystems" || scheme == "ionic" { return true }
        if scheme == "https" && host == "localhost" { return true }

        return configuredAllowedHosts().contains(host)
    }
    
    override func pluginInitialize() {
        super.pluginInitialize()
        
        // BackgroundColor is the canonical OutSystems preference. The webview
        // color remains only a fallback for older configs.
        let bgColor = getBackgroundColor()
        
        if let color = bgColor {
            setWebViewBackgroundColor(colorString: color)
        }
        
        // Pre-load CSS and config
        cachedCSS = readCSSFromBundle()
        cachedConfig = readConfigFromBundle()
        
        // ⭐ KEY FIX: Install WKUserScripts immediately
        // This ensures CSS/config inject BEFORE page loads (no race condition)
        installUserScripts()
        
        print("[CSSInjector] Plugin initialized with WKUserScript injection")
    }
    
    // MARK: - WKUserScript Installation (Option C - Best Practice)
    
    /**
     * Install WKUserScripts for CSS and Config injection
     * Scripts run at .atDocumentStart = BEFORE page renders
     * Eliminates timing issues on fresh app install
     */
    private func installUserScripts() {
        let install = {
            guard let wkWebView = self.webView as? WKWebView else {
                print("[CSSInjector] WebView not available")
                return
            }

            let contentController = wkWebView.configuration.userContentController

            // 1. Install Config UserScript (highest priority)
            if let configScript = self.buildConfigUserScript() {
                contentController.addUserScript(configScript)
                print("[CSSInjector] ✅ Config UserScript installed")
            }

            // 2. Install Background Color UserScript
            if let bgColor = self.getBackgroundColor(), let bgScript = self.buildBackgroundUserScript(color: bgColor) {
                contentController.addUserScript(bgScript)
                print("[CSSInjector] ✅ Background UserScript installed: \(bgColor)")
            }

            // 3. Install CSS UserScript
            if let cssScript = self.buildCSSUserScript() {
                contentController.addUserScript(cssScript)
                if let cssSize = self.cachedCSS?.count {
                    print("[CSSInjector] ✅ CSS UserScript installed (\(cssSize) bytes)")
                }
            }

            print("[CSSInjector] All UserScripts installed successfully")
        }

        // Register synchronously. CDVViewController.viewDidLoad instantiates
        // the startup plugins and then calls loadRequest: on the very next
        // statement, in the same run-loop turn. addUserScript only affects
        // later navigations, so dispatching this asynchronously registered the
        // scripts after that first load had already begun — leaving the splash
        // and login screens with no config, no background and no stylesheet,
        // and an SPA never creates the second document that would pick them up.
        // pluginInitialize already runs on the main thread here; the sync
        // branch is only for callers that are not.
        if Thread.isMainThread {
            install()
        } else {
            DispatchQueue.main.sync(execute: install)
        }
    }
    
    /**
     * Build Config injection UserScript
     * Injects window.CORDOVA_BUILD_CONFIG before page loads
     */
    private func buildConfigUserScript() -> WKUserScript? {
        guard var configDict = cachedConfig else {
            print("[CSSInjector] No config to inject")
            return nil
        }
        
        // Add background color to config
        if let bgColor = getBackgroundColor() {
            configDict["backgroundColor"] = bgColor
        }
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: configDict, options: [])
            guard let jsonString = String(data: jsonData, encoding: .utf8) else { return nil }
            let originGuard = buildOriginGuardJavaScript()
            
            let escapedJSON = jsonString
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
            
            let javascript = """
            (function() {
                try {
                    if (!\(originGuard)) { return; }
                    var config = JSON.parse("\(escapedJSON)");
                    window.CORDOVA_BUILD_CONFIG = config;
                    window.AppConfig = config;
                    console.log('[Native iOS UserScript] Config injected at document start');

                    // Inline on documentElement so it outranks any :root rule
                    // from a stylesheet OutSystems loads later during SPA
                    // navigation, and survives screen changes because
                    // documentElement is never replaced. Values come from the
                    // parsed JSON, not string concatenation.
                    //
                    // Self-contained: at document start documentElement may not
                    // exist yet, and letting that throw here would also skip the
                    // cordova-config-ready dispatch below.
                    function applyBrandColor() {
                        try {
                            var root = document.documentElement;
                            if (!root || !root.style) { return false; }
                            if (!config.primaryColor || !config.primaryColorVar) { return true; }
                            root.style.setProperty(config.primaryColorVar, config.primaryColor, 'important');
                            return true;
                        } catch (err) {
                            return false;
                        }
                    }

                    // documentElement does not exist yet at document start, so
                    // the first call fails. Waiting for DOMContentLoaded is far
                    // too late — the theme stylesheet has painted its own colour
                    // by then. Observing document catches <html> the moment the
                    // parser creates it: measured at 89ms versus 458ms on device.
                    // childList without subtree is enough, documentElement is a
                    // direct child of document.
                    if (!applyBrandColor()) {
                        var brandObserver = null;

                        if (typeof MutationObserver !== 'undefined') {
                            brandObserver = new MutationObserver(function() {
                                if (applyBrandColor()) { brandObserver.disconnect(); }
                            });
                            brandObserver.observe(document, { childList: true });
                        }

                        document.addEventListener('DOMContentLoaded', function() {
                            applyBrandColor();
                            if (brandObserver) { brandObserver.disconnect(); }
                        });
                    }

                    // Dispatch event when DOM is ready
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', function() {
                            if (typeof CustomEvent !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('cordova-config-ready', { detail: config }));
                            }
                        });
                    } else {
                        if (typeof CustomEvent !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('cordova-config-ready', { detail: config }));
                        }
                    }
                } catch(e) {
                    console.error('[Native iOS UserScript] Config injection failed:', e);
                }
            })();
            """
            
            // ⭐ atDocumentStart = inject BEFORE page loads (key to fix timing issue)
            return WKUserScript(
                source: javascript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        } catch {
            print("[CSSInjector] Failed to build config script: \(error)")
            return nil
        }
    }
    
    /**
     * Build Background Color UserScript
     * Sets background color before page renders (prevents white flash)
     */
    private func buildBackgroundUserScript(color: String) -> WKUserScript? {
        // Validate hex format to prevent JS injection via malformed color preference
        let hexPattern = try! NSRegularExpression(pattern: "^#?[A-Fa-f0-9]{6}([A-Fa-f0-9]{2})?$")
        guard hexPattern.firstMatch(in: color, range: NSRange(color.startIndex..., in: color)) != nil else {
            print("[CSSInjector] Invalid background color format; preserving default app colors")
            return nil
        }

        let safeColor = color
        let css = "html, body, #root, #app, .app-container { background-color: \(safeColor) !important; background: \(safeColor) !important; margin: 0; padding: 0; }"
        let escapedCSS = css.replacingOccurrences(of: "'", with: "\\'")
        let originGuard = buildOriginGuardJavaScript()
        
        let javascript = """
        (function() {
            try {
                if (!\(originGuard)) { return; }
                // Set inline styles immediately
                if (document.documentElement) {
                    document.documentElement.style.backgroundColor = '\(safeColor)';
                }
                
                // Create style tag
                var style = document.createElement('style');
                style.id = 'cordova-bg-color';
                style.textContent = '\(escapedCSS)';
                (document.head || document.documentElement).appendChild(style);
                
                console.log('[Native iOS UserScript] Background color injected: \(safeColor)');
            } catch(e) {
                console.error('[Native iOS UserScript] Background injection failed:', e);
            }
        })();
        """
        
        return WKUserScript(
            source: javascript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
    }
    
    /**
     * Build CSS injection UserScript
     * Injects CDN CSS before page renders
     */
    private func buildCSSUserScript() -> WKUserScript? {
        guard let css = cachedCSS, !css.isEmpty else {
            print("[CSSInjector] No CSS to inject")
            return nil
        }
        
        guard let base64CSS = encodeToBase64(cssContent: css) else {
            print("[CSSInjector] Failed to encode CSS to Base64")
            return buildFallbackCSSUserScript(cssContent: css)
        }
        let originGuard = buildOriginGuardJavaScript()
        
        let javascript = """
        (function() {
            if (!\(originGuard)) { return; }

            function inject() {
                try {
                    var target = document.head || document.documentElement;
                    if (!target) { return false; }
                    if (!document.getElementById('cdn-injected-styles')) {
                        var base64CSS = '\(base64CSS)';
                        var decodedCSS = decodeURIComponent(escape(atob(base64CSS)));
                        var style = document.createElement('style');
                        style.id = 'cdn-injected-styles';
                        style.textContent = decodedCSS;
                        target.appendChild(style);
                        console.log('[Native iOS UserScript] CDN CSS injected (\(css.count) bytes)');
                    }
                    return true;
                } catch(e) {
                    console.error('[Native iOS UserScript] CSS injection failed:', e);
                    return false;
                }
            }

            // At document start neither <head> nor <html> exists yet, so the
            // first attempt fails. Previously that was the end of it: the throw
            // was swallowed and nothing retried, so the stylesheet could be
            // missing for the whole page. Observing document catches the
            // elements as the parser creates them; DOMContentLoaded remains as
            // the backstop for engines without MutationObserver.
            if (!inject()) {
                var mo = null;

                if (typeof MutationObserver !== 'undefined') {
                    mo = new MutationObserver(function() {
                        if (inject()) { mo.disconnect(); }
                    });
                    mo.observe(document, { childList: true, subtree: true });
                }

                document.addEventListener('DOMContentLoaded', function() {
                    inject();
                    if (mo) { mo.disconnect(); }
                });
            }
        })();
        """
        
        // ⭐ atDocumentStart = CSS ready BEFORE page renders
        return WKUserScript(
            source: javascript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
    }
    
    /**
     * Fallback CSS UserScript (if Base64 encoding fails)
     */
    private func buildFallbackCSSUserScript(cssContent: String) -> WKUserScript? {
        let escapedCSS = cssContent
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "")
            .replacingOccurrences(of: "\t", with: "\\t")
        let originGuard = buildOriginGuardJavaScript()
        
        let javascript = """
        (function() {
            if (!\(originGuard)) { return; }

            function inject() {
                try {
                    var target = document.head || document.documentElement;
                    if (!target) { return false; }
                    if (!document.getElementById('cdn-injected-styles')) {
                        var style = document.createElement('style');
                        style.id = 'cdn-injected-styles';
                        style.textContent = '\(escapedCSS)';
                        target.appendChild(style);
                        console.log('[Native iOS UserScript] CSS injected (fallback method)');
                    }
                    return true;
                } catch(e) {
                    console.error('[Native iOS UserScript] CSS injection failed:', e);
                    return false;
                }
            }

            if (!inject()) {
                var mo = null;

                if (typeof MutationObserver !== 'undefined') {
                    mo = new MutationObserver(function() {
                        if (inject()) { mo.disconnect(); }
                    });
                    mo.observe(document, { childList: true, subtree: true });
                }

                document.addEventListener('DOMContentLoaded', function() {
                    inject();
                    if (mo) { mo.disconnect(); }
                });
            }
        })();
        """
        
        return WKUserScript(
            source: javascript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
    }
    
    // MARK: - Plugin Methods (for manual JS calls)
    
    @objc(injectCSS:)
    func injectCSS(command: CDVInvokedUrlCommand) {
        guard isSafeCurrentOrigin() else {
            let pluginResult = CDVPluginResult(
                status: CDVCommandStatus_ERROR,
                messageAs: "SECURITY: Command rejected due to invalid Origin."
            )
            self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
            return
        }

        // Manual injection via JS call (fallback)
        injectCSSViaEvaluateJavaScript()
        
        let pluginResult = CDVPluginResult(
            status: CDVCommandStatus_OK,
            messageAs: "CSS injected"
        )
        self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
    }
    
    @objc(getConfig:)
    func getConfig(command: CDVInvokedUrlCommand) {
        guard isSafeCurrentOrigin() else {
            let pluginResult = CDVPluginResult(
                status: CDVCommandStatus_ERROR,
                messageAs: "SECURITY: Command rejected due to invalid Origin."
            )
            self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
            return
        }

        var config = cachedConfig
        if config == nil {
            config = readConfigFromBundle()
            cachedConfig = config
        }
        
        if let configDict = config {
            let pluginResult = CDVPluginResult(
                status: CDVCommandStatus_OK,
                messageAs: configDict
            )
            self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
        } else {
            let pluginResult = CDVPluginResult(
                status: CDVCommandStatus_ERROR,
                messageAs: "Config not available"
            )
            self.commandDelegate.send(pluginResult, callbackId: command.callbackId)
        }
    }
    
    // MARK: - Helper Methods
    
    /**
     * Get background color from preferences (with fallbacks)
     */
    private func getBackgroundColor() -> String? {
        if let color = self.commandDelegate.settings["backgroundcolor"] as? String {
            return color
        } else if let color = self.commandDelegate.settings["splashscreenbackgroundcolor"] as? String {
            return color
        } else if let color = self.commandDelegate.settings["androidwindowsplashscreenbackground"] as? String {
            return color
        } else if let color = self.commandDelegate.settings["androidwindowsplashscreenbackgroundcolor"] as? String {
            return color
        } else if let color = self.commandDelegate.settings["webview_background_color"] as? String {
            return color
        }
        return nil
    }
    
    /**
     * Read config JSON from bundle
     */
    private func readConfigFromBundle() -> [String: Any]? {
        guard let bundlePath = Bundle.main.path(forResource: "www", ofType: nil) else {
            print("[CSSInjector] www bundle path not found")
            return nil
        }
        
        let configPath = (bundlePath as NSString).appendingPathComponent("cordova-build-config.json")
        
        do {
            let jsonData = try Data(contentsOf: URL(fileURLWithPath: configPath))
            let config = try JSONSerialization.jsonObject(with: jsonData, options: []) as? [String: Any]
            return config
        } catch {
            print("[CSSInjector] Failed to read config: \(error.localizedDescription)")
            return nil
        }
    }
    
    /**
     * Read CSS content from bundle www/assets/cdn-styles.css with UTF-8 encoding
     */
    private func readCSSFromBundle() -> String? {
        guard let bundlePath = Bundle.main.path(forResource: "www", ofType: nil) else {
            print("[CSSInjector] www bundle path not found")
            return nil
        }
        
        let cssPath = (bundlePath as NSString).appendingPathComponent("assets/cdn-styles.css")
        
        do {
            let cssContent = try String(contentsOfFile: cssPath, encoding: .utf8)
            return cssContent
        } catch {
            print("[CSSInjector] Failed to read CSS file: \(error.localizedDescription)")
            return nil
        }
    }
    
    /**
     * Encode CSS content to Base64
     */
    private func encodeToBase64(cssContent: String) -> String? {
        guard let data = cssContent.data(using: .utf8) else {
            print("[CSSInjector] Failed to encode CSS to UTF-8")
            return nil
        }
        
        return data.base64EncodedString(options: [])
    }
    
    // MARK: - WebView Background Color (Native)
    
    /**
     * Set WebView background color to prevent white flash
     */
    private func setWebViewBackgroundColor(colorString: String) {
        let apply = {
            guard let webView = self.webView as? WKWebView else {
                print("[CSSInjector] WebView not available for background color")
                return
            }

            // Parse hex color
            if let color = self.hexStringToUIColor(hex: colorString) {
                webView.backgroundColor = color
                webView.isOpaque = false
                webView.scrollView.backgroundColor = color
                print("[CSSInjector] Native WebView background set to: \(colorString)")
            } else {
                print("[CSSInjector] Invalid color format; preserving default app colors: \(colorString)")
            }
        }

        // Same reason as installUserScripts: this runs from pluginInitialize,
        // one statement before viewDidLoad starts the first load. Deferring it
        // leaves the webview on its default background for that first frame.
        if Thread.isMainThread {
            apply()
        } else {
            DispatchQueue.main.sync(execute: apply)
        }
    }
    
    /**
     * Convert hex string to UIColor
     */
    private func hexStringToUIColor(hex: String) -> UIColor? {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")
        
        var rgb: UInt64 = 0
        
        guard Scanner(string: hexSanitized).scanHexInt64(&rgb) else {
            return nil
        }
        
        let length = hexSanitized.count
        
        if length == 6 {
            let r = CGFloat((rgb & 0xFF0000) >> 16) / 255.0
            let g = CGFloat((rgb & 0x00FF00) >> 8) / 255.0
            let b = CGFloat(rgb & 0x0000FF) / 255.0
            return UIColor(red: r, green: g, blue: b, alpha: 1.0)
        } else if length == 8 {
            let r = CGFloat((rgb & 0xFF000000) >> 24) / 255.0
            let g = CGFloat((rgb & 0x00FF0000) >> 16) / 255.0
            let b = CGFloat((rgb & 0x0000FF00) >> 8) / 255.0
            let a = CGFloat(rgb & 0x000000FF) / 255.0
            return UIColor(red: r, green: g, blue: b, alpha: a)
        }
        
        return nil
    }
    
    // MARK: - Fallback: Manual Injection (via evaluateJavaScript)
    
    /**
     * Fallback CSS injection via evaluateJavaScript
     * Used only when called manually from JS or as backup
     */
    private func injectCSSViaEvaluateJavaScript() {
        DispatchQueue.main.async {
            guard let wkWebView = self.webView as? WKWebView else {
                print("[CSSInjector] WKWebView not available")
                return
            }

            guard self.isSafeCurrentOrigin() else {
                print("[CSSInjector] Skipping manual CSS injection for unsafe origin")
                return
            }
            
            var cssContent = self.cachedCSS
            if cssContent == nil || cssContent!.isEmpty {
                cssContent = self.readCSSFromBundle()
                self.cachedCSS = cssContent
            }
            
            guard let css = cssContent, !css.isEmpty else {
                print("[CSSInjector] CSS file not found or empty")
                return
            }
            
            guard let base64CSS = self.encodeToBase64(cssContent: css) else {
                print("[CSSInjector] Failed to encode CSS")
                return
            }
            let originGuard = self.buildOriginGuardJavaScript()
            
            let javascript = """
            (function() {
                try {
                    if (!\(originGuard)) { return; }
                    if (!document.getElementById('cdn-injected-styles')) {
                        var base64CSS = '\(base64CSS)';
                        var decodedCSS = decodeURIComponent(escape(atob(base64CSS)));
                        var style = document.createElement('style');
                        style.id = 'cdn-injected-styles';
                        style.textContent = decodedCSS;
                        (document.head || document.documentElement).appendChild(style);
                        console.log('[Native iOS Fallback] CSS injected');
                    }
                } catch(e) {
                    console.error('[Native iOS Fallback] CSS injection failed:', e);
                }
            })();
            """
            
            wkWebView.evaluateJavaScript(javascript) { (_, error) in
                if let error = error {
                    print("[CSSInjector] Fallback CSS injection failed: \(error.localizedDescription)")
                } else {
                    print("[CSSInjector] Fallback CSS injected successfully")
                }
            }
        }
    }
}
