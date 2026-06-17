#!/usr/bin/env node

/**
 * UNIFIED HOOK: Customize native colors (splash screen + webview)
 * 
 * Smart approach:
 * - Replaces ONLY named splash colors (splash_background, etc.)
 * - Does NOT touch other colors by hex value
 * - Preserves status bar, accent, and other app colors
 * - UPDATED: Supports new Cordova template file names (cdv_*.xml)
 */

const fs = require('fs');
const path = require('path');
const { 
  getConfigParser, 
  normalizeHexColor, 
  validateHexColor,
  hexToRgb,
  safeWriteFile 
} = require('./utils');

/**
 * Known splash background color names - ONLY these will be replaced
 * Updated to include Cordova's default color names (cdv_*)
 */
const SPLASH_COLOR_NAMES = [
  'splash_background',
  'splashColor',
  'splash_color',
  'splashscreen_color',
  'splashBackground',
  // Cordova default color names
  'cdv_background_color',
  'cdv_splashscreen_background',
  'cdv_splashscreen_background_color'
];

/**
 * Get the colors.xml file path, supporting both old and new naming conventions
 * Priority: cdv_colors.xml (new) > colors.xml (legacy)
 */
function getColorsPath(root) {
  const resPath = path.join(root, 'platforms/android/app/src/main/res/values');
  const newPath = path.join(resPath, 'cdv_colors.xml');
  const oldPath = path.join(resPath, 'colors.xml');
  
  if (fs.existsSync(newPath)) {
    console.log('   ℹ️  Using new Cordova template: cdv_colors.xml');
    return newPath;
  } else if (fs.existsSync(oldPath)) {
    console.log('   ℹ️  Using legacy template: colors.xml');
    return oldPath;
  }
  
  return null;
}

/**
 * Get the styles.xml file path, supporting both old and new naming conventions
 * Priority: cdv_themes.xml (new) > themes.xml > styles.xml (legacy)
 */
function getStylesPath(root) {
  const resPath = path.join(root, 'platforms/android/app/src/main/res/values');
  const cdvThemesPath = path.join(resPath, 'cdv_themes.xml');
  const themesPath = path.join(resPath, 'themes.xml');
  const stylesPath = path.join(resPath, 'styles.xml');
  
  if (fs.existsSync(cdvThemesPath)) {
    console.log('   ℹ️  Using new Cordova template: cdv_themes.xml');
    return cdvThemesPath;
  } else if (fs.existsSync(themesPath)) {
    console.log('   ℹ️  Using themes.xml');
    return themesPath;
  } else if (fs.existsSync(stylesPath)) {
    console.log('   ℹ️  Using legacy template: styles.xml');
    return stylesPath;
  }
  
  return null;
}

/**
 * Customize Android splash & webview colors
 * ONLY touches named splash colors, NOT hex values
 * UPDATED: Supports both old and new Cordova file naming
 *
 * IMPORTANT: Legacy names (splash_background, webview_background) go ONLY in
 * colors.xml. Cordova cdv_* names go ONLY in cdv_colors.xml. Mixing them
 * causes "Duplicate resources" build failures on Android.
 */
