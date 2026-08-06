package com.vnkhoado.cordova.plugin;

import android.content.Intent;
import android.net.Uri;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Delivers App Link / deep link URLs to JavaScript.
 *
 * The intent-filters are written into AndroidManifest.xml at build time by
 * hooks/registerUniversalLinks.js; this plugin is the runtime half that reads
 * the URL off the launching intent and hands it to the web layer.
 */
public class UniversalLinksPlugin extends CordovaPlugin {

    private static final String TAG = "UniversalLinks";

    /** Set on an intent once its URL has been delivered, so onResume cannot replay it. */
    private static final String HANDLED_EXTRA = "cai_universal_link_handled";

    private CallbackContext subscriber;

    /** A link can arrive before JS subscribes (cold start), so park it here. */
    private String pendingUrl;

    @Override
    protected void pluginInitialize() {
        handleIntent(cordova.getActivity().getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        handleIntent(intent);
    }

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) {
        if ("subscribe".equals(action)) {
            subscriber = callbackContext;

            if (pendingUrl != null) {
                deliver(pendingUrl);
            }
            return true;
        }

        if ("unsubscribe".equals(action)) {
            subscriber = null;
            callbackContext.success();
            return true;
        }

        return false;
    }

    private void handleIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) {
            return;
        }

        if (intent.getBooleanExtra(HANDLED_EXTRA, false)) {
            return;
        }

        Uri data = intent.getData();
        if (data == null) {
            return;
        }

        intent.putExtra(HANDLED_EXTRA, true);

        String url = data.toString();
        android.util.Log.d(TAG, "Received " + url);

        if (subscriber != null) {
            deliver(url);
        } else {
            pendingUrl = url;
        }
    }

    private void deliver(String url) {
        if (subscriber == null) {
            pendingUrl = url;
            return;
        }

        try {
            PluginResult result = new PluginResult(PluginResult.Status.OK, buildPayload(url));
            result.setKeepCallback(true);
            subscriber.sendPluginResult(result);

            pendingUrl = null;
        } catch (JSONException e) {
            android.util.Log.e(TAG, "Could not build payload for " + url, e);
        }
    }

    private JSONObject buildPayload(String url) throws JSONException {
        Uri uri = Uri.parse(url);
        JSONObject params = new JSONObject();

        for (String name : uri.getQueryParameterNames()) {
            params.put(name, uri.getQueryParameter(name));
        }

        JSONObject payload = new JSONObject();
        payload.put("url", url);
        payload.put("scheme", nullToEmpty(uri.getScheme()));
        payload.put("host", nullToEmpty(uri.getHost()));
        payload.put("path", nullToEmpty(uri.getPath()));
        payload.put("query", nullToEmpty(uri.getQuery()));
        payload.put("fragment", nullToEmpty(uri.getFragment()));
        payload.put("params", params);

        return payload;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
