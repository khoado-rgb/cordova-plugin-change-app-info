#!/usr/bin/env node

/**
 * Fix red/white flash after splash screen on Android
 * 
 * Problem: After splash screen hides, there's a brief flash of red/white color
 * before webview content loads.
 * 
 * Root causes:
 * 1. MainActivity window background not set
 * 2. Webview initial background doesn't match splash
 * 3. Theme colors not fully synchronized
 * 
 * Solution:
 * 1. Set MainActivity window background in onCreate
 * 2. Set WebView background before it loads
 * 3. Ensure all theme colors match
 * 4. Set android:windowBackground in manifest
 * 
 * Runs at: before_compile (after prepare, before build)
 */

const fs = require('fs');
const path = require('path');
const { getConfigParser, normalizeHexColor } = require('../utils');

function colorResourceRegex(colorName) {
  return new RegExp(`\\s*<color\\s+name=["']${colorName}["'][^>]*>[^<]*<\\/color>\\s*`, 'g');
}

function hasColorResource(content, colorName) {
  return new RegExp(`<color\\s+name=["']${colorName}["']`, 'i').test(content);
}

function setOrAddColorResource(content, colorName, colorValue) {
  const updateRegex = new RegExp(`(<color\\s+name=["']${colorName}["'][^>]*>)([^<]*)(<\\/color>)`, 'i');
  if (updateRegex.test(content)) {
    return content.replace(updateRegex, `$1${colorValue}$3`);
  }

  return content.replace(
    '</resources>',
    `    <color name="${colorName}">${colorValue}</color>\n</resources>`
  );
}

function removeColorResource(content, colorName) {
  return content.replace(colorResourceRegex(colorName), '\n');
}

function dedupeColorResources(root) {
  const resPath = path.join(root, 'platforms/android/app/src/main/res/values');

  if (!fs.existsSync(resPath)) {
    return;
  }

  const files = fs.readdirSync(resPath)
    .filter(file => file.endsWith('.xml'))
    .map(file => path.join(resPath, file));

  const keepPreference = {
    cdv_splashscreen_background_color: ['cdv_colors.xml'],
    cdv_background_color: ['cdv_colors.xml'],
    cdv_splashscreen_background: ['cdv_colors.xml'],
    splash_background: ['colors.xml'],
    webview_background: ['colors.xml']
  };

  for (const [colorName, preferredFiles] of Object.entries(keepPreference)) {
    const owners = files.filter(filePath => {
      const content = fs.readFileSync(filePath, 'utf8');
      return hasColorResource(content, colorName);
    });

    if (owners.length <= 1) {
      continue;
    }

    const keepFile = owners.find(filePath => preferredFiles.includes(path.basename(filePath))) || owners[0];

    for (const filePath of owners) {
      if (filePath === keepFile) {
        continue;
      }

      const originalContent = fs.readFileSync(filePath, 'utf8');
      const updatedContent = removeColorResource(originalContent, colorName);
      if (updatedContent !== originalContent) {
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        console.log(`   ✅ Removed duplicate ${colorName} from ${path.basename(filePath)}`);
      }
    }
  }
}

function getValuesXmlFiles(root) {
  const resPath = path.join(root, 'platforms/android/app/src/main/res/values');

  if (!fs.existsSync(resPath)) {
    return [];
  }

  const priorityFiles = [
    'colors.xml',
    'cdv_colors.xml',
    'themes.xml',
    'styles.xml',
    'cdv_themes.xml'
  ];

  const files = priorityFiles
    .map(file => path.join(resPath, file))
    .filter(filePath => fs.existsSync(filePath));

  const extraFiles = fs.readdirSync(resPath)
    .filter(file => file.endsWith('.xml'))
    .map(file => path.join(resPath, file))
    .filter(filePath => !files.includes(filePath));

  return files.concat(extraFiles);
}

function readColorResource(content, colorName) {
  const regex = new RegExp(`<color\\s+name=["']${colorName}["'][^>]*>([^<]*)<\\/color>`, 'i');
  const match = content.match(regex);
  return match && match[1] ? match[1].trim() : null;
}

function resolveColorValue(root, rawValue, seen = new Set()) {
  if (!rawValue) {
    return null;
  }

  const normalized = normalizeHexColor(rawValue.trim());
  if (normalized) {
    return { color: normalized, source: 'direct color' };
  }

  const colorRef = rawValue.trim().match(/^@color\/(.+)$/);
  if (!colorRef) {
    return null;
  }

  const colorName = colorRef[1];
  if (seen.has(colorName)) {
    return null;
  }
  seen.add(colorName);

  return findGeneratedColorResource(root, colorName, seen);
}

