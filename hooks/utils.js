#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// ============================================================================
// CONFIG UTILITIES
// ============================================================================

/**
 * Get config.xml path for platform
 */
function getConfigPath(context, platform) {
  const root = context.opts.projectRoot;
  const platformPath = path.join(root, 'platforms', platform);
  
  if (!fs.existsSync(platformPath)) {
    return null;
  }
  
  let configPath = path.join(platformPath, 'config.xml');
  if (fs.existsSync(configPath)) {
    return configPath;
  }
  
  configPath = path.join(root, 'config.xml');
  if (fs.existsSync(configPath)) {
    return configPath;
  }
  
  return null;
}

/**
 * Get ConfigParser instance
 */
function getConfigParser(context, configPath) {
  const ConfigParser = context.requireCordovaModule('cordova-common').ConfigParser;
  return new ConfigParser(configPath || path.join(context.opts.projectRoot, 'config.xml'));
}

/**
 * Check if Cordova version is above a specific version
 */
function isCordovaAbove(context, version) {
  try {
    const cordovaVersion = context.opts.cordova.version;
    if (!cordovaVersion) return false;
    
    const current = cordovaVersion.split('.').map(Number);
    const target = version.split('.').map(Number);
    
    for (let i = 0; i < Math.max(current.length, target.length); i++) {
      const currentPart = current[i] || 0;
      const targetPart = target[i] || 0;
      
      if (currentPart > targetPart) return true;
      if (currentPart < targetPart) return false;
    }
    
    return true;
  } catch (err) {
    console.warn('⚠️ Could not determine Cordova version:', err.message);
    return true;
  }
}

/**
 * Get Cordova version
 */
function getCordovaVersion(context) {
  try {
    return context.opts.cordova.version || 'unknown';
  } catch (err) {
    return 'unknown';
  }
}

// ============================================================================
// PLATFORM UTILITIES
// ============================================================================

function isIOS(platform) {
  return platform === 'ios';
}

function isAndroid(platform) {
  return platform === 'android';
}

/**
 * Get iOS app folder name (looks for .xcodeproj)
 */
function getIOSAppFolderName(root) {
  const platformPath = path.join(root, 'platforms/ios');
  
  if (!fs.existsSync(platformPath)) {
    return null;
  }
  
  const folders = fs.readdirSync(platformPath).filter(f => {
    const fullPath = path.join(platformPath, f);
    return (
      fs.statSync(fullPath).isDirectory() &&
      f !== 'CordovaLib' &&
      f !== 'www' &&
      f !== 'cordova' &&
      f !== 'build' &&
      f !== 'DerivedData'
    );
  });
  
  return folders.length > 0 ? folders[0] : null;
}

/**
 * Get iOS project name from .xcodeproj
 */
function getIOSProjectName(iosPath) {
  if (!fs.existsSync(iosPath)) return null;
  
  const xcodeProjects = fs.readdirSync(iosPath)
    .filter(f => f.endsWith('.xcodeproj'));
  
  return xcodeProjects.length > 0 ? xcodeProjects[0].replace('.xcodeproj', '') : null;
}

/**
 * Get Android package name from build.gradle
 */
function getAndroidPackageName(root) {
  const buildGradlePath = path.join(
    root,
    'platforms/android/app/build.gradle'
  );
  
  if (!fs.existsSync(buildGradlePath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(buildGradlePath, 'utf8');
    const match = content.match(/applicationId\s+"([^"]+)"/);
    return match ? match[1] : null;
  } catch (err) {
    return null;
  }
}

// ============================================================================
// FILE UTILITIES
// ============================================================================

/**
 * Safe file write with backup
 * UPDATED: Moves backup files outside res directory to avoid Gradle errors
 */
