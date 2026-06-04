#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('\n🔧 Installing cordova-plugin-change-app-info dependencies...\n');

try {
  // Check if running in plugin directory
  const pluginRoot = path.resolve(__dirname, '..');
  const packageJsonPath = path.join(pluginRoot, 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.log('⚠ Not in plugin directory, skipping dependency installation');
    process.exit(0);
  }

  // Install dependencies
  console.log('📦 Installing sharp, node-fetch, and xcode...');
  
  try {
    execSync('npm install --no-save sharp node-fetch@2 xcode', {
      cwd: pluginRoot,
      stdio: 'inherit'
    });
    console.log('✅ Dependencies installed successfully!\n');
  } catch (err) {
    console.warn('⚠ Failed to install dependencies automatically.');
    console.warn('Please run manually: cd plugins/cordova-plugin-change-app-info && npm install\n');
  }
  
} catch (err) {
  console.error('✖ Postinstall error:', err.message);
  // Don't fail the installation
  process.exit(0);
}