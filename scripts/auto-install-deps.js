#!/usr/bin/env node

/**
 * Auto-Install Dependencies Script
 * 
 * This script automatically installs optional dependencies if not already present:
 * - sharp (recommended for fast icon generation)
 * - jimp (fallback icon processor)
 * 
 * IMPORTANT: This script runs in cloud environments (MABS) where native modules
 * like sqlite3 may fail to compile. This is GRACEFULLY HANDLED.
 * 
 * NOTE: Removed sqlite3 support - now using JSON config storage instead
 * 
 * Runs at: pre-build stage (before_prepare hook)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Color codes for console output
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

function checkPackageInstalled(packageName) {
  try {
    require.resolve(packageName);
    return true;
  } catch (e) {
    return false;
  }
}

function getInstalledVersion(packageName) {
  try {
    const packageJson = require(path.join(process.cwd(), 'node_modules', packageName, 'package.json'));
    return packageJson.version;
  } catch (e) {
    return null;
  }
}

function installPackage(packageName, version = '') {
  const versionStr = version ? `@${version}` : '';
  const installCmd = `npm install ${packageName}${versionStr} --no-save --ignore-scripts`;
  
  try {
    log(colors.blue, `  ⏳ Installing ${packageName}...`);
    execSync(installCmd, { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

function main() {
  const projectRoot = process.cwd();
  const packageJsonPath = path.join(projectRoot, 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    log(colors.yellow, '⚠️  No package.json found. Skipping auto-install.');
    return;
  }
  
  log(colors.bright + colors.blue, '\n╔════════════════════════════════════════════════════════════╗');
  log(colors.bright + colors.blue, '║   Auto-Install Dependencies (cordova-plugin-change-app-info) ║');
  log(colors.bright + colors.blue, '╚════════════════════════════════════════════════════════════╝\n');
  
  // Dependencies to check
  const dependencies = [
    {
      name: 'sharp',
      version: '^0.33.0',
      type: 'OPTIONAL',
      description: 'Fast icon generation (recommended)',
      required: false
    },
    {
      name: 'jimp',
      version: '^1.6.1',
      type: 'OPTIONAL',
      description: 'Fallback icon processor (if sharp fails)',
      required: false
    }
  ];
  
  let installed = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const dep of dependencies) {
    const isInstalled = checkPackageInstalled(dep.name);
    const installedVersion = getInstalledVersion(dep.name);
    
    log(colors.reset, `\n📦 ${dep.name}`);
    log(colors.reset, `   Type: ${dep.type} - ${dep.description}`);
    
    if (isInstalled) {
      log(colors.green, `   ✅ Already installed (v${installedVersion})`);
      skipped++;
    } else {
      log(colors.yellow, `   ⚠️  Not found. Attempting to install...`);
      
      const success = installPackage(dep.name, dep.version);
      if (success) {
        const version = getInstalledVersion(dep.name);
        log(colors.green, `   ✅ Successfully installed (v${version})`);
        installed++;
      } else {
        if (dep.required) {
          log(colors.red, `   ❌ Installation failed`);
          log(colors.red, `   ⚠️  WARNING: This is REQUIRED for the build to succeed!`);
          failed++;
        } else {
          log(colors.yellow, `   ⚠️  Installation failed (optional, continuing)`);
          skipped++;
        }
      }
    }
  }
  
  // Summary
  log(colors.reset, '\n' + '═'.repeat(60));
  log(colors.bright + colors.blue, 'Summary:');
  log(colors.green, `  ✅ Already installed: ${skipped}`);
  log(colors.green, `  ✨ Newly installed: ${installed}`);
  if (failed > 0) {
    log(colors.red, `  ❌ Failed: ${failed}`);
  }
  log(colors.reset, '═'.repeat(60));
  
  if (failed > 0) {
    log(colors.red, `\n❌ FATAL: Some REQUIRED dependencies failed!`);
    log(colors.red, `   Please ensure required packages are installed locally.\n`);
    process.exit(1);
  } else {
    log(colors.green, `\n✅ Build setup complete!\n`);
  }
}

// Run
main();
