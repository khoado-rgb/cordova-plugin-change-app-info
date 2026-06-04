#!/usr/bin/env node

/**
 * Hook for customizing the pre-render WebView background color.
 * Useful for OutSystems apps that need a splash-screen color transition.
 */

const fs = require('fs');
const path = require('path');
const { getConfigParser, hexToObjCUIColor, validateHexColor, findMainActivity } = require('./utils');

function customizeAndroidWebview(context, backgroundColor) {
  const root = context.opts.projectRoot;
  const mainActivityPath = path.join(
    root,
    'platforms/android/app/src/main/java/io/outsystems/android/MainActivity.java'
  );
  
  // If the OutSystems MainActivity is not found, try the default path.
  let activityPath = mainActivityPath;
  if (!fs.existsSync(activityPath)) {
    // Find MainActivity.java inside the generated project.
    const appPath = path.join(root, 'platforms/android/app/src/main/java');
    activityPath = findMainActivity(appPath);
  }
  
  if (!activityPath || !fs.existsSync(activityPath)) {
    console.log('   ⚠️  MainActivity.java not found, skipping webview customization');
    return;
  }
  
  let content = fs.readFileSync(activityPath, 'utf8');
  
  // Check whether customization was already applied.
  if (content.includes('// CUSTOM_WEBVIEW_BACKGROUND')) {
    console.log('   ✓ Webview already customized');
    return;
  }
  
  // Add imports when missing.
  if (!content.includes('import android.graphics.Color;')) {
    content = content.replace(
      /(package [^;]+;)/,
      '$1\n\nimport android.graphics.Color;'
    );
  }
  
  // Normalize hex color (remove alpha if 8 digits)
  let normalizedColor = backgroundColor.replace('#', '');
  if (normalizedColor.length === 8) {
    // Remove alpha channel (first 2 digits) for UI color
    normalizedColor = '#' + normalizedColor.substring(2);
  } else {
    normalizedColor = '#' + normalizedColor;
  }
  
  // Find onCreate and insert the background setup code.
  const onCreateRegex = /(@Override\s+public void onCreate\(Bundle savedInstanceState\)\s*{[^}]*super\.onCreate\(savedInstanceState\);)/;
  
  if (onCreateRegex.test(content)) {
    content = content.replace(
      onCreateRegex,
      `$1\n\n        // CUSTOM_WEBVIEW_BACKGROUND\n        // Set window and webview background color to prevent white flash\n        try {\n            int bgColor = Color.parseColor("${normalizedColor}");\n            getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(bgColor));\n            getWindow().getDecorView().setBackgroundColor(bgColor);\n        } catch (Exception e) {\n            android.util.Log.e("WebviewCustomize", "Failed to set background color: " + e.getMessage());\n        }`
    );
    
    fs.writeFileSync(activityPath, content, 'utf8');
    console.log(`   ✓ Android window background set to ${normalizedColor}`);
  } else {
    console.log('   ⚠️  onCreate method not found in MainActivity');
  }
}

function customizeIOSWebview(context, backgroundColor) {
  const root = context.opts.projectRoot;
  const config = getConfigParser(context, path.join(root, 'config.xml'));
  const projectName = config.name();
  
  // Find AppDelegate.m.
  const appDelegatePath = path.join(
    root,
    `platforms/ios/${projectName}/Classes/AppDelegate.m`
  );
  
  if (!fs.existsSync(appDelegatePath)) {
    console.log('   ⚠️  AppDelegate.m not found, skipping webview customization');
    return;
  }
  
  let content = fs.readFileSync(appDelegatePath, 'utf8');
  
  // Check whether customization was already applied.
  if (content.includes('// CUSTOM_WEBVIEW_BACKGROUND')) {
    console.log('   ✓ Webview already customized');
    return;
  }
  
  // Normalize hex color (remove alpha if 8 digits)
  let normalizedColor = backgroundColor.replace('#', '');
  if (normalizedColor.length === 8) {
    normalizedColor = '#' + normalizedColor.substring(2);
  } else {
    normalizedColor = '#' + normalizedColor;
  }
  
  // Convert hex color to UIColor
  const uiColor = hexToObjCUIColor(normalizedColor);
  
  // Find application:didFinishLaunchingWithOptions and insert the background setup code.
  const didFinishRegex = /(- \(BOOL\)application:\(UIApplication\*\)application didFinishLaunchingWithOptions:[^{]*{[^}]*self\.window = \[\[UIWindow alloc\] initWithFrame:\[UIScreen mainScreen\]\.bounds\];)/;
  
  if (didFinishRegex.test(content)) {
    content = content.replace(
      didFinishRegex,
      `$1\n\n    // CUSTOM_WEBVIEW_BACKGROUND\n    // Set webview background color\n    self.window.backgroundColor = ${uiColor};`
    );
    
    fs.writeFileSync(appDelegatePath, content, 'utf8');
    console.log(`   ✓ iOS webview background set to ${normalizedColor}`);
  } else {
    console.log('   ⚠️  didFinishLaunchingWithOptions method not found');
  }
}

module.exports = function(context) {
  const platforms = context.opts.platforms;
  const root = context.opts.projectRoot;
  const config = getConfigParser(context, path.join(root, 'config.xml'));
  
  // Read the background color from config.
  let backgroundColor = config.getPreference('WEBVIEW_BACKGROUND_COLOR');
  
  if (!backgroundColor) {
    console.log('\n📱 WEBVIEW_BACKGROUND_COLOR not configured, skipping customization');
    return;
  }
  
  // Validate color format
  if (!validateHexColor(backgroundColor)) {
    console.error('\n❌ Invalid WEBVIEW_BACKGROUND_COLOR format. Use hex color (e.g., #FFFFFF or #FFFFFFFF)');
    return;
  }
  
  // Ensure # prefix
  if (!backgroundColor.startsWith('#')) {
    backgroundColor = '#' + backgroundColor;
  }
  
  console.log('\n══════════════════════════════════════════════');
  console.log('  CUSTOMIZE WEBVIEW BACKGROUND COLOR         ');
  console.log('══════════════════════════════════════════════');
  console.log(`Color: ${backgroundColor}`);
  
  for (const platform of platforms) {
    console.log(`\n📱 Processing ${platform}...`);
    
    try {
      if (platform === 'android') {
        customizeAndroidWebview(context, backgroundColor);
      } else if (platform === 'ios') {
        customizeIOSWebview(context, backgroundColor);
      }
    } catch (error) {
      console.error(`\n❌ Error customizing ${platform}:`, error.message);
    }
  }
  
  console.log('\n══════════════════════════════════════════════');
  console.log('✅ Webview customization completed!');
  console.log('══════════════════════════════════════════════\n');
};
