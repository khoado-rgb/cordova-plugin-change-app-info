package com.vnkhoado.cordova.plugin;

import android.content.Context;
import android.net.Uri;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;
import org.json.JSONException;

public class SecureTotpPlugin extends CordovaPlugin {

    private static final String TAG = "SecureTotpPlugin";

    /**
     * Hàm phụ trợ: Kiểm tra Origin (Chống XSS)
     */
    private boolean isSafeOrigin(String currentUrl) {
        if (currentUrl == null || currentUrl.isEmpty()) return false;
        
        String urlLower = currentUrl.toLowerCase();
        
        // Local file URLs are always safe
        if (urlLower.startsWith("file:///android_asset/www/")) return true;
        
        // Parse URL to extract host for safe comparison
        Uri uri = Uri.parse(urlLower);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        
        // Known safe schemes
        if ("outsystems".equals(scheme)) return true;
        
        // HTTPS localhost
        if ("https".equals(scheme) && "localhost".equals(host)) return true;
        
        // Check configured hosts — compare exact host match to prevent
        // subdomain bypass (e.g., "evil-myhost.com" matching "myhost.com")
        if (host != null) {
            String osDefaultHost = preferences.getString("DefaultHostname", "").toLowerCase();
            String cordovaHost = preferences.getString("hostname", "").toLowerCase();
            
            if (!osDefaultHost.isEmpty() && host.equals(osDefaultHost)) return true;
            if (!cordovaHost.isEmpty() && host.equals(cordovaHost)) return true;
        }
        
        return false;
    }

    @Override
    public boolean execute(final String action, final JSONArray args, final CallbackContext callbackContext) throws JSONException {
        
        // 1. CHUYỂN TOÀN BỘ SANG UI THREAD ĐỂ LẤY URL AN TOÀN
        cordova.getActivity().runOnUiThread(new Runnable() {
            public void run() {
                try {
                    final Context context = cordova.getActivity();
                    String currentUrl = webView.getUrl();
                    
                    LogUtil.d(context, TAG, "Action [" + action + "] called from URL: " + currentUrl);
                    
                    // 2. CHẶN ĐỨNG NẾU SAI ORIGIN (Bảo vệ cho TẤT CẢ các Action)
                    if (!isSafeOrigin(currentUrl)) {
                        LogUtil.e(context, TAG, "Blocked! Invalid Origin: " + currentUrl);
                        callbackContext.error("SECURITY: Command rejected due to invalid Origin.");
                        return; 
                    }

                    // 3. RẼ NHÁNH XỬ LÝ CHO TỪNG ACTION (Đẩy xuống Background Thread)
                    if ("getPublicKey".equals(action)) {
                        cordova.getThreadPool().execute(new Runnable() {
                            public void run() {
                                try {
                                    String pemKey = SecureTotpManager.getPublicKey(context);
                                    callbackContext.success(pemKey); 
                                } catch (Exception e) {
                                    LogUtil.e(context, TAG, "Error getPublicKey: " + e.getMessage());
                                    callbackContext.error(e.getMessage());
                                }
                            }
                        });
                    } 
                    else if ("setEncryptedSecret".equals(action)) {
                        if (args.length() < 1) {
                            callbackContext.error("Missing required argument: encryptedSecret");
                            return;
                        }
                        final String encryptedSecret = args.getString(0);
                        cordova.getThreadPool().execute(new Runnable() {
                            public void run() {
                                try {
                                    // Gọi hàm giải mã và lưu xuống máy (Bạn nhớ thêm hàm này vào Manager nhé)
                                    SecureTotpManager.saveEncryptedSecret(context, encryptedSecret);
                                    callbackContext.success("LƯU_THÀNH_CÔNG"); 
                                } catch (Exception e) {
                                    LogUtil.e(context, TAG, "Error setEncryptedSecret: " + e.getMessage());
                                    callbackContext.error(e.getMessage());
                                }
                            }
                        });
                    } 
                    else if ("getTotpCode".equals(action)) {
                        if (args.length() < 2) {
                            callbackContext.error("Missing required arguments: expired, timeOffset");
                            return;
                        }
                        final int expired = args.getInt(0);
                        final int timeOffset = args.getInt(1);
                        cordova.getThreadPool().execute(new Runnable() {
                            public void run() {
                                try {
                                    // Gọi hàm sinh mã 6 số (Bạn nhớ thêm hàm này vào Manager nhé)
                                    String totpCode = SecureTotpManager.generateTotp(context, expired, timeOffset);
                                    callbackContext.success(totpCode); 
                                } catch (Exception e) {
                                    LogUtil.e(context, TAG, "Error getTotpCode: " + e.getMessage());
                                    callbackContext.error(e.getMessage());
                                }
                            }
                        });
                    } 
                    else {
                        // Action không tồn tại
                        callbackContext.error("Action not found: " + action);
                    }

                } catch (Exception e) {
                    android.util.Log.e(TAG, "🔴 UI Thread Crash Error: " + e.getMessage());
                    callbackContext.error("UI Thread Error: " + e.getMessage());
                }
            }
        });
        
        return true; 
    }
}