function findGeneratedColorResource(root, colorName, seen = new Set()) {
  for (const filePath of getValuesXmlFiles(root)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const rawValue = readColorResource(content, colorName);
    const resolved = resolveColorValue(root, rawValue, seen);

    if (resolved) {
      return {
        color: resolved.color,
        source: `${path.basename(filePath)}:${colorName}`
      };
    }
  }

  return null;
}

function findThemeWindowBackground(root) {
  const themeFiles = getValuesXmlFiles(root).filter(filePath => {
    const basename = path.basename(filePath);
    return basename.includes('theme') || basename === 'styles.xml';
  });

  for (const filePath of themeFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/<item\s+name=["'](?:android:)?windowBackground["']>([^<]*)<\/item>/i);
    if (!match || !match[1]) {
      continue;
    }

    const resolved = resolveColorValue(root, match[1].trim());
    if (resolved) {
      return {
        color: resolved.color,
        source: `${path.basename(filePath)}:windowBackground`
      };
    }
  }

  return null;
}

function resolveGeneratedBackgroundColor(root) {
  const candidateColorNames = [
    'webview_background',
    'cordova_splash_background',
    'splash_background',
    'cdv_splashscreen_background_color',
    'cdv_background_color',
    'cdv_splashscreen_background'
  ];

  for (const colorName of candidateColorNames) {
    const resolved = findGeneratedColorResource(root, colorName);
    if (resolved) {
      return resolved;
    }
  }

  return findThemeWindowBackground(root);
}

function getConfiguredBackgroundColor(config) {
  return config.getPreference('BackgroundColor', 'android') ||
         config.getPreference('BackgroundColor') ||
         config.getPreference('SplashScreenBackgroundColor', 'android') ||
         config.getPreference('SplashScreenBackgroundColor') ||
         config.getPreference('AndroidWindowSplashScreenBackground', 'android') ||
         config.getPreference('AndroidWindowSplashScreenBackground') ||
         config.getPreference('AndroidWindowSplashScreenBackgroundColor', 'android') ||
         config.getPreference('AndroidWindowSplashScreenBackgroundColor') ||
         config.getPreference('WEBVIEW_BACKGROUND_COLOR', 'android') ||
         config.getPreference('WEBVIEW_BACKGROUND_COLOR');
}

/**
 * Find MainActivity.java in the project
 */
function findMainActivity(baseDir) {
  console.log(`   🔍 Searching for MainActivity.java in: ${baseDir}`);
  
  function searchDir(dir, depth = 0) {
    if (depth > 5) return null;
    
    try {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          const found = searchDir(fullPath, depth + 1);
          if (found) return found;
        } else if (file === 'MainActivity.java') {
          console.log(`   ✅ Found MainActivity.java at: ${fullPath}`);
          return fullPath;
        }
      }
    } catch (err) {
      console.log(`   ⚠️  Error searching directory ${dir}: ${err.message}`);
    }
    
    return null;
  }
  
  return searchDir(baseDir);
}

/**
 * Inject background color into MainActivity
 */
function injectMainActivityBackground(mainActivityPath, backgroundColor) {
  if (!fs.existsSync(mainActivityPath)) {
    console.log('   ⚠️  MainActivity.java not found');
    return false;
  }
  
  console.log(`   📄 Reading MainActivity from: ${mainActivityPath}`);
  let content = fs.readFileSync(mainActivityPath, 'utf8');
  
  // Check if already injected
  if (content.includes('// FIX_RED_FLASH')) {
    console.log('   ✓ MainActivity already patched');
    console.log(`   📍 MainActivity path: ${mainActivityPath}`);
    return true;
  }
  
  // Add imports if needed - FIXED: Add both Color and ColorDrawable
  const importsToAdd = [
    'import android.graphics.Color;',
    'import android.graphics.drawable.ColorDrawable;'
  ];
  
  let needsImport = false;
  for (const importStatement of importsToAdd) {
    if (!content.includes(importStatement)) {
      needsImport = true;
      break;
    }
  }
  
  if (needsImport) {
    console.log('   📦 Adding Color and ColorDrawable imports...');
    // Find package statement and add imports after it
    const packageRegex = /(package [^;]+;)/;
    if (packageRegex.test(content)) {
      content = content.replace(
        packageRegex,
        `$1\n\nimport android.graphics.Color;\nimport android.graphics.drawable.ColorDrawable;`
      );
    }
  }
  
  // Find onCreate and inject background color
  const onCreateRegex = /(@Override\s+public void onCreate\(Bundle savedInstanceState\)\s*\{[^}]*super\.onCreate\(savedInstanceState\);)/;
  
  if (onCreateRegex.test(content)) {
    console.log('   🎯 Found onCreate method, injecting background color...');
    content = content.replace(
      onCreateRegex,
      `$1\n\n        // FIX_RED_FLASH: Set window background to prevent flash\n        try {\n            int bgColor = Color.parseColor("${backgroundColor}");\n            getWindow().setBackgroundDrawable(new ColorDrawable(bgColor));\n            getWindow().getDecorView().setBackgroundColor(bgColor);\n        } catch (Exception e) {\n            android.util.Log.e("FixRedFlash", "Failed to set background: " + e.getMessage());\n        }`
    );
    
    fs.writeFileSync(mainActivityPath, content, 'utf8');
    console.log(`   ✅ MainActivity patched with background: ${backgroundColor}`);
    console.log(`   📍 MainActivity path: ${mainActivityPath}`);
    console.log(`   📝 Content written (${content.length} chars)`);
    
    // Print first 500 chars of the modified onCreate section for verification
    const onCreateMatch = content.match(/public void onCreate[\s\S]{0,800}/);
    if (onCreateMatch) {
      console.log('   📋 Modified onCreate section (preview):');
      console.log('   ┌────────────────────────────────────────');
      onCreateMatch[0].split('\n').forEach(line => {
        console.log(`   │ ${line}`);
      });
      console.log('   └────────────────────────────────────────');
    }
    
    return true;
  }
  
  console.log('   ⚠️  Could not find onCreate method');
  console.log('   📋 MainActivity content (first 1000 chars):');
  console.log(content.substring(0, 1000));
  return false;
}

/**
 * Update AndroidManifest.xml to set window background
 */
function updateManifestBackground(manifestPath, backgroundColor) {
  if (!fs.existsSync(manifestPath)) {
    console.log('   ⚠️  AndroidManifest.xml not found');
    return false;
  }
  
  let content = fs.readFileSync(manifestPath, 'utf8');
  
  // Check if already has windowBackground
  if (content.includes('android:windowBackground')) {
    console.log('   ✓ Manifest already has windowBackground');
    return true;
  }
  
  // Add windowBackground to application theme
  const applicationRegex = /(<application[^>]*android:theme="[^"]*"[^>]*)>/;
  
  if (applicationRegex.test(content)) {
    // Theme is set, we'll modify it via styles.xml instead
    console.log('   ℹ️  Application uses theme (will be set via styles)');
    return true;
  }
  
  return false;
}

/**
 * Ensure all color files have matching background
 */
function syncAllColorFiles(root, backgroundColor) {
  const resPath = path.join(root, 'platforms/android/app/src/main/res/values');
  
  if (!fs.existsSync(resPath)) {
    return;
  }
  
  // Update cdv_colors.xml
  const cdvColorsPath = path.join(resPath, 'cdv_colors.xml');
  if (fs.existsSync(cdvColorsPath)) {
    let content = fs.readFileSync(cdvColorsPath, 'utf8');
    
    // Keep Cordova cdv_* colors in cdv_colors.xml only.
    const colorNames = [
      'cdv_splashscreen_background_color',
      'cdv_background_color'
    ];
    
    let modified = false;
    for (const colorName of colorNames) {
      const oldContent = content;
      content = setOrAddColorResource(content, colorName, backgroundColor);
      if (oldContent !== content) modified = true;
    }

    for (const legacyColorName of ['splash_background', 'webview_background']) {
      if (hasColorResource(content, legacyColorName)) {
        content = removeColorResource(content, legacyColorName);
        modified = true;
      }
    }
    
    if (modified) {
      fs.writeFileSync(cdvColorsPath, content, 'utf8');
      console.log('   ✅ Synchronized cdv color definitions');
    }
  }
  
  // Update colors.xml (legacy)
  const colorsPath = path.join(resPath, 'colors.xml');
  if (fs.existsSync(colorsPath)) {
    let content = fs.readFileSync(colorsPath, 'utf8');
    
    const colorNames = [
      'splash_background',
      'webview_background'
    ];
    
    let modified = false;
    for (const colorName of colorNames) {
      const oldContent = content;
      content = setOrAddColorResource(content, colorName, backgroundColor);
      if (oldContent !== content) modified = true;
    }
    
    if (modified) {
      fs.writeFileSync(colorsPath, content, 'utf8');
    }
  }
}

