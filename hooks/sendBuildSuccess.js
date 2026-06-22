#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");
const { getConfigParser } = require("./utils");

/**
 * Read backup data
 */
function readBackup(root) {
  const backupFile = path.join(root, ".cordova-build-backup", "app-info-backup.json");
  
  if (!fs.existsSync(backupFile)) {
    console.log("[ERROR] Backup file not found: " + backupFile);
    return null;
  }
  
  try {
    const data = fs.readFileSync(backupFile, "utf8");
    const backup = JSON.parse(data);
    console.log("[DEBUG] Backup loaded successfully");
    return backup;
  } catch (err) {
    console.error("[ERROR] Failed to read backup:", err.message);
    return null;
  }
}

/**
 * Get app domain from multiple sources
 */
function getAppDomain(config, backup) {
  if (backup && backup.apiHostname && backup.apiHostname.trim() !== "") {
    return backup.apiHostname.trim();
  }
  let domain = config.getPreference("API_HOSTNAME");
  if (domain && domain.trim() !== "") return domain.trim();
  
  domain = config.getPreference("SERVER_URL");
  if (domain && domain.trim() !== "") return domain.trim();
  
  try {
    const widgetId = config.packageName();
    if (widgetId && widgetId.includes('.')) {
      const parts = widgetId.split('.');
      if (parts.length >= 2) {
        return parts[1] + '.' + parts[0];
      }
    }
  } catch (err) {}
  
  domain = config.getPreference("BACKEND_URL");
  if (domain && domain.trim() !== "") return domain.trim();
  
  return "";
}

/**
 * Get MABS app name from backup
 */
function getMabsAppName(backup) {
  if (backup && backup.mabsAppName && backup.mabsAppName.trim() !== "") {
    return backup.mabsAppName.trim();
  }
  return "";
}

/**
 * Send build info to API with Bearer Token
 */
function sendToAPI(apiUrl, bearerToken, buildData) {
  return new Promise((resolve, reject) => {
    try {
      let secureUrl = apiUrl;
      if (secureUrl.startsWith('http://')) {
        secureUrl = secureUrl.replace('http://', 'https://');
      }
      if (!secureUrl.startsWith('https://') && !secureUrl.startsWith('http://')) {
        secureUrl = 'https://' + secureUrl;
      }
      
      const url = new URL(secureUrl);
      const postData = JSON.stringify(buildData);
      
      const headers = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      };
      
      if (bearerToken && bearerToken.trim() !== "") {
        headers["Authorization"] = `Bearer ${bearerToken.trim()}`;
      }
      
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: "POST",
        headers: headers,
        timeout: 30000
      };
      
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, statusCode: res.statusCode, data: data });
          } else {
            reject(new Error(`API returned status ${res.statusCode}`));
          }
        });
      });
      
      req.on("error", (err) => reject(new Error(`Network error: ${err.message}`)));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });
      
      req.write(postData);
      req.end();
    } catch (err) {
      reject(new Error(`Request setup failed: ${err.message}`));
    }
  });
}

/**
 * Main hook - runs AFTER successful build
 */