function customizeAndroidColors(root, backgroundColor, webviewBackgroundColor) {
  const resPath = path.join(root, 'platforms/android/app/src/main/res/values');
  const colorsXmlPath = path.join(resPath, 'colors.xml');
  const cdvColorsPath = path.join(resPath, 'cdv_colors.xml');

  // --- 1a. Update colors.xml — legacy names ONLY ---
  if (fs.existsSync(colorsXmlPath)) {
    let colors = fs.readFileSync(colorsXmlPath, 'utf8');
    let updated = false;

    if (backgroundColor) {
      // Update existing legacy splash color names
      const legacyNames = ['splash_background', 'splashColor', 'splash_color',
        'splashscreen_color', 'splashBackground', 'cordova_splash_background'];
      for (const colorName of legacyNames) {
        const regex = new RegExp(
          `<color name="${colorName}">[^<]*</color>`, 'i'
        );
        if (colors.match(regex)) {
          colors = colors.replace(regex,
            `<color name="${colorName}">${backgroundColor}</color>`);
          console.log(`   ✓ Updated ${colorName} in colors.xml`);
          updated = true;
        }
      }

      // Add splash_background if not exists
      if (!colors.includes('splash_background')) {
        colors = colors.replace('</resources>',
          `    <color name="splash_background">${backgroundColor}</color>\n</resources>`);
        console.log(`   ✓ Added splash_background to colors.xml`);
        updated = true;
      }
    }

    if (webviewBackgroundColor) {
      if (!colors.includes('webview_background')) {
        colors = colors.replace('</resources>',
          `    <color name="webview_background">${webviewBackgroundColor}</color>\n</resources>`);
        console.log(`   ✓ Added webview_background to colors.xml`);
      } else {
        colors = colors.replace(
          /<color name="webview_background">[^<]*<\/color>/i,
          `<color name="webview_background">${webviewBackgroundColor}</color>`);
        console.log(`   ✓ Updated webview_background in colors.xml`);
      }
      updated = true;
    }

    if (updated) {
      safeWriteFile(colorsXmlPath, colors);
      console.log(`   📝 Saved colors.xml`);
    }
  } else {
    // Fallback: try cdv_colors.xml for cdv_* names only (no legacy names)
    console.log('   ℹ️  colors.xml not found');
  }

  // --- 1b. Update cdv_colors.xml — Cordova cdv_* names ONLY ---
  if (fs.existsSync(cdvColorsPath) && backgroundColor) {
    let cdvColors = fs.readFileSync(cdvColorsPath, 'utf8');
    let updated = false;

    // Update cdv_* splash color names
    const cdvNames = ['cdv_background_color', 'cdv_splashscreen_background',
      'cdv_splashscreen_background_color'];
    for (const colorName of cdvNames) {
      const regex = new RegExp(
        `<color name="${colorName}">[^<]*</color>`, 'i'
      );
      if (cdvColors.match(regex)) {
        cdvColors = cdvColors.replace(regex,
          `<color name="${colorName}">${backgroundColor}</color>`);
        console.log(`   ✓ Updated ${colorName} in cdv_colors.xml`);
        updated = true;
      }
    }

    // Fix cdv_splashscreen_background reference
    if (cdvColors.includes('cdv_splashscreen_background')) {
      const refRegex = /<color name="cdv_splashscreen_background">@color\/cdv_background_color<\/color>/i;
      if (refRegex.test(cdvColors)) {
        cdvColors = cdvColors.replace(refRegex,
          `<color name="cdv_splashscreen_background">${backgroundColor}</color>`);
        console.log(`   ✓ Fixed cdv_splashscreen_background reference`);
        updated = true;
      }
    }

    // CRITICAL: Remove legacy names from cdv_colors.xml to prevent duplicates
    for (const legacyName of ['splash_background', 'webview_background']) {
      const legacyRegex = new RegExp(
        `\\s*<color\\s+name=["']${legacyName}["'][^>]*>[^<]*<\\/color>\\s*`, 'g'
      );
      if (legacyRegex.test(cdvColors)) {
        cdvColors = cdvColors.replace(legacyRegex, '\n');
        console.log(`   ✓ Removed duplicate ${legacyName} from cdv_colors.xml`);
        updated = true;
      }
    }

    if (updated) {
      safeWriteFile(cdvColorsPath, cdvColors);
      console.log(`   📝 Saved cdv_colors.xml`);
    }
  }
  
  // 2. Update styles.xml/themes.xml/cdv_themes.xml - Use @color references
  const stylesPath = getStylesPath(root);
  
  if (stylesPath && fs.existsSync(stylesPath) && backgroundColor) {
    let styles = fs.readFileSync(stylesPath, 'utf8');
    let updated = false;
    
    // Update AppTheme.Launcher to use @color/splash_background
    if (styles.includes('AppTheme.Launcher')) {
      const launcherRegex = /(<style name="AppTheme\.Launcher"[^>]*>)(.*?)(<\/style>)/s;
      const launcherMatch = styles.match(launcherRegex);
      
      if (launcherMatch) {
        let themeContent = launcherMatch[2];
        
        if (themeContent.includes('android:windowBackground')) {
          // Replace with color reference
          themeContent = themeContent.replace(
            /<item name="android:windowBackground">[^<]*<\/item>/,
            `<item name="android:windowBackground">@color/splash_background</item>`
          );
          styles = styles.replace(launcherRegex, `$1${themeContent}$3`);
          console.log(`   ✓ Updated AppTheme.Launcher to use @color/splash_background`);
          updated = true;
        }
      }
    }
    
    if (updated) {
      safeWriteFile(stylesPath, styles);
      console.log(`   📝 Saved ${path.basename(stylesPath)}`);
    }
  } else if (!stylesPath) {
    console.log('   ⚠️  No styles/themes file found');
  }
  
  // 3. Update splash.xml drawable
  const splashXmlPath = path.join(
    root,
    'platforms/android/app/src/main/res/drawable/splash.xml'
  );
  
  if (backgroundColor && fs.existsSync(splashXmlPath)) {
    let splash = fs.readFileSync(splashXmlPath, 'utf8');
    let updated = false;
    
    // Replace solid colors with color reference
    if (splash.includes('<solid')) {
      splash = splash.replace(
        /<solid android:color="[^"]*"/g,
        `<solid android:color="@color/splash_background"`
      );
      console.log(`   ✓ Updated splash.xml to use @color/splash_background`);
      updated = true;
    }
    
    if (updated) {
      safeWriteFile(splashXmlPath, splash);
      console.log(`   📝 Saved splash.xml`);
    }
  }
  
  if (backgroundColor) {
    console.log(`   ✅ Android splash: ${backgroundColor}`);
  }
  if (webviewBackgroundColor) {
    console.log(`   ✅ Android webview: ${webviewBackgroundColor}`);
  }
}

