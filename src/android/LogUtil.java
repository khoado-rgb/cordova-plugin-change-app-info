package com.vnkhoado.cordova.plugin;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.util.Log;

public class LogUtil {

    private static Boolean isDebuggable = null;

    /**
     * Kiểm tra xem ứng dụng có đang chạy ở chế độ Debug hay không.
     * Kết quả được lưu cache vào biến isDebuggable để không phải tính toán lại nhiều lần.
     */
    private static boolean isAppDebuggable(Context context) {
        if (isDebuggable == null && context != null) {
            isDebuggable = (0 != (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE));
        }
        return isDebuggable != null && isDebuggable;
    }

    /**
     * In Log Debug (Màu xanh) - Chỉ in khi ở môi trường Debug
     */
    public static void d(Context context, String tag, String message) {
        if (isAppDebuggable(context)) {
            Log.d(tag, "🟢 " + message);
        }
    }

    /**
     * In Log Error (Màu đỏ) - Chỉ in khi ở môi trường Debug
     */
    public static void e(Context context, String tag, String message) {
        if (isAppDebuggable(context)) {
            Log.e(tag, "🔴 ERROR: " + message);
        }
    }
}