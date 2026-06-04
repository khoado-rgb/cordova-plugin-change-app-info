package com.vnkhoado.cordova.plugin;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.util.Log;

public class LogUtil {

    private static Boolean isDebuggable = null;

    /**
     * Check whether the app is running in debug mode.
     * The result is cached in isDebuggable to avoid repeated computation.
     */
    private static boolean isAppDebuggable(Context context) {
        if (isDebuggable == null && context != null) {
            isDebuggable = (0 != (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE));
        }
        return isDebuggable != null && isDebuggable;
    }

    /**
     * Print debug logs only in debug builds.
     */
    public static void d(Context context, String tag, String message) {
        if (isAppDebuggable(context)) {
            Log.d(tag, "🟢 " + message);
        }
    }

    /**
     * Print error logs only in debug builds.
     */
    public static void e(Context context, String tag, String message) {
        if (isAppDebuggable(context)) {
            Log.e(tag, "🔴 ERROR: " + message);
        }
    }
}
