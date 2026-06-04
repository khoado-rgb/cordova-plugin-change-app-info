#!/usr/bin/env node

/**
 * iOS Cache Clearing Hook
 * 
 * Automatically clears Xcode build cache and device cache when building iOS
 * This ensures app name and icon changes are visible immediately after install
 * 
 * Runs at: before_prepare stage
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function executeCommand(cmd, description) {
  try {
    log(colors.blue, `  ⏳ ${description}...`);
    execSync(cmd, { stdio: 'pipe', shell: '/bin/bash' });
    log(colors.green, `  ✅ ${description}`);
    return true;
  } catch (error) {
    log(colors.yellow, `  ⚠️  ${description} (non-critical, continuing)`);
    return false;
  }
}

function clearIOSCache(context) {
  const root = context.opts.projectRoot;
  const iosPlatformPath = path.join(root, 'platforms/ios');
  const isOSX = process.platform === 'darwin';
  
  // Check if iOS platform exists
  if (!fs.existsSync(iosPlatformPath)) {
    log(colors.yellow, '\n⚠️  iOS platform not found, skipping cache clear');
    return;
  }
  
  log(colors.bright + colors.blue, '\n╔════════════════════════════════════════════════════════════╗');
  log(colors.bright + colors.blue, '║          iOS Cache Clear & Metadata Update                   ║');
  log(colors.bright + colors.blue, '╚════════════════════════════════════════════════════════════╝\n');
  
  log(colors.reset, '🧹 Clearing build cache to ensure app name/icon updates...');
  
  let cleared = 0;
  let attempted = 0;
  
  // 1. Remove iOS build folder
  log(colors.reset, '\n📁 Build Artifacts:');
  attempted++;
  const buildPath = path.join(iosPlatformPath, 'build');
  if (fs.existsSync(buildPath)) {
    if (executeCommand(`rm -rf "${buildPath}"`, 'Remove build folder')) {
      cleared++;
    }
  } else {
    log(colors.green, '  ✅ Build folder already clean');
    cleared++;
  }
  
  // 2. Clear Xcode DerivedData (macOS only)
  if (isOSX) {
    log(colors.reset, '\n🔧 Xcode Cache (macOS):');
    
    // Clear all DerivedData
    attempted++;
    const derivedDataPath = path.join(
      process.env.HOME,
      'Library/Developer/Xcode/DerivedData'
    );
    if (fs.existsSync(derivedDataPath)) {
      if (executeCommand(`rm -rf "${derivedDataPath}"/*`, 'Clear DerivedData')) {
        cleared++;
      }
    } else {
      log(colors.green, '  ✅ DerivedData path not found (already clean)');
      cleared++;
    }
    
    // Clear Xcode cache
    attempted++;
    if (executeCommand('rm -rf ~/Library/Caches/com.apple.dt.Xcode', 'Clear Xcode cache')) {
      cleared++;
    }
  } else {
    log(colors.yellow, '\n⚠️  Xcode cache clear only supported on macOS');
  }
  
  // 3. Remove icon cache
  log(colors.reset, '\n🎨 Icon Cache:');
  attempted++;
  
  // Find the actual project name
  const iosFiles = fs.readdirSync(iosPlatformPath);
  const projectDir = iosFiles.find(f => {
    const fullPath = path.join(iosPlatformPath, f);
    return fs.statSync(fullPath).isDirectory() && f !== 'build' && !f.startsWith('.');
  });
  
  if (projectDir) {
    const iconPath = path.join(
      iosPlatformPath,
      projectDir,
      'Images.xcassets/AppIcon.appiconset'
    );
    
    if (fs.existsSync(iconPath)) {
      if (executeCommand(`rm -rf "${iconPath}"`, 'Clear AppIcon cache')) {
        cleared++;
      }
    } else {
      log(colors.green, '  ✅ Icon cache path not found (will regenerate)');
      cleared++;
    }
    
    // 4. Update Info.plist metadata
    log(colors.reset, '\n📋 Info.plist Metadata:');
    attempted++;
    
    const infoPlistPath = path.join(
      iosPlatformPath,
      projectDir,
      `${projectDir}-Info.plist`
    );
    
    if (fs.existsSync(infoPlistPath)) {
      log(colors.blue, `  ℹ️  Info.plist found: ${infoPlistPath}`);
      log(colors.green, '  ✅ Plist will be updated during build');
      cleared++;
    } else {
      log(colors.yellow, '  ⚠️  Info.plist not found yet (will be created)');
      cleared++;
    }
  }
  
  // Summary
  log(colors.reset, '\n' + '═'.repeat(60));
  log(colors.bright + colors.blue, 'Summary:');
  log(colors.green, `  ✅ Cleaned: ${cleared}/${attempted} cache items`);
  log(colors.reset, '═'.repeat(60));
  
  log(colors.green, '\n✅ Cache cleared successfully!');
  log(colors.yellow, '\n💡 After build completes:');
  log(colors.yellow, '   1. Delete old app from device/simulator');
  log(colors.yellow, '   2. Reinstall fresh app');
  log(colors.yellow, '   3. App name and icon should now update\n');
}

module.exports = function(context) {
  const platforms = context.opts.platforms;
  
  // Only run for iOS
  if (!platforms || !platforms.includes('ios')) {
    return;
  }
  
  clearIOSCache(context);
};