/**
 * Update all theme files to use the background color
 */
function updateThemeFiles(root, backgroundColor) {
  const resPath = path.join(root, 'platforms/android/app/src/main/res/values');
  
  if (!fs.existsSync(resPath)) {
    return;
  }
  
  const themeFiles = ['cdv_themes.xml', 'themes.xml', 'styles.xml'];
  
  for (const themeFile of themeFiles) {
    const themePath = path.join(resPath, themeFile);
    
    if (fs.existsSync(themePath)) {
      let content = fs.readFileSync(themePath, 'utf8');
      let modified = false;
      
      const colorReference = themeFile === 'cdv_themes.xml'
        ? '@color/cdv_splashscreen_background_color'
        : '@color/splash_background';

      // Update all windowBackground references
      const patterns = [
        /<item name="android:windowBackground">([^<]*)<\/item>/g,
        /<item name="windowBackground">([^<]*)<\/item>/g
      ];
      
      for (const pattern of patterns) {
        const oldContent = content;
        content = content.replace(
          pattern,
          `<item name="android:windowBackground">${colorReference}</item>`
        );
        if (oldContent !== content) modified = true;
      }
      
      if (modified) {
        fs.writeFileSync(themePath, content, 'utf8');
        console.log(`   ✅ Updated ${themeFile}`);
      }
    }
  }
}

/**
 * Main fix function
 */
function fixRedFlash(context) {
  const root = context.opts.projectRoot;
  const config = getConfigParser(context, path.join(root, 'config.xml'));
  
  let backgroundColor = getConfiguredBackgroundColor(config);
  let backgroundSource = 'config.xml';
  
  if (!backgroundColor) {
    const generatedBackground = resolveGeneratedBackgroundColor(root);
    if (!generatedBackground) {
      console.log('\n⚠️  No configured or generated background color found, skipping red flash fix');
      return;
    }

    backgroundColor = generatedBackground.color;
    backgroundSource = `generated Android resource (${generatedBackground.source})`;
  }
  
  backgroundColor = normalizeHexColor(backgroundColor);

  if (!backgroundColor) {
    console.log('\n⚠️  Invalid background color, skipping red flash fix');
    return;
  }
  
  console.log('\n══════════════════════════════════════════════');
  console.log('  🔧 FIX RED FLASH AFTER SPLASH SCREEN');
  console.log('══════════════════════════════════════════════');
  console.log(`🎨 Background color: ${backgroundColor}`);
  console.log(`📌 Source: ${backgroundSource}`);
  console.log(`📂 Project root: ${root}`);
  
  // 1. Inject MainActivity background
  console.log('\n🔧 Step 1: Patch MainActivity.java');
  const mainActivityPath = findMainActivity(
    path.join(root, 'platforms/android/app/src/main/java')
  );
  
  if (mainActivityPath) {
    injectMainActivityBackground(mainActivityPath, backgroundColor);
  } else {
    console.log('   ⚠️  MainActivity.java not found');
    console.log('   📂 Searched in: ' + path.join(root, 'platforms/android/app/src/main/java'));
  }
  
  // 2. Sync all color files
  console.log('\n🎨 Step 2: Synchronize color files');
  syncAllColorFiles(root, backgroundColor);
  dedupeColorResources(root);
  
  // 3. Update theme files
  console.log('\n🎨 Step 3: Update theme files');
  updateThemeFiles(root, backgroundColor);
  
  // 4. Update manifest
  console.log('\n📝 Step 4: Check AndroidManifest.xml');
  const manifestPath = path.join(
    root,
    'platforms/android/app/src/main/AndroidManifest.xml'
  );
  updateManifestBackground(manifestPath, backgroundColor);
  
  console.log('\n══════════════════════════════════════════════');
  console.log('✅ Red flash fix completed!');
  console.log('══════════════════════════════════════════════\n');
}

module.exports = function(context) {
  const platforms = context.opts.platforms;
  
  // Only run for Android
  if (!platforms || !platforms.includes('android')) {
    return;
  }
  
  fixRedFlash(context);
};
