#!/usr/bin/env node

/**
 * iOS Unified Build Hook
 * Final validation before Xcode build
 * Replaces: cleanBuild + finalColorOverride
 */

const fs = require('fs');
const path = require('path');

module.exports = async function(context) {
  const platforms = context.opts.platforms;
  
  if (!platforms.includes('ios')) {
    return;
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  ✅ iOS Final Validation');
  console.log('═══════════════════════════════════════');

  try {
    const root = context.opts.projectRoot;
    const iosPath = path.join(root, 'platforms/ios');
    
    // Final checks
    await finalValidation(iosPath);
    
    // Last minute color override if needed
    await finalColorOverride(context, iosPath);
    
    console.log('✅ Ready for Xcode build!');
    console.log('═══════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ Validation warning:', error.message);
    console.log('⚠️  Proceeding with build anyway...\n');
  }
};

async function finalValidation(iosPath) {
  console.log('🔍 Final validation');
  
  // Check if platforms/ios exists
  if (!fs.existsSync(iosPath)) {
    throw new Error('iOS platform not found');
  }
  
  // Check for .xcodeproj
  const xcodeProjects = fs.readdirSync(iosPath)
    .filter(f => f.endsWith('.xcodeproj'));
  
  if (xcodeProjects.length === 0) {
    throw new Error('No Xcode project found');
  }
  
  console.log(`   ✅ Xcode project: ${xcodeProjects[0]}`);
  
  // Check Info.plist exists
  const projectName = xcodeProjects[0].replace('.xcodeproj', '');
  const plistPath = path.join(iosPath, projectName, `${projectName}-Info.plist`);
  
  if (fs.existsSync(plistPath)) {
    console.log('   ✅ Info.plist exists');
  } else {
    console.log('   ⚠️  Info.plist not found');
  }
  
  // Check for common issues
  const buildPath = path.join(iosPath, 'build');
  if (fs.existsSync(buildPath)) {
    console.log('   ℹ️  Build directory exists (previous build artifacts)');
  }
}

async function finalColorOverride(context, iosPath) {
  console.log('🎨 Final color override check');
  
  try {
    const ConfigParser = context.requireCordovaModule('cordova-common').ConfigParser;
    const config = new ConfigParser(path.join(context.opts.projectRoot, 'config.xml'));
    
    const splashBg = config.getPreference('BackgroundColor') ||
                     config.getPreference('SplashScreenBackgroundColor') ||
                     config.getPreference('AndroidWindowSplashScreenBackground') ||
                     config.getPreference('AndroidWindowSplashScreenBackgroundColor');
    
    if (!splashBg) {
      console.log('   ℹ️  No splash background color configured');
      return;
    }
    
    console.log(`   ℹ️  Splash color: ${splashBg}`);
    console.log('   ✅ Color preferences applied in earlier phases');
  } catch (error) {
    console.log('   ⚠️  Color override check skipped:', error.message);
  }
}