function safeWriteFile(filePath, content) {
  if (fs.existsSync(filePath)) {
    // Check if this is an Android res file that needs special backup handling
    const isAndroidResFile = filePath.includes('/res/values/') || 
                             filePath.includes('\\res\\values\\');
    
    if (isAndroidResFile) {
      // Move backup to parent directory outside res
      const fileName = path.basename(filePath);
      const platformDir = filePath.split(/[\\/]platforms[\\/]/)[0];
      const backupDir = path.join(platformDir, 'plugins', 'cordova-plugin-change-app-info', 'backups');
      
      // Ensure backup directory exists
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      const backupPath = path.join(backupDir, fileName + '.backup');
      
      try {
        fs.copyFileSync(filePath, backupPath);
        // Clean up any old backup in the same directory
        const oldBackupPath = filePath + '.backup';
        if (fs.existsSync(oldBackupPath)) {
          fs.unlinkSync(oldBackupPath);
        }
      } catch (err) {
        console.warn('⚠️ Could not create backup:', err.message);
      }
    } else {
      // For non-Android res files, keep old behavior
      const backupPath = filePath + '.backup';
      try {
        fs.copyFileSync(filePath, backupPath);
      } catch (err) {
        console.warn('⚠️ Could not create backup:', err.message);
      }
    }
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

function isFileReadable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch (err) {
    return false;
  }
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Find first file matching patterns in directory tree
 */
function findFile(baseDir, patterns, maxDepth = 3) {
  function searchDir(dir, depth = 0) {
    if (depth > maxDepth) return null;
    
    let items;
    try {
      items = fs.readdirSync(dir);
    } catch (error) {
      return null;
    }
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      let stat;
      
      try {
        stat = fs.statSync(fullPath);
      } catch (error) {
        continue;
      }
      
      if (stat.isFile()) {
        for (const pattern of patterns) {
          if (item === pattern || item.endsWith(pattern)) {
            return fullPath;
          }
        }
      } else if (stat.isDirectory()) {
        if (['node_modules', 'build', 'Pods', '.git', 'DerivedData'].includes(item)) {
          continue;
        }
        const found = searchDir(fullPath, depth + 1);
        if (found) return found;
      }
    }
    
    return null;
  }
  
  return searchDir(baseDir);
}

/**
 * Find all files matching patterns
 */
function findAllFiles(baseDir, patterns, maxDepth = 3) {
  const results = [];
  
  function searchDir(dir, depth = 0) {
    if (depth > maxDepth) return;
    
    let items;
    try {
      items = fs.readdirSync(dir);
    } catch (error) {
      return;
    }
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      let stat;
      
      try {
        stat = fs.statSync(fullPath);
      } catch (error) {
        continue;
      }
      
      if (stat.isFile()) {
        for (const pattern of patterns) {
          if (item === pattern || item.endsWith(pattern)) {
            results.push(fullPath);
            break;
          }
        }
      } else if (stat.isDirectory()) {
        if (['node_modules', 'build', 'Pods', '.git', 'DerivedData'].includes(item)) {
          continue;
        }
        searchDir(fullPath, depth + 1);
      }
    }
  }
  
  searchDir(baseDir);
  return results;
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Validate hex color format
 * @param {string} color - Color in hex format (#RRGGBB, RRGGBB, #RRGGBBAA, or RRGGBBAA)
 * @returns {boolean}
 */
function validateHexColor(color) {
  const hexRegex = /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/;
  return hexRegex.test(color);
}

/**
 * Normalize hex color format
 * @param {string} color - Color in hex format
 * @returns {string} - Normalized color with #
 */
function normalizeHexColor(color) {
  if (!color) return null;
  
  // Remove # if present
  let hex = color.replace(/^#/, '');
  
  // Remove alpha channel if present (last 2 chars if 8 chars long)
  if (hex.length === 8) {
    hex = hex.substring(0, 6);
  }
  
  // Ensure 6 characters
  if (hex.length !== 6) {
    return null;
  }
  
  return '#' + hex.toLowerCase();
}

/**
 * Convert hex color to RGB object (0.0 - 1.0 range)
 */
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255.0;
  const g = parseInt(hex.substring(2, 4), 16) / 255.0;
  const b = parseInt(hex.substring(4, 6), 16) / 255.0;
  return { r, g, b };
}

/**
 * Convert RGB object to string for XML
 */
function rgbToString(rgb, precision = 3) {
  return `red="${rgb.r.toFixed(precision)}" green="${rgb.g.toFixed(precision)}" blue="${rgb.b.toFixed(precision)}"`;
}

/**
 * Convert hex to Swift UIColor
 */
function hexToSwiftUIColor(hex) {
  const rgb = hexToRgb(hex);
  return `UIColor(red: ${rgb.r.toFixed(3)}, green: ${rgb.g.toFixed(3)}, blue: ${rgb.b.toFixed(3)}, alpha: 1.0)`;
}

/**
 * Convert hex to Objective-C UIColor
 */
function hexToObjCUIColor(hex) {
  const rgb = hexToRgb(hex);
  return `[UIColor colorWithRed:${rgb.r.toFixed(3)}f green:${rgb.g.toFixed(3)}f blue:${rgb.b.toFixed(3)}f alpha:1.0f]`;
}

/**
 * Get background color from config (tries multiple keys)
 * Uses ConfigParser.getPreference API
 */
function getBackgroundColorPreference(config) {
  return config.getPreference('BackgroundColor') ||
         config.getPreference('SplashScreenBackgroundColor') ||
         config.getPreference('AndroidWindowSplashScreenBackground') ||
         config.getPreference('AndroidWindowSplashScreenBackgroundColor') ||
         config.getPreference('WEBVIEW_BACKGROUND_COLOR') ||
         null;
}

/**
 * Read color configuration from ConfigParser
 * Reads OLD_COLOR (what to replace) and BackgroundColor (target color)
 * 
 * Priority for target color:
 * 1. BackgroundColor (general preference)
 * 2. SplashScreenBackgroundColor
 * 3. AndroidWindowSplashScreenBackground / AndroidWindowSplashScreenBackgroundColor
 * 4. WEBVIEW_BACKGROUND_COLOR
 * 5. OLD_COLOR fallback (no app-specific color override)
 * 
 * @param {Object} config - ConfigParser instance from getConfigParser()
 * @returns {Object} { oldColor: string, newColor: string }
 */
function readColorConfigFromXml(config) {
  const defaultOldColor = '#1E1464';

  if (!config) {
    return {
      oldColor: defaultOldColor,
      newColor: defaultOldColor
    };
  }

  try {
    // Read OLD_COLOR (Cordova default to replace)
    let oldColor = config.getPreference('OLD_COLOR');
    oldColor = oldColor ? oldColor.trim() : defaultOldColor;
    
    // Read NEW/TARGET color - try multiple preference names
    let newColor = getBackgroundColorPreference(config);
    
    // Apply defaults
    if (newColor) {
      newColor = newColor.trim();
    } else {
      newColor = oldColor;
    }
    
    // Normalize both colors
    const normalizedOldColor = normalizeHexColor(oldColor);
    const normalizedNewColor = normalizeHexColor(newColor);
    
    return {
      oldColor: normalizedOldColor || defaultOldColor,
      newColor: normalizedNewColor || normalizedOldColor || defaultOldColor
    };
  } catch (error) {
    return {
      oldColor: defaultOldColor,
      newColor: defaultOldColor
    };
  }
}

// ============================================================================
// PLIST UTILITIES
// ============================================================================

/**
 * Update plist value using string replacement
 */
function updatePlistValue(plistContent, key, value) {
  const regex = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  if (regex.test(plistContent)) {
    return plistContent.replace(regex, `$1${value}$2`);
  }
  return plistContent;
}

/**
 * Get iOS Info.plist path
 */
function getInfoPlistPath(iosPath) {
  const projectName = getIOSProjectName(iosPath);
  if (!projectName) return null;
  
  return path.join(iosPath, projectName, `${projectName}-Info.plist`);
}

// ============================================================================
// DOWNLOAD UTILITIES
// ============================================================================

/**
 * Download file from URL
 */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        return reject(new Error(`Download failed with status ${response.statusCode}`));
      }
      
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

// ============================================================================
// IMAGE PROCESSING UTILITIES
// ============================================================================

/**
 * Try to load image processing library (sharp or jimp)
 */
function getImageProcessor() {
  try {
    const sharp = require('sharp');
    return { type: 'sharp', lib: sharp };
  } catch (e) {
    try {
      const { Jimp } = require('jimp');
      return { type: 'jimp', lib: Jimp };
    } catch (e2) {
      return null;
    }
  }
}

/**
 * Resize image using available processor
 */
async function resizeImage(inputBuffer, outputPath, size) {
  const processor = getImageProcessor();
  
  if (!processor) {
    throw new Error('No image processor available (install sharp or jimp)');
  }
  
  if (processor.type === 'sharp') {
    await processor.lib(inputBuffer)
      .resize(size, size)
      .toFile(outputPath);
  } else { // jimp
    const image = await processor.lib.fromBuffer(inputBuffer);
    image.resize({ w: size, h: size });
    await image.write(outputPath);
  }
}

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

function logWithTimestamp(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function logSection(title) {
  console.log('\n══════════════════════════════════════════════');
  console.log(`  ${title}`);
  console.log('══════════════════════════════════════════════');
}

function logSectionComplete(message) {
  console.log('\n══════════════════════════════════════════════');
  console.log(message);
  console.log('══════════════════════════════════════════════\n');
}

// ============================================================================
// TERMINAL COLORS & LOGGING
// ============================================================================

const termColors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function colorLog(color, message) {
  console.log(`${color}${message}${termColors.reset}`);
}

// ============================================================================
// XML FILE UTILITIES (consolidated from android/utils.js)
// ============================================================================

/**
 * Read XML file safely
 */
function readXmlFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Write XML file safely with directory creation
 */
function writeXmlFile(filePath, content) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Create minimal cdv_colors.xml template
 */
function createCdvColorsTemplate(backgroundColor) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<resources>\n    <color name="cdv_splashscreen_background_color">${backgroundColor}</color>\n</resources>\n`;
}

/**
 * Create minimal cdv_themes.xml template
 */
function createCdvThemesTemplate() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<resources>\n    <style name="cdv_splashscreen" parent="Theme.AppCompat.NoActionBar">\n        <item name="android:windowBackground">@color/cdv_splashscreen_background_color</item>\n        <item name="android:windowNoTitle">true</item>\n    </style>\n</resources>\n`;
}

// ============================================================================
// ANDROID-SPECIFIC COLOR UTILITIES (consolidated from aggressive-color-replace.js)
// ============================================================================

/**
 * Convert hex color to decimal ARGB (used in Java/Android)
 * #1E1464 -> -16738332
 */
function hexToArgb(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return ((0xFF << 24) | (r << 16) | (g << 8) | b) - 0x100000000;
}

/**
 * Convert hex to RGB string format
 * #1E1464 -> "30, 20, 100"
 */
function hexToRgbString(hex) {
  const rgb = hexToRgb(hex);
  const r = Math.round(rgb.r * 255);
  const g = Math.round(rgb.g * 255);
  const b = Math.round(rgb.b * 255);
  return `${r}, ${g}, ${b}`;
}

// ============================================================================
// ANDROID FILE SEARCH UTILITIES (consolidated from customizeWebview.js)
// ============================================================================

/**
 * Find MainActivity.java recursively in directory tree
 */
function findMainActivity(dir) {
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const found = findMainActivity(fullPath);
      if (found) return found;
    } else if (file === 'MainActivity.java') {
      return fullPath;
    }
  }

  return null;
}

module.exports = {
  // Config utilities
  getConfigPath,
  getConfigParser,
  
  // Platform utilities
  getIOSAppFolderName,
  getIOSProjectName,
  
  // File utilities
  safeWriteFile,
  isFileReadable,
  ensureDirectoryExists,
  findFile,
  findAllFiles,
  findMainActivity,
  readXmlFile,
  writeXmlFile,
  
  // Color utilities
  validateHexColor,
  normalizeHexColor,
  hexToRgb,
  hexToRgbString,
  hexToArgb,
  rgbToString,
  hexToSwiftUIColor,
  hexToObjCUIColor,
  getBackgroundColorPreference,
  readColorConfigFromXml,
  
  // Android XML template utilities
  createCdvColorsTemplate,
  createCdvThemesTemplate,
  
  // Plist utilities
  updatePlistValue,
  getInfoPlistPath,
  
  // Download utilities
  downloadFile,
  
  // Image processing utilities
  getImageProcessor,
  resizeImage,
  
  // Logging utilities
  termColors,
  colorLog,
  logWithTimestamp,
  logSection,
  logSectionComplete
};
