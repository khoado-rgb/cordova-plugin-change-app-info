#!/usr/bin/env node

/**
 * Cleanup Script - Remove Old iOS Hooks
 * 
 * This script removes old iOS hook files that are no longer needed
 * after the optimization to unified hooks.
 * 
 * Run this after merging the optimization PR.
 */

const fs = require('fs');
const path = require('path');

const hooksDir = path.join(__dirname, '..', 'hooks');

// Old iOS hooks to remove
const oldIOSHooks = [
  'cleanBuild.js',
  'forceOverrideSplashColor.js',
  'forceOverrideNativeColors.js',
  'scanAndReplaceColor.js',
  'forceReplaceIosIcons.js',
  'finalColorOverride.js',
  'injectIOSBackgroundFix.js'
];

// Hooks used by both platforms (keep these)
const sharedHooks = [
  'backupAppInfo.js',
  'changeAppInfo.js',
  'generateIcons.js',
  'injectBuildInfo.js',
  'customizeSplashScreen.js',
  'customizeWebview.js',
  'sendBuildSuccess.js',
  'utils.js',
  'replaceAssetsFromCdn.js'
];

console.log('\n═══════════════════════════════════════');
console.log('  🧹 Cleaning Up Old iOS Hooks');
console.log('═══════════════════════════════════════\n');

let removed = 0;
let kept = 0;
let notFound = 0;

oldIOSHooks.forEach(hookFile => {
  const hookPath = path.join(hooksDir, hookFile);
  
  if (fs.existsSync(hookPath)) {
    try {
      // Check file size before removing
      const stats = fs.statSync(hookPath);
      const sizeMB = (stats.size / 1024).toFixed(2);
      
      fs.unlinkSync(hookPath);
      console.log(`✅ Removed: ${hookFile} (${sizeMB} KB)`);
      removed++;
    } catch (error) {
      console.log(`❌ Failed to remove ${hookFile}: ${error.message}`);
    }
  } else {
    console.log(`ℹ️  Not found: ${hookFile}`);
    notFound++;
  }
});

console.log('\n═══════════════════════════════════════');
console.log(`📊 Summary:`);
console.log(`   • Removed: ${removed} files`);
console.log(`   • Not found: ${notFound} files`);
console.log(`   • Kept (shared): ${sharedHooks.length} files`);
console.log('═══════════════════════════════════════\n');

// Show kept files
if (removed > 0) {
  console.log('✅ Cleanup completed!');
  console.log('\n📁 Remaining hook files (used by Android):');
  sharedHooks.forEach(hook => {
    const hookPath = path.join(hooksDir, hook);
    if (fs.existsSync(hookPath)) {
      console.log(`   • ${hook}`);
      kept++;
    }
  });
  
  console.log('\n📁 New iOS hooks (unified):');
  console.log('   • hooks/ios/unified-prepare.js');
  console.log('   • hooks/ios/unified-compile.js');
  console.log('   • hooks/ios/unified-build.js');
}

if (removed === 0 && notFound === oldIOSHooks.length) {
  console.log('ℹ️  All files already removed or cleanup already done.');
}

console.log('\n💡 Note: Shared hooks are kept for Android platform compatibility.');
console.log('If you want to create unified Android hooks too, run separate script.\n');
