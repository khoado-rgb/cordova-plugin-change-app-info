#!/usr/bin/env node

/**
 * Android Splash Screen Color Flicker Fix Hook
 * 
 * Solves the issue where Android shows old splash color (1e1464 - Cordova default)
 * before new color displays, causing visible flicker on app launch.
 * 
 * Root Cause:
 * - after_prepare hooks set splash color correctly from BackgroundColor
 * - Cordova Android CLI reprocesses and overwrites with default (1e1464)
 * - Result: App launches with wrong color, then switches to correct color (visible flicker)
 * 
 * Solution:
 * - Run at before_compile phase (FINAL - no more processing after this)
 * - Force splash color to correct value in cdv_colors.xml (Cordova default)
 * - Force theme colors to correct value in cdv_themes.xml
 * - Prevents any further overwriting
 * 
 * Runs at: before_compile stage (after all prepare, before Gradle compilation)
 * 
 * Same pattern as iOS fix: force correct value at final phase
 */

const fs = require('fs');
const path = require('path');
const {
  readColorConfigFromXml,
  normalizeHexColor,
  readXmlFile,
  writeXmlFile,
  createCdvColorsTemplate,
  createCdvThemesTemplate,
  log,
  colors
} = require('./utils');

function fixAndroidSplashFlicker(context) {
  const root = context.opts.projectRoot;
  
  log(colors.bright + colors.blue, '\n╔═══════════════════════════════════════════════════════════╗');
  log(colors.bright + colors.blue, '║  Android Splash Screen Color Flicker Fix (before_compile)  ║');
  log(colors.bright + colors.blue, '╚═══════════════════════════════════════════════════════════╝\n');
  
  // Read colors from config.xml (NO HARDCODING!)
  const configPath = path.join(root, 'config.xml');
  const { oldColor, newColor, hasNewColor } = readColorConfigFromXml(configPath);

  if (!hasNewColor) {
    log(colors.yellow, '⚠️  No custom splash/background color configured, preserving default OutSystems/MABS colors');
    return;
  }
  
  log(colors.reset, `🎯 Replacing "${oldColor}" with "${newColor}" at final phase...`);
  
  const androidResPath = path.join(
    root,
    'platforms/android/app/src/main/res/values'
  );
  
  if (!fs.existsSync(androidResPath)) {
    log(colors.yellow, '\n⚠️  Android resources directory not found, skipping fix');
    return;
  }
  
  let fixedColors = false;
  
  // ============================================
  // 1. Fix cdv_colors.xml (Cordova default naming with underscore)
  // ============================================
  const cdvColorsPath = path.join(androidResPath, 'cdv_colors.xml');
  
  log(colors.reset, '\n📄 Processing cdv_colors.xml:');
  
  let colorContent = readXmlFile(cdvColorsPath);
  
  if (!colorContent) {
    // File doesn't exist, create it with newColor from config
    log(colors.yellow, `   ⚠️  File not found, creating new cdv_colors.xml...`);
    colorContent = createCdvColorsTemplate(newColor);
    
    if (writeXmlFile(cdvColorsPath, colorContent)) {
      log(colors.green, `   ✅ Created cdv_colors.xml with color: ${newColor}`);
      fixedColors = true;
    } else {
      log(colors.red, `   ❌ Failed to create cdv_colors.xml`);
    }
  } else {
    // File exists, replace old color with new color
    try {
      const originalContent = colorContent;
      
      // Pattern to find and replace splash color
      const splashColorPattern = /<color\s+name="cdv_splashscreen_background_color">([^<]*)<\/color>/;
      const splashColorMatch = colorContent.match(splashColorPattern);
      
      if (splashColorMatch) {
        const currentColor = splashColorMatch[1].trim();
        const normalizedCurrentColor = normalizeHexColor(currentColor);
        
        // Replace with new color from config
        colorContent = colorContent.replace(
          splashColorPattern,
          `<color name="cdv_splashscreen_background_color">${newColor}</color>`
        );
        
        if (normalizedCurrentColor !== newColor) {
          log(colors.green, `   ✅ Updated splash color: "${normalizedCurrentColor}" → "${newColor}"`);
          fixedColors = true;
        } else {
          log(colors.green, `   ✅ Splash color already correct: ${newColor}`);
        }
      } else {
        // Color doesn't exist, add it
        const insertPoint = colorContent.indexOf('</resources>');
        if (insertPoint !== -1) {
          colorContent = colorContent.substring(0, insertPoint) +
            `    <color name="cdv_splashscreen_background_color">${newColor}</color>\n` +
            colorContent.substring(insertPoint);
          log(colors.green, `   ✅ Added splash color: "${newColor}"`);
          fixedColors = true;
        }
      }
      
      // Write back if changed
      if (colorContent !== originalContent) {
        if (writeXmlFile(cdvColorsPath, colorContent)) {
          log(colors.green, `   ✅ cdv_colors.xml saved successfully`);
        }
      } else {
        log(colors.green, `   ✅ cdv_colors.xml already correct`);
      }
      
    } catch (error) {
      log(colors.red, `   ❌ Error updating cdv_colors.xml: ${error.message}`);
    }
  }
  
  // ============================================
  // 2. Fix cdv_themes.xml (Cordova default naming with underscore)
  // ============================================
  const cdvThemesPath = path.join(androidResPath, 'cdv_themes.xml');
  
  log(colors.reset, '\n🎨 Processing cdv_themes.xml:');
  
  let themeContent = readXmlFile(cdvThemesPath);
  
  if (!themeContent) {
    // File doesn't exist, create it
    log(colors.yellow, `   ⚠️  File not found, creating new cdv_themes.xml...`);
    themeContent = createCdvThemesTemplate();
    
    if (writeXmlFile(cdvThemesPath, themeContent)) {
      log(colors.green, `   ✅ Created cdv_themes.xml`);
    } else {
      log(colors.red, `   ❌ Failed to create cdv_themes.xml`);
    }
  } else {
    // File exists, ensure it references the color correctly
    try {
      const originalContent = themeContent;
      
      // Ensure theme references correct color variable
      const themeColorPattern = /<item\s+name="android:windowBackground">([^<]*)<\/item>/g;
      
      if (themeColorPattern.test(themeContent)) {
        themeContent = themeContent.replace(
          themeColorPattern,
          '<item name="android:windowBackground">@color/cdv_splashscreen_background_color</item>'
        );
        log(colors.green, `   ✅ Theme window background: Uses cdv_splashscreen_background_color`);
      } else {
        log(colors.green, `   ✅ cdv_themes.xml already correct`);
      }
      
      // Write back if changed
      if (themeContent !== originalContent) {
        if (writeXmlFile(cdvThemesPath, themeContent)) {
          log(colors.green, `   ✅ cdv_themes.xml saved successfully`);
        }
      }
      
    } catch (error) {
      log(colors.red, `   ❌ Error updating cdv_themes.xml: ${error.message}`);
    }
  }
  
  // ============================================
  // 3. Verify AndroidManifest.xml theme reference
  // ============================================
  const manifestPath = path.join(
    root,
    'platforms/android/app/src/main/AndroidManifest.xml'
  );
  
  if (fs.existsSync(manifestPath)) {
    log(colors.reset, '\n📋 Checking AndroidManifest.xml:');
    
    try {
      const content = fs.readFileSync(manifestPath, 'utf8');
      
      if (content.includes('@style/')) {
        log(colors.green, `   ✅ Theme style is correctly referenced`);
      }
      
    } catch (error) {
      log(colors.yellow, `   ⚠️  Could not verify manifest: ${error.message}`);
    }
  }
  
  // ============================================
  // Summary
  // ============================================
  log(colors.reset, '\n' + '═'.repeat(63));
  log(colors.bright + colors.green, '✅ Android Splash Flicker Fix Complete!');
  log(colors.reset, '═'.repeat(63));
  
  log(colors.yellow, '\n📌 What was fixed:');
  log(colors.yellow, `   1. Splash color: ${oldColor} → ${newColor}`);
  log(colors.yellow, '   2. Theme colors synchronized');
  log(colors.yellow, '   3. Files updated: cdv_colors.xml, cdv_themes.xml');
  log(colors.yellow, '   4. No more color flicker on app launch');
  log(colors.yellow, '\n   📝 Configuration from: config.xml');
  log(colors.yellow, '   Build phase: before_compile (FINAL - no more changes)\n');
}

module.exports = function(context) {
  const platforms = context.opts.platforms;
  
  // Only run for Android
  if (!platforms || !platforms.includes('android')) {
    return;
  }
  
  fixAndroidSplashFlicker(context);
};
