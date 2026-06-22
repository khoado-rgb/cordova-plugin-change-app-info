#!/usr/bin/env node

/**
 * Remove strings.xml to avoid conflict with cdv_strings.xml
 * 
 * Problem: Both cdv_strings.xml and strings.xml may define app_name
 * Solution: Remove only duplicate app_name from strings.xml
 * 
 * This hook runs in after_prepare (before compilation)
 */

const fs = require('fs');
const path = require('path');

module.exports = function(context) {
  const platforms = context.opts.platforms;
  const root = context.opts.projectRoot;

  console.log('\n══════════════════════════════════════════════');
  console.log('  REMOVE CONFLICTING STRINGS.XML');
  console.log('══════════════════════════════════════════════');
  console.log('🎯 Purpose: Prevent duplicate app_name resource');
  console.log('📋 Strategy: Keep strings.xml and remove only duplicate app_name\n');

  for (const platform of platforms) {
    if (platform !== 'android') {
      continue;
    }

    console.log('🤖 Processing Android...');

    const stringsPath = path.join(
      root,
      'platforms/android/app/src/main/res/values/strings.xml'
    );

    const cdvStringsPath = path.join(
      root,
      'platforms/android/app/src/main/res/values/cdv_strings.xml'
    );

    // Check if both files exist (conflict situation)
    const hasStrings = fs.existsSync(stringsPath);
    const hasCdvStrings = fs.existsSync(cdvStringsPath);

    console.log(`   📁 cdv_strings.xml: ${hasCdvStrings ? '✓ EXISTS' : '✗ NOT FOUND'}`);
    console.log(`   📁 strings.xml: ${hasStrings ? '⚠️  EXISTS (will inspect)' : '✓ NOT FOUND (good)'}`);

    if (hasCdvStrings && hasStrings) {
      // Conflict detected - remove only the duplicate string entry.
      try {
        // Check if strings.xml has app_name
        const stringsContent = fs.readFileSync(stringsPath, 'utf8');
        const appNamePattern = /\s*<string\s+name=["']app_name["'][^>]*>[\s\S]*?<\/string>\s*/;
        const hasAppName = appNamePattern.test(stringsContent);

        if (hasAppName) {
          console.log('   🚨 CONFLICT DETECTED: Both files define app_name');
          console.log('   ✂️  Removing app_name from strings.xml...');
          const updatedContent = stringsContent.replace(appNamePattern, '\n');
          fs.writeFileSync(stringsPath, updatedContent, 'utf8');
          console.log('   ✅ app_name removed from strings.xml');
          console.log('   ℹ️  Other string resources were preserved');
        } else {
          console.log('   ℹ️  strings.xml exists but no app_name conflict');
        }
      } catch (err) {
        console.error('   ❌ Failed to remove strings.xml:', err.message);
      }
    } else if (!hasCdvStrings && !hasStrings) {
      console.log('   ⚠️  Neither file exists - Cordova will use config.xml name');
    } else {
      console.log('   ✅ No conflict detected');
    }
  }

  console.log('\n══════════════════════════════════════════════');
  console.log('✅ Conflict check completed!');
  console.log('══════════════════════════════════════════════\n');
};
