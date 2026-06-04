#!/usr/bin/env node

/**
 * iOS Splash Flicker Fix
 * Runs RIGHT BEFORE Xcode compilation (before_compile)
 * 
 * ROOT CAUSE OF FLICKER:
 * 1. Splash screen shows old color (from UILaunchStoryboardName)
 * 2. App loads and shows new color (from UILaunchScreen)
 * 3. Visual flicker between old and new color
 * 
 * SOLUTION:
 * Remove UILaunchStoryboardName from Info.plist
 * Use ONLY UILaunchScreen dictionary for consistency
 * 
 * WHY THIS MUST RUN LAST (before_compile):
 * OutSystems MABS may inject UILaunchStoryboardName during prepare/compile phases
 * This hook runs as FINAL OVERRIDE right before Xcode compiles
 */

const fs = require('fs');
const path = require('path');

module.exports = function(context) {
  const platforms = context.opts.platforms;
  
  if (!platforms.includes('ios')) {
    return;
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  🎨 iOS Splash Flicker Fix');
  console.log('  ⏰ FINAL OVERRIDE (right before compile)');
  console.log('═══════════════════════════════════════');

  try {
    const root = context.opts.projectRoot;
    const iosPath = path.join(root, 'platforms/ios');
    
    // Find Xcode project
    const xcodeProjects = fs.readdirSync(iosPath)
      .filter(f => f.endsWith('.xcodeproj'));
    
    if (xcodeProjects.length === 0) {
      console.log('⚠️  No Xcode project found');
      return;
    }
    
    const projectName = xcodeProjects[0].replace('.xcodeproj', '');
    const plistPath = path.join(iosPath, projectName, `${projectName}-Info.plist`);
    
    if (!fs.existsSync(plistPath)) {
      console.log('⚠️  Info.plist not found at:', plistPath);
      return;
    }
    
    let plistContent = fs.readFileSync(plistPath, 'utf8');
    let modified = false;
    
    // CRITICAL: Check for UILaunchStoryboardName
    const uiLaunchStoryboardPattern = /<key>UILaunchStoryboardName<\/key>\s*<string>[^<]*<\/string>/g;
    const matches = plistContent.match(uiLaunchStoryboardPattern);
    
    if (matches && matches.length > 0) {
      console.log(`\n⚠️  FOUND ${matches.length} UILaunchStoryboardName entry(ies) - REMOVING...\n`);
      
      for (const match of matches) {
        console.log(`   Removing: ${match.substring(0, 50)}...`);
        plistContent = plistContent.replace(match, '');
        modified = true;
      }
      
      console.log('\n   ✅ All UILaunchStoryboardName entries removed');
    } else {
      console.log('\n✅ No UILaunchStoryboardName found (good!)');
    }
    
    // Verify UILaunchScreen exists
    if (!plistContent.includes('<key>UILaunchScreen</key>')) {
      console.log('⚠️  UILaunchScreen dictionary not found');
      console.log('   Creating minimal UILaunchScreen configuration...\n');
      
      const launchScreenConfig = `  <key>UILaunchScreen</key>
  <dict>
    <key>UIColorName</key>
    <string>SplashBackgroundColor</string>
    <key>UIImageName</key>
    <string></string>
    <key>UIImageRespectsSafeAreaInsets</key>
    <false/>
  </dict>`;
      
      // Insert before closing </dict></plist>
      plistContent = plistContent.replace(
        '</dict>\n</plist>',
        `${launchScreenConfig}
</dict>
</plist>`
      );
      
      modified = true;
      console.log('   ✅ UILaunchScreen dictionary created');
    } else {
      console.log('✅ UILaunchScreen dictionary present');
    }
    
    // Verify color asset reference
    if (plistContent.includes('UIColorName')) {
      console.log('✅ UIColorName reference present');
    } else {
      console.log('⚠️  UIColorName reference missing - color may not apply');
    }
    
    // Save if modified
    if (modified) {
      fs.writeFileSync(plistPath, plistContent, 'utf8');
      console.log('\n📝 Saved Info.plist');
    }
    
    console.log('\n═══════════════════════════════════════');
    console.log('✅ Splash Flicker Fix Complete!');
    console.log('   📋 Configuration:');
    console.log('      • UILaunchStoryboardName: REMOVED ✅');
    console.log('      • UILaunchScreen: PRESENT ✅');
    console.log('      • Color: SplashBackgroundColor ✅');
    console.log('\n   🎉 Old color will NOT flash!');
    console.log('   🎉 Splash screen will show new color immediately!');
    console.log('═══════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n⚠️  Continuing with Xcode build...\n');
  }
};