module.exports = function(context) {
  const root = context.opts.projectRoot;
  const platforms = context.opts.platforms;
  
  console.log("\n==================================");
  console.log("   SEND BUILD SUCCESS TO APIs      ");
  console.log("==================================");
  
  const config = getConfigParser(context, path.join(root, "config.xml"));
  const enableNotification = config.getPreference("ENABLE_BUILD_NOTIFICATION");
  const normalizedEnableNotification = (enableNotification || "").toString().trim().toLowerCase();
  const isBuildNotificationEnabled = ["true", "1", "yes"].includes(normalizedEnableNotification);

  const apiBaseUrl = config.getPreference("BUILD_SUCCESS_API_URL");
  const bearerToken = config.getPreference("BUILD_API_BEARER_TOKEN");
  const distApiUrl = config.getPreference("APP_DISTRIBUTION_API");
  const distBearerToken = config.getPreference("APP_DISTRIBUTION_BEARER_TOKEN");

  const hasBuildSuccessApi = apiBaseUrl && apiBaseUrl.trim() !== "";
  const hasDistributionApi = distApiUrl && distApiUrl.trim() !== "";
  const shouldSendBuildSuccess = isBuildNotificationEnabled && hasBuildSuccessApi;
  const shouldSendDistribution = hasDistributionApi;

  if (!isBuildNotificationEnabled) {
    console.log("[INFO] Build Success API notification is DISABLED");
  } else if (!hasBuildSuccessApi) {
    console.log("[WARN] ENABLE_BUILD_NOTIFICATION is enabled but BUILD_SUCCESS_API_URL is not configured");
  }

  if (!shouldSendDistribution && !shouldSendBuildSuccess) {
    console.log("[INFO] No build notification APIs configured");
    return;
  }
  
  const backup = readBackup(root);
  if (!backup || !backup.platforms) {
    console.log("[ERROR] No backup found or invalid backup data");
    return;
  }
  
  const mabsAppName = getMabsAppName(backup);
  const appId = config.packageName() || "unknown.app.id";
  const configAppName = config.getPreference("APP_NAME") || config.name() || "Unknown App";
  const newAppDomain = getAppDomain(config, backup);
  
  // Read shared configuration from config.xml.
  const rawConfigVersionNumber = config.getPreference("VERSION_NUMBER") || config.version();
  const rawConfigVersionCode = config.getPreference("VERSION_CODE"); 

  const allApiPromises = [];
  
  platforms.forEach(platform => {
    // Read platform-specific backup data when available.
    const backupPlatformData = backup.platforms[platform] || {};
    const originalVersion = backupPlatformData.versionNumber || "0.0.0";

    // ---------------------------------------------------------
    // Fallback logic for version number and version code.
    // Used by the Build Success API payload.
    // ---------------------------------------------------------
    let finalVersionNumber = rawConfigVersionNumber;
    if (!finalVersionNumber || finalVersionNumber === "0" || finalVersionNumber === "0.0.0") {
        finalVersionNumber = backupPlatformData.versionNumber || "0.0.0";
        console.log(`\n  [FALLBACK] Đã lấy VersionNumber từ backup cho ${platform}: ${finalVersionNumber}`);
    }

    let finalVersionCode = rawConfigVersionCode;
    if (!finalVersionCode || finalVersionCode === "0" || finalVersionCode === "0.0.0") {
        finalVersionCode = backupPlatformData.versionCode || "0";
        console.log(`  [FALLBACK] Đã lấy VersionCode từ backup cho ${platform}: ${finalVersionCode}`);
    }

    if (shouldSendBuildSuccess) {
      // ---------------------------------------------------------
      // 1. BUILD SUCCESS API
      // ---------------------------------------------------------
      const buildApiUrl = `${apiBaseUrl.trim().replace(/\/$/, '')}?version=${encodeURIComponent(originalVersion)}`;
      const buildPayload = {
        app_name: mabsAppName,
        config_app_name: configAppName,
        app_domain: newAppDomain,
        app_platform: platform,
        config_version: finalVersionNumber
      };

      console.log("\n[" + platform.toUpperCase() + " - BUILD SUCCESS API]");
      console.log("  URL: " + buildApiUrl);
      console.log("  Body: " + JSON.stringify(buildPayload));

      const buildPromise = sendToAPI(buildApiUrl, bearerToken, buildPayload)
        .then(result => {
          console.log("  [SUCCESS] Build API Status: " + result.statusCode);
          return { platform, api: "Build Success", success: true };
        })
        .catch(err => {
          console.error("  [FAILED] Build API Error: " + err.message);
          return { platform, api: "Build Success", success: false, error: err.message };
        });

      allApiPromises.push(buildPromise);
    }

    // ---------------------------------------------------------
    // 2. APP DISTRIBUTION API
    // ---------------------------------------------------------
    if (shouldSendDistribution) {
      
      // Read the original MABS version values directly from the backup file.
      const mabsVersionNumber = backupPlatformData.versionNumber || "0.0.0";
      const mabsVersionCode = backupPlatformData.versionCode || "0";

      const distPayload = {
        app_id: appId,
        app_name: mabsAppName,
        config_app_name: configAppName || mabsAppName,
        platform: platform,
        version_code: mabsVersionCode, // Original MABS value, e.g. "1209"
        version_number: mabsVersionNumber,  // Original MABS value, e.g. "1.691"
        config_version_code: rawConfigVersionCode || mabsVersionCode, // Prefer config, fallback to MABS
        config_version_number: rawConfigVersionNumber || mabsVersionNumber  // Prefer config, fallback to MABS
      };

      console.log("\n[" + platform.toUpperCase() + " - APP DISTRIBUTION API]");
      console.log("  URL: " + distApiUrl.trim());
      console.log("  Body: " + JSON.stringify(distPayload));

      const distPromise = sendToAPI(distApiUrl.trim(), distBearerToken, distPayload)
        .then(result => {
          console.log("  [SUCCESS] App Dist API Status: " + result.statusCode);
          return { platform, api: "App Distribution", success: true };
        })
        .catch(err => {
          console.error("  [FAILED] App Dist API Error: " + err.message);
          return { platform, api: "App Distribution", success: false, error: err.message };
        });

      allApiPromises.push(distPromise);
    }
  });
  
  if (allApiPromises.length === 0) {
    console.log("[INFO] No API requests were created");
    return;
  }

  // Wait for all requests to complete.
  Promise.all(allApiPromises)
    .then(results => {
      console.log("\n==================================");
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      console.log("API notifications completed:");
      console.log("  Success: " + successCount);
      if (failCount > 0) {
        console.log("  Failed: " + failCount);
        results.filter(r => !r.success).forEach(f => {
            console.log(`    - [${f.platform}] ${f.api}: ${f.error}`);
        });
      }
      console.log("==================================\n");
    });
};
