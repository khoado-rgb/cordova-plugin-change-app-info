#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { downloadFile } = require('./utils');

// Try to load image processing library
let sharp = null;
let Jimp = null;
let processor = null;

try {
  sharp = require('sharp');
  processor = 'sharp';
} catch (e) {
  try {
    Jimp = require('jimp').Jimp;
    processor = 'jimp';
  } catch (e2) {
    processor = null;
  }
}

async function resizeImage(srcBuffer, dest, size) {
  try {
    if (sharp) {
      await sharp(srcBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(dest);
      return true;
    } else if (Jimp) {
      const image = await Jimp.fromBuffer(srcBuffer);
      image.resize({ w: size, h: size });
      await image.write(dest);
      return true;
    }
    return false;
  } catch (error) {
    console.log(`   ⚠️  Error resizing to ${size}x${size}:`, error.message);
    return false;
  }
}

module.exports = async function(context) {
  const ConfigParser = context.requireCordovaModule('cordova-common').ConfigParser;
  const config = new ConfigParser(path.join(context.opts.projectRoot, 'config.xml'));
  
  const platforms = context.opts.platforms;
  const root = context.opts.projectRoot;
  
  console.log('\n══════════════════════════════════');
  console.log('        GENERATE ICONS HOOK        ');
  console.log('══════════════════════════════════');
  console.log('Platforms:', platforms.join(', '));
  
  // Check processor
  if (!processor) {
    console.log('❌ Cannot generate icons: No image processing library found');
    console.log('   💡 Install: npm install sharp (recommended)');
    console.log('   💡 Or: npm install jimp (fallback)');
    console.log('══════════════════════════════════\n');
    return;
  }
  
  console.log(`✅ Using ${processor} for image processing`);
  
  // Get CDN_ICON preference
  const cdnUrl = (config.getPreference('CDN_ICON') || '').trim();
  
  if (!cdnUrl) {
    console.log('ℹ️  CDN_ICON not configured - skipping icon generation');
    console.log('══════════════════════════════════\n');
    return;
  }
  
  console.log('🌐 CDN URL:', cdnUrl);
  
  // Download icon
  console.log('💾 Downloading icon from CDN...');
  let iconBuffer;
  
  try {
    iconBuffer = await downloadFile(cdnUrl);
    console.log(`✅ Downloaded ${(iconBuffer.length / 1024).toFixed(2)} KB`);
  } catch (err) {
    console.log('❌ Download failed:', err.message);
    console.log('💡 Check URL and network connection');
    console.log('══════════════════════════════════\n');
    return;
  }
  
  // Validate buffer
  if (!iconBuffer || iconBuffer.length === 0) {
    console.log('❌ Downloaded file is empty');
    console.log('══════════════════════════════════\n');
    return;
  }
  
  // Process each platform
  for (const platform of platforms) {
    console.log(`\n📱 Processing platform: ${platform}`);
    
    if (platform === 'android') {
      await generateAndroidIcons(root, iconBuffer);
    } else if (platform === 'ios') {
      await generateIOSIcons(root, iconBuffer);
    }
  }
  
  console.log('\n══════════════════════════════════');
  console.log('✅ Icons generation completed!');
  console.log('══════════════════════════════════\n');
};

async function generateAndroidIcons(root, iconBuffer) {
  const androidPath = path.join(root, 'platforms/android');
  
  if (!fs.existsSync(androidPath)) {
    console.log('❌ Android platform not found');
    return;
  }
  
  // Find res folder
  const resPaths = [
    path.join(androidPath, 'app/src/main/res'),
    path.join(androidPath, 'res')
  ];
  
  let resPath = null;
  for (const p of resPaths) {
    if (fs.existsSync(p)) {
      resPath = p;
      break;
    }
  }
  
  if (!resPath) {
    console.log('❌ Android res folder not found');
    return;
  }
  
  console.log('📂 Android res:', resPath);
  
  const androidSizes = [
    ['mipmap-ldpi', 36],
    ['mipmap-mdpi', 48],
    ['mipmap-hdpi', 72],
    ['mipmap-xhdpi', 96],
    ['mipmap-xxhdpi', 144],
    ['mipmap-xxxhdpi', 192]
  ];
  
  console.log(`🎨 Generating ${androidSizes.length} Android icon densities...`);
  
  // Clean old icons
  let cleanedCount = 0;
  for (const [folder] of androidSizes) {
    const iconPath = path.join(resPath, folder, 'ic_launcher.png');
    if (fs.existsSync(iconPath)) {
      try {
        fs.unlinkSync(iconPath);
        cleanedCount++;
      } catch (e) {}
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned ${cleanedCount} old icon(s)`);
  }
  
  let successCount = 0;
  for (const [folder, size] of androidSizes) {
    const folderPath = path.join(resPath, folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    
    const output = path.join(folderPath, 'ic_launcher.png');
    if (await resizeImage(iconBuffer, output, size)) {
      // Verify file
      if (fs.existsSync(output)) {
        const stats = fs.statSync(output);
        if (stats.size > 0) {
          console.log(`  ✅ ${folder}/ic_launcher.png (${size}x${size})`);
          successCount++;
        }
      }
    }
  }
  
  console.log(`✅ Generated ${successCount}/${androidSizes.length} Android icons`);
}

async function generateIOSIcons(root, iconBuffer) {
  const iosPath = path.join(root, 'platforms/ios');
  
  if (!fs.existsSync(iosPath)) {
    console.log('❌ iOS platform not found');
    return;
  }
  
  // Find app folder
  const appFolders = fs.readdirSync(iosPath).filter(f => {
    const fullPath = path.join(iosPath, f);
    return fs.statSync(fullPath).isDirectory() && 
           f !== 'CordovaLib' && 
           f !== 'www' && 
           f !== 'cordova' &&
           f !== 'build' &&
           f !== 'Pods' &&
           !f.endsWith('.xcodeproj');
  });
  
  if (appFolders.length === 0) {
    console.log('❌ iOS app folder not found');
    return;
  }
  
  const appFolder = appFolders[0];
  const appPath = path.join(iosPath, appFolder);
  
  console.log('📂 iOS app:', appFolder);
  
  // Find .xcassets folder
  const xcassetsFolders = fs.readdirSync(appPath).filter(f => {
    const xcassetsPath = path.join(appPath, f);
    return f.endsWith('.xcassets') && fs.statSync(xcassetsPath).isDirectory();
  });
  
  if (xcassetsFolders.length === 0) {
    console.log('❌ No .xcassets folder found');
    return;
  }
  
  const xcassetsFolder = xcassetsFolders[0];
  const xcassetsPath = path.join(appPath, xcassetsFolder);
  const appIconPath = path.join(xcassetsPath, 'AppIcon.appiconset');
  
  console.log('📂 Using:', xcassetsFolder);
  
  if (!fs.existsSync(appIconPath)) {
    fs.mkdirSync(appIconPath, { recursive: true });
  }
  
  const iosSizes = [
    ['icon-20@2x.png', 40],
    ['icon-20@3x.png', 60],
    ['icon-29@2x.png', 58],
    ['icon-29@3x.png', 87],
    ['icon-40@2x.png', 80],
    ['icon-40@3x.png', 120],
    ['icon-60@2x.png', 120],
    ['icon-60@3x.png', 180],
    ['icon-20.png', 20],
    ['icon-29.png', 29],
    ['icon-40.png', 40],
    ['icon-76.png', 76],
    ['icon-76@2x.png', 152],
    ['icon-83.5@2x.png', 167],
    ['icon-1024.png', 1024]
  ];
  
  console.log(`🎨 Generating ${iosSizes.length} iOS icon sizes...`);
  
  // Clean old icons
  const oldIcons = fs.readdirSync(appIconPath).filter(f => f.endsWith('.png'));
  if (oldIcons.length > 0) {
    oldIcons.forEach(icon => {
      try {
        fs.unlinkSync(path.join(appIconPath, icon));
      } catch (e) {}
    });
    console.log(`🧹 Cleaned ${oldIcons.length} old icon(s)`);
  }
  
  let successCount = 0;
  for (const [filename, size] of iosSizes) {
    const output = path.join(appIconPath, filename);
    if (await resizeImage(iconBuffer, output, size)) {
      // Verify file
      if (fs.existsSync(output)) {
        const stats = fs.statSync(output);
        if (stats.size > 0) {
          successCount++;
        }
      }
    }
  }
  
  console.log(`✅ Generated ${successCount}/${iosSizes.length} iOS icons`);
  
  // Create Contents.json
  const contentsJson = {
    images: [
      { size: '20x20', idiom: 'iphone', filename: 'icon-20@2x.png', scale: '2x' },
      { size: '20x20', idiom: 'iphone', filename: 'icon-20@3x.png', scale: '3x' },
      { size: '29x29', idiom: 'iphone', filename: 'icon-29@2x.png', scale: '2x' },
      { size: '29x29', idiom: 'iphone', filename: 'icon-29@3x.png', scale: '3x' },
      { size: '40x40', idiom: 'iphone', filename: 'icon-40@2x.png', scale: '2x' },
      { size: '40x40', idiom: 'iphone', filename: 'icon-40@3x.png', scale: '3x' },
      { size: '60x60', idiom: 'iphone', filename: 'icon-60@2x.png', scale: '2x' },
      { size: '60x60', idiom: 'iphone', filename: 'icon-60@3x.png', scale: '3x' },
      { size: '20x20', idiom: 'ipad', filename: 'icon-20.png', scale: '1x' },
      { size: '29x29', idiom: 'ipad', filename: 'icon-29.png', scale: '1x' },
      { size: '40x40', idiom: 'ipad', filename: 'icon-40.png', scale: '1x' },
      { size: '76x76', idiom: 'ipad', filename: 'icon-76.png', scale: '1x' },
      { size: '76x76', idiom: 'ipad', filename: 'icon-76@2x.png', scale: '2x' },
      { size: '83.5x83.5', idiom: 'ipad', filename: 'icon-83.5@2x.png', scale: '2x' },
      { size: '1024x1024', idiom: 'ios-marketing', filename: 'icon-1024.png', scale: '1x' }
    ],
    info: {
      version: 1,
      author: 'cordova-plugin-change-app-info'
    }
  };
  
  fs.writeFileSync(
    path.join(appIconPath, 'Contents.json'),
    JSON.stringify(contentsJson, null, 2)
  );
  
  console.log('✅ Contents.json updated');
}
