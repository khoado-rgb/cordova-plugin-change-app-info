#!/usr/bin/env node

/**
 * iOS Unified Prepare Hook - STANDALONE VERSION
 * Fixed: App name, splash screen color (including native pre-splash), and CDN icon generation
 * MABS 12 FIX: Assets.xcassets detection + UIImageName in UILaunchScreen
 * STORYBOARD FIX: Force override ALL background colors (including MABS defaults)
 * CRITICAL CRASH FIX: Use CDVLaunchScreen (already in bundle) instead of creating new one
 * BUILD INFO: JSON-based storage (consistent with Android)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

module.exports = async function(context) {
  const platforms = context.opts.platforms;
  
  if (!platforms.includes('ios')) {
    return;
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  🔧 iOS Unified Prepare Phase (Standalone)');
  console.log('═══════════════════════════════════════');

  try {
    const root = context.opts.projectRoot;
    const iosPath = path.join(root, 'platforms/ios');
    
    await safeBackup(context, iosPath);
    await changeAppInfo(context, iosPath);
    await generateIcons(context, iosPath);
    await injectBuildInfo(context, iosPath);
    await customizeUI(context, iosPath);
    
    console.log('✅ iOS Prepare Phase Complete!');
    console.log('═══════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ Error in iOS Prepare Phase:', error.message);
    console.log('⚠️  Continuing build with partial changes...\n');
  }
};

async function safeBackup(context, iosPath) {
  console.log('📦 Step 1: Safe Backup');
  try {
    const backupPath = path.join(iosPath, '.plugin-backup');
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }
    
    const xcodeProjects = fs.readdirSync(iosPath).filter(f => f.endsWith('.xcodeproj'));
    if (xcodeProjects.length === 0) {
      console.log('   ⚠️  No Xcode project found');
      return;
    }
    
    const projectName = xcodeProjects[0].replace('.xcodeproj', '');
    const plistPath = path.join(iosPath, projectName, `${projectName}-Info.plist`);
    const cdvStoryboardPath = path.join(iosPath, projectName, 'CDVLaunchScreen.storyboard');
    
    if (fs.existsSync(plistPath)) {
      fs.copyFileSync(plistPath, path.join(backupPath, 'Info.plist.backup'));
      console.log('   ✅ Backed up Info.plist');
    }
    
    if (fs.existsSync(cdvStoryboardPath)) {
      fs.copyFileSync(cdvStoryboardPath, path.join(backupPath, 'CDVLaunchScreen.storyboard.backup'));
      console.log('   ✅ Backed up CDVLaunchScreen.storyboard');
    }
  } catch (error) {
    console.log('   ⚠️  Backup failed:', error.message);
  }
}

async function changeAppInfo(context, iosPath) {
  console.log('📝 Step 2: Change App Info');
  
  try {
    const ConfigParser = context.requireCordovaModule('cordova-common').ConfigParser;
    const config = new ConfigParser(path.join(context.opts.projectRoot, 'config.xml'));
    
    const appName = config.getPreference('APP_NAME');
    const versionNumber = config.getPreference('VERSION_NUMBER');
    const versionCode = config.getPreference('VERSION_CODE');
    
    if (!appName && !versionNumber && !versionCode) {
      console.log('   ℹ️  Using config.xml defaults');
      return;
    }
    
    const xcodeProjects = fs.readdirSync(iosPath).filter(f => f.endsWith('.xcodeproj'));
    if (xcodeProjects.length === 0) return;
    
    const projectName = xcodeProjects[0].replace('.xcodeproj', '');
    const plistPath = path.join(iosPath, projectName, `${projectName}-Info.plist`);
    
    if (!fs.existsSync(plistPath)) {
      console.log('   ⚠️  Info.plist not found');
      return;
    }
    
    let plistContent = fs.readFileSync(plistPath, 'utf8');
    let modified = false;
    
    if (appName) {
      if (plistContent.includes('<key>CFBundleDisplayName</key>')) {
        plistContent = plistContent.replace(
          /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/g,
          `$1${appName}$2`
        );
      } else {
        plistContent = plistContent.replace(
          '</dict>\n</plist>',
          `  <key>CFBundleDisplayName</key>\n  <string>${appName}</string>\n</dict>\n</plist>`
        );
      }
      
      if (plistContent.includes('<key>CFBundleName</key>')) {
        plistContent = plistContent.replace(
          /(<key>CFBundleName<\/key>\s*<string>)[^<]*(<\/string>)/g,
          `$1${appName}$2`
        );
      }
      
      console.log(`   ✅ App name: ${appName}`);
      modified = true;
    }
    
    if (versionNumber) {
      plistContent = plistContent.replace(
        /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/g,
        `$1${versionNumber}$2`
        );
      console.log(`   ✅ Version: ${versionNumber}`);
      modified = true;
    }
    
    if (versionCode) {
      plistContent = plistContent.replace(
        /(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/g,
        `$1${versionCode}$2`
      );
      console.log(`   ✅ Build: ${versionCode}`);
      modified = true;
    }
    
    if (modified) {
      fs.writeFileSync(plistPath, plistContent, 'utf8');
    }
  } catch (error) {
    console.log('   ⚠️  Failed:', error.message);
  }
}

async function generateIcons(context, iosPath) {
  console.log('🎨 Step 3: Generate Icons from CDN');
  
  try {
    const ConfigParser = context.requireCordovaModule('cordova-common').ConfigParser;
    const config = new ConfigParser(path.join(context.opts.projectRoot, 'config.xml'));
    const cdnIcon = config.getPreference('CDN_ICON');
    
    if (!cdnIcon) {
      console.log('   ℹ️  No CDN_ICON preference, using existing icons');
      return;
    }
    
    console.log(`   🌐 CDN URL: ${cdnIcon}`);
    
    // Check for image processor
    let sharp, Jimp, processor;
    try {
      sharp = require('sharp');
      processor = 'sharp';
      console.log('   ✅ Using sharp (recommended)');
    } catch (e) {
      try {
        Jimp = require('jimp').Jimp;
        processor = 'jimp';
        console.log('   ✅ Using jimp (fallback)');
      } catch (e2) {
        console.log('   ❌ No image processor available!');
        console.log('   💡 Install one: npm install sharp');
        console.log('   💡 Or fallback: npm install jimp');
        return;
      }
    }
    
    // Download icon
    console.log('   💾 Downloading icon from CDN...');
    let iconBuffer;
    try {
      iconBuffer = await downloadFile(cdnIcon);
      console.log(`   ✅ Downloaded ${(iconBuffer.length / 1024).toFixed(2)} KB`);
    } catch (downloadError) {
      console.log('   ❌ Download failed:', downloadError.message);
      console.log('   💡 Check URL and network connection');
      return;
    }
    
    // Validate buffer
    if (!iconBuffer || iconBuffer.length === 0) {
      console.log('   ❌ Downloaded file is empty');
      return;
    }
    
    const xcodeProjects = fs.readdirSync(iosPath).filter(f => f.endsWith('.xcodeproj'));
    if (xcodeProjects.length === 0) {
      console.log('   ⚠️  No Xcode project found');
      return;
    }
    
    const projectName = xcodeProjects[0].replace('.xcodeproj', '');
    const appPath = path.join(iosPath, projectName);
    
    // Find .xcassets folder - PRIORITIZE Assets.xcassets (MABS 12)
    const xcassetsFolders = fs.readdirSync(appPath)
      .filter(f => {
        const xcassetsPath = path.join(appPath, f);
        return f.endsWith('.xcassets') && fs.statSync(xcassetsPath).isDirectory();
      })
      .sort((a, b) => {
        // Prioritize Assets.xcassets over Images.xcassets
        if (a === 'Assets.xcassets') return -1;
        if (b === 'Assets.xcassets') return 1;
        return 0;
      });
    
    if (xcassetsFolders.length === 0) {
      console.log('   ⚠️  No .xcassets folder found');
      return;
    }
    
    const xcassetsFolder = xcassetsFolders[0];
    const assetsPath = path.join(appPath, xcassetsFolder, 'AppIcon.appiconset');
    console.log(`   📁 Using: ${xcassetsFolder}`);
    
    // Clean old icons first
    if (fs.existsSync(assetsPath)) {
      console.log('   🧹 Cleaning old icon assets...');
      const oldIcons = fs.readdirSync(assetsPath).filter(f => f.endsWith('.png'));
      oldIcons.forEach(icon => {
        try {
          fs.unlinkSync(path.join(assetsPath, icon));
        } catch (e) {}
      });
      console.log(`   ✅ Cleaned ${oldIcons.length} old icon(s)`);
    } else {
      fs.mkdirSync(assetsPath, { recursive: true });
    }
    
    // All iOS icon sizes (including iPad)
    const sizes = [
      // iPhone
      { size: 20, scale: 2, idiom: 'iphone' },
      { size: 20, scale: 3, idiom: 'iphone' },
      { size: 29, scale: 2, idiom: 'iphone' },
      { size: 29, scale: 3, idiom: 'iphone' },
      { size: 40, scale: 2, idiom: 'iphone' },
      { size: 40, scale: 3, idiom: 'iphone' },
      { size: 60, scale: 2, idiom: 'iphone' },
      { size: 60, scale: 3, idiom: 'iphone' },
      // iPad
      { size: 20, scale: 1, idiom: 'ipad' },
      { size: 20, scale: 2, idiom: 'ipad' },
      { size: 29, scale: 1, idiom: 'ipad' },
      { size: 29, scale: 2, idiom: 'ipad' },
      { size: 40, scale: 1, idiom: 'ipad' },
      { size: 40, scale: 2, idiom: 'ipad' },
      { size: 76, scale: 1, idiom: 'ipad' },
      { size: 76, scale: 2, idiom: 'ipad' },
      { size: 83.5, scale: 2, idiom: 'ipad' },
      // App Store
      { size: 1024, scale: 1, idiom: 'ios-marketing' }
    ];
    
    console.log(`   🎨 Generating ${sizes.length} icon sizes...`);
    
    const images = [];
    let successCount = 0;
    
    for (const icon of sizes) {
      const actualSize = Math.floor(icon.size * icon.scale);
      const filename = `icon-${icon.size}@${icon.scale}x.png`;
      const filepath = path.join(assetsPath, filename);
      
      try {
        if (processor === 'sharp') {
          await sharp(iconBuffer)
            .resize(actualSize, actualSize, {
              fit: 'cover',
              position: 'center'
            })
            .png()
            .toFile(filepath);
        } else if (processor === 'jimp') {
          const image = await Jimp.fromBuffer(iconBuffer);
          image.resize({ w: actualSize, h: actualSize });
          await image.write(filepath);
        }
        
        // Verify file was created
        if (fs.existsSync(filepath)) {
          const stats = fs.statSync(filepath);
          if (stats.size > 0) {
            successCount++;
            images.push({
              size: `${icon.size}x${icon.size}`,
              idiom: icon.idiom,
              filename: filename,
              scale: `${icon.scale}x`
            });
          }
        }
      } catch (resizeError) {
        console.log(`   ⚠️  Failed to generate ${actualSize}x${actualSize}:`, resizeError.message);
      }
    }
    
    if (successCount === 0) {
      console.log('   ❌ No icons generated successfully');
      return;
    }
    
    // Write Contents.json
    const contentsJson = {
      images: images,
      info: {
        version: 1,
        author: 'cordova-plugin-change-app-info'
      }
    };
    
    fs.writeFileSync(
      path.join(assetsPath, 'Contents.json'),
      JSON.stringify(contentsJson, null, 2),
      'utf8'
    );
    
    console.log(`   ✅ Generated ${successCount}/${sizes.length} icon sizes`);
    console.log(`   ✅ Updated Contents.json`);
    
  } catch (error) {
    console.log('   ❌ Icon generation failed:', error.message);
  }
}

async function injectBuildInfo(context, iosPath) {
  console.log('💾 Step 4: Inject Build Info (JSON)');
  
  try {
    const ConfigParser = context.requireCordovaModule('cordova-common').ConfigParser;
    const config = new ConfigParser(path.join(context.opts.projectRoot, 'config.xml'));
    
    const appName = config.getPreference('APP_NAME') || config.name() || 'Unknown';
    const versionNumber = config.getPreference('VERSION_NUMBER') || config.version() || '0.0.0';
    const versionCode = config.getPreference('VERSION_CODE') || '0';
    const environment = config.getPreference('ENVIRONMENT') || 'production';
    const apiHostname = config.getPreference('API_HOSTNAME') || '';
    const cdnIcon = config.getPreference('CDN_ICON') || '';
    
    console.log(`   ℹ️  App: ${appName}`);
    console.log(`   ℹ️  Version: ${versionNumber} (${versionCode})`);
    console.log(`   ℹ️  Environment: ${environment}`);
    if (apiHostname) console.log(`   ℹ️  API: ${apiHostname}`);
    
    // Get www path
    const wwwPath = path.join(iosPath, 'www');
    if (!fs.existsSync(wwwPath)) {
      console.log('   ⚠️  www directory not found');
      return;
    }
    
    // Create .cordova-app-data directory
    const cordovaDataDir = path.join(wwwPath, '.cordova-app-data');
    if (!fs.existsSync(cordovaDataDir)) {
      fs.mkdirSync(cordovaDataDir, { recursive: true });
    }
    
    // Build info object
    const buildInfo = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      config: {
        appName: appName,
        appId: config.packageName() || 'unknown',
        appVersion: versionNumber,
        appDescription: config.getPreference('APP_DESCRIPTION') || '',
        platform: 'ios',
        author: config.getPreference('AUTHOR') || '',
        buildDate: new Date().toISOString(),
        buildTimestamp: Date.now(),
        environment: environment,
        apiHostname: apiHostname,
        cdnIcon: cdnIcon
      }
    };
    
    // Write build-config.json
    const configPath = path.join(cordovaDataDir, 'build-config.json');
    fs.writeFileSync(configPath, JSON.stringify(buildInfo, null, 2), 'utf8');
    console.log('   ✅ Created build-config.json');
    
    // Update build history
    const historyPath = path.join(cordovaDataDir, 'build-history.json');
    let history = [];
    
    if (fs.existsSync(historyPath)) {
      try {
        const historyData = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        history = historyData.history || [];
      } catch (e) {
        console.log('   ⚠️  Could not read history, starting fresh');
      }
    }
    
    // Add new entry
    history.push({
      timestamp: new Date().toISOString(),
      buildId: `build_${Date.now()}`,
      platform: 'ios',
      appVersion: versionNumber,
      appName: appName,
      environment: environment,
      success: true
    });
    
    // Keep only last 50
    if (history.length > 50) {
      history = history.slice(-50);
    }
    
    const historyData = {
      version: '1.0',
      count: history.length,
      lastUpdated: new Date().toISOString(),
      history: history
    };
    
    fs.writeFileSync(historyPath, JSON.stringify(historyData, null, 2), 'utf8');
    console.log(`   ✅ Updated build-history.json (${history.length} entries)`);
    
  } catch (error) {
    console.log('   ⚠️  Build info failed:', error.message);
  }
}

async function customizeUI(context, iosPath) {
  console.log('🎨 Step 5: Customize UI (Splash & Webview)');
  
  try {
    const ConfigParser = context.requireCordovaModule('cordova-common').ConfigParser;
    const config = new ConfigParser(path.join(context.opts.projectRoot, 'config.xml'));
    
    const splashBg = config.getPreference('BackgroundColor') ||
                     config.getPreference('SplashScreenBackgroundColor') ||
                     config.getPreference('AndroidWindowSplashScreenBackground') ||
                     config.getPreference('AndroidWindowSplashScreenBackgroundColor');
    const webviewBg = config.getPreference('WEBVIEW_BACKGROUND_COLOR');
    
    if (!splashBg && !webviewBg) {
      console.log('   ℹ️  No UI customization');
      return;
    }
    
    const xcodeProjects = fs.readdirSync(iosPath).filter(f => f.endsWith('.xcodeproj'));
    if (xcodeProjects.length === 0) return;
    
    const projectName = xcodeProjects[0].replace('.xcodeproj', '');
    
    if (splashBg) {
      console.log(`   🎨 Splash color: ${splashBg}`);
      
      // Parse color
      const colorHex = splashBg.replace('#', '');
      const r = (parseInt(colorHex.substr(0, 2), 16) / 255).toFixed(3);
      const g = (parseInt(colorHex.substr(2, 2), 16) / 255).toFixed(3);
      const b = (parseInt(colorHex.substr(4, 2), 16) / 255).toFixed(3);
      
      const colorXML = `<color key="backgroundColor" red="${r}" green="${g}" blue="${b}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>`;
      
      // Update CDVLaunchScreen.storyboard (Cordova's existing storyboard)
      const cdvStoryboardPath = path.join(iosPath, projectName, 'CDVLaunchScreen.storyboard');
      if (fs.existsSync(cdvStoryboardPath)) {
        let cdvStoryboard = fs.readFileSync(cdvStoryboardPath, 'utf8');
        
        // AGGRESSIVE REPLACE: Remove ALL color definitions
        cdvStoryboard = cdvStoryboard.replace(
          /<color key="backgroundColor"[^>]*\/>/g,
          colorXML
        );
        
        cdvStoryboard = cdvStoryboard.replace(
          /<color key="backgroundColor"[^>]*>[\s\S]*?<\/color>/g,
          colorXML
        );
        
        fs.writeFileSync(cdvStoryboardPath, cdvStoryboard, 'utf8');
        console.log('   ✅ Updated CDVLaunchScreen.storyboard with splash color');
      } else {
        console.log('   ⚠️  CDVLaunchScreen.storyboard not found!');
      }
      
      // Create Color Asset (for UILaunchScreen iOS 14+)
      const appPath = path.join(iosPath, projectName);
      const xcassetsFolders = fs.readdirSync(appPath)
        .filter(f => {
          const xcassetsPath = path.join(appPath, f);
          return f.endsWith('.xcassets') && fs.statSync(xcassetsPath).isDirectory();
        })
        .sort((a, b) => {
          // Prioritize Assets.xcassets over Images.xcassets
          if (a === 'Assets.xcassets') return -1;
          if (b === 'Assets.xcassets') return 1;
          return 0;
        });
      
      if (xcassetsFolders.length > 0) {
        const xcassetsPath = path.join(appPath, xcassetsFolders[0]);
        const colorSetPath = path.join(xcassetsPath, 'SplashBackgroundColor.colorset');
        
        if (!fs.existsSync(colorSetPath)) {
          fs.mkdirSync(colorSetPath, { recursive: true });
        }
        
        // Create Color Contents.json with actual RGB values
        const colorContents = {
          "colors": [
            {
              "idiom": "universal",
              "color": {
                "color-space": "srgb",
                "components": {
                  "red": r,
                  "green": g,
                  "blue": b,
                  "alpha": "1.000"
                }
              }
            }
          ],
          "info": {
            "author": "cordova-plugin-change-app-info",
            "version": 1
          }
        };
        
        fs.writeFileSync(
          path.join(colorSetPath, 'Contents.json'),
          JSON.stringify(colorContents, null, 2),
          'utf8'
        );
        
        console.log('   ✅ Created SplashBackgroundColor.colorset');
      }
      
      // Update Info.plist: Point to CDVLaunchScreen + iOS 14+ dictionary
      const plistPath = path.join(iosPath, projectName, `${projectName}-Info.plist`);
      if (fs.existsSync(plistPath)) {
        let plistContent = fs.readFileSync(plistPath, 'utf8');
        
        // Remove old UILaunchStoryboardName if exists
        plistContent = plistContent.replace(
          /<key>UILaunchStoryboardName<\/key>\s*<string>[^<]*<\/string>/g,
          ''
        );
        
        // Remove old UILaunchScreen dictionary if exists
        plistContent = plistContent.replace(
          /<key>UILaunchScreen<\/key>\s*<dict>[\s\S]*?<\/dict>/,
          ''
        );
        
        // Add BOTH: UILaunchStoryboardName pointing to CDVLaunchScreen + iOS 14+ dictionary
        const launchScreenConfig = `  <key>UILaunchStoryboardName</key>\n  <string>CDVLaunchScreen</string>\n  <key>UILaunchScreen</key>\n  <dict>\n    <key>UIColorName</key>\n    <string>SplashBackgroundColor</string>\n    <key>UIImageName</key>\n    <string></string>\n    <key>UIImageRespectsSafeAreaInsets</key>\n    <false/>\n  </dict>`;
        
        plistContent = plistContent.replace(
          '</dict>\n</plist>',
          `${launchScreenConfig}\n</dict>\n</plist>`
        );
        
        fs.writeFileSync(plistPath, plistContent, 'utf8');
        console.log('   ✅ Set UILaunchStoryboardName = CDVLaunchScreen (iOS 13+)');
        console.log('   ✅ Added UILaunchScreen dictionary (iOS 14+ fallback)');
        console.log('   ✅ Splash screen configured for iOS 13-18+');
      }
    }
    
    if (webviewBg) {
      console.log(`   🎨 Webview color: ${webviewBg}`);
    }
    
  } catch (error) {
    console.log('   ⚠️  UI customization skipped:', error.message);
    console.error(error.stack);
  }
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
      
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (buffer.length === 0) {
          return reject(new Error('Downloaded file is empty'));
        }
        resolve(buffer);
      });
      response.on('error', reject);
    });
    
    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Download timeout after 30s'));
    });
  });
}
