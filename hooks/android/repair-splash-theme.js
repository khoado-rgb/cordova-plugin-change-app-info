#!/usr/bin/env node

/**
 * Repair Cordova Android's canonical splash theme before prepare.
 *
 * Older plugin builds moved Theme.App.SplashScreen out of values/themes.xml.
 * cordova-android 14 reads that exact file during prepare, so a cached Android
 * platform can fail before before_compile hooks get a chance to fix resources.
 */

const fs = require('fs');
const path = require('path');

const SPLASH_STYLE_REGEX = /[ \t]*<style\s+name=["']Theme\.App\.SplashScreen["'][\s\S]*?<\/style>\s*\n?/g;

const DEFAULT_SPLASH_STYLE = `    <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen.IconBackground">
        <item name="windowSplashScreenBackground">@color/cdv_splashscreen_background</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_cdv_splashscreen</item>
        <item name="windowSplashScreenAnimationDuration">200</item>
        <item name="postSplashScreenTheme">@style/Theme.AppCompat.NoActionBar</item>
        <item name="android:windowOptOutEdgeToEdgeEnforcement" tools:targetApi="35">true</item>
    </style>`;

function hasRequiredSplashItems(styleXml) {
  return [
    'windowSplashScreenBackground',
    'windowSplashScreenAnimatedIcon',
    'windowSplashScreenAnimationDuration',
    'postSplashScreenTheme',
    'android:windowOptOutEdgeToEdgeEnforcement'
  ].every(itemName => styleXml.includes(`name="${itemName}"`) || styleXml.includes(`name='${itemName}'`));
}

function ensureToolsNamespace(content) {
  return content.replace(/<resources\b([^>]*)>/, (match, attrs) => {
    if (/\bxmlns:tools=/.test(attrs)) return match;
    return `<resources${attrs} xmlns:tools="http://schemas.android.com/tools">`;
  });
}

function repairSplashTheme(themesPath) {
  let content = fs.existsSync(themesPath)
    ? fs.readFileSync(themesPath, 'utf8')
    : '<?xml version="1.0" encoding="utf-8"?>\n<resources xmlns:tools="http://schemas.android.com/tools">\n</resources>\n';

  if (!/<resources\b/.test(content)) {
    content = '<?xml version="1.0" encoding="utf-8"?>\n<resources xmlns:tools="http://schemas.android.com/tools">\n</resources>\n';
  }

  const match = content.match(SPLASH_STYLE_REGEX);
  if (match && hasRequiredSplashItems(match[0])) {
    return false;
  }

  content = ensureToolsNamespace(content);

  if (match) {
    SPLASH_STYLE_REGEX.lastIndex = 0;
    content = content.replace(SPLASH_STYLE_REGEX, `${DEFAULT_SPLASH_STYLE}\n`);
  } else {
    SPLASH_STYLE_REGEX.lastIndex = 0;
    content = content.replace('</resources>', `${DEFAULT_SPLASH_STYLE}\n</resources>`);
  }

  fs.writeFileSync(themesPath, content, 'utf8');
  return true;
}

module.exports = function(context) {
  const platforms = context.opts.platforms;
  if (!platforms || !platforms.includes('android')) {
    return;
  }

  const root = context.opts.projectRoot;
  const valuesDir = path.join(root, 'platforms/android/app/src/main/res/values');
  if (!fs.existsSync(valuesDir)) {
    return;
  }

  const themesPath = path.join(valuesDir, 'themes.xml');
  if (repairSplashTheme(themesPath)) {
    console.log('   Repaired values/themes.xml Theme.App.SplashScreen before Cordova prepare');
  }
};