/**
 * Customize iOS splash & webview colors
 */
function customizeIOSColors(root, config, backgroundColor, webviewBackgroundColor) {
  const projectName = config.name();
  const platformPath = path.join(root, 'platforms/ios');
  
  if (!fs.existsSync(platformPath)) {
    console.log('⚠ iOS platform folder not found');
    return;
  }
  
  // iOS LaunchScreen.storyboard
  if (backgroundColor) {
    const storyboardPath = path.join(
      platformPath,
      projectName,
      'Resources/LaunchScreen.storyboard'
    );
    
    if (fs.existsSync(storyboardPath)) {
      const rgb = hexToRgb(backgroundColor);
      let storyboard = fs.readFileSync(storyboardPath, 'utf8');
      
      // Update ALL backgroundColor in storyboard
      const colorPattern = /<color key="backgroundColor"[^\/]*\/>/g;
      const matches = storyboard.match(colorPattern) || [];
      
      if (matches.length > 0) {
        storyboard = storyboard.replace(
          colorPattern,
          `<color key="backgroundColor" red="${rgb.r.toFixed(3)}" green="${rgb.g.toFixed(3)}" blue="${rgb.b.toFixed(3)}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>`
        );
        
        safeWriteFile(storyboardPath, storyboard);
        console.log(`   ✓ Updated ${matches.length} backgroundColor in LaunchScreen.storyboard`);
      }
      
      console.log(`   📝 Saved LaunchScreen.storyboard`);
    }
    
    console.log(`   ✅ iOS splash: ${backgroundColor}`);
  }
  
  if (webviewBackgroundColor) {
    console.log(`   ℹ️  iOS webview: ${webviewBackgroundColor}`);
  }
}

/**
 * Main hook
 */
module.exports = function(context) {
  const platforms = context.opts.platforms;
  const root = context.opts.projectRoot;
  
  const config = getConfigParser(context, path.join(root, 'config.xml'));
  
  // Get native background preferences. BackgroundColor is the canonical
  // OutSystems value; WEBVIEW_BACKGROUND_COLOR is handled separately below.
  let splashColor = config.getPreference('BackgroundColor') ||
                    config.getPreference('SplashScreenBackgroundColor') ||
                    config.getPreference('AndroidWindowSplashScreenBackground') ||
                    config.getPreference('AndroidWindowSplashScreenBackgroundColor') ||
                    config.getPreference('SPLASH_BACKGROUND_COLOR');
                    
  let webviewColor = config.getPreference('WEBVIEW_BACKGROUND_COLOR') ||
                     config.getPreference('WebviewBackgroundColor');
  
  // Validate colors
  if (splashColor && !validateHexColor(splashColor)) {
    console.error('\n❌ Invalid splash color format. Use hex color (e.g., #FFFFFF)');
    return;
  }
  
  if (webviewColor && !validateHexColor(webviewColor)) {
    console.error('\n❌ Invalid webview color format. Use hex color (e.g., #FFFFFF)');
    return;
  }
  
  // Normalize colors
  if (splashColor) {
    splashColor = normalizeHexColor(splashColor);
  }
  if (webviewColor) {
    webviewColor = normalizeHexColor(webviewColor);
  }
  
  // Skip if no colors configured
  if (!splashColor && !webviewColor) {
    console.log('\n🎨 No custom colors configured, skipping');
    return;
  }
  
  console.log('\n══════════════════════════════════════════════');
  console.log('  🎨 CUSTOMIZE COLORS (Named Colors Only)');
  console.log('══════════════════════════════════════════════');
  console.log('⚠️  ONLY replaces named splash colors');
  console.log('⚠️  Includes Cordova cdv_* color names');
  console.log('⚠️  Supports new Cordova template files (cdv_*.xml)');
  console.log('⚠️  Does NOT replace by hex value');
  console.log('⚠️  Status bar and other colors preserved');
  
  if (splashColor) console.log(`Splash: ${splashColor}`);
  if (webviewColor) console.log(`Webview: ${webviewColor}`);
  
  for (const platform of platforms) {
    console.log(`\n📱 ${platform}...`);
    
    try {
      if (platform === 'android') {
        customizeAndroidColors(root, splashColor, webviewColor);
      } else if (platform === 'ios') {
        customizeIOSColors(root, config, splashColor, webviewColor);
      }
    } catch (error) {
      console.error(`\n❌ Error:`, error.message);
    }
  }
  
  console.log('\n══════════════════════════════════════════════');
  console.log('✓ Color customization completed!');
  console.log('══════════════════════════════════════════════\n');
};
