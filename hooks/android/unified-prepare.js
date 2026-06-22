#!/usr/bin/env node

/**
 * Android Unified Prepare Hook
 *
 * Consolidates 7 after_prepare hooks into a single orchestrator.
 * Each sub-operation is wrapped in try-catch so a failure in one
 * does not block the others.
 *
 * Execution order preserved from original plugin.xml registration:
 *   1. aggressive-color-replace  — Global hex color replacement
 *   2. update-splash-theme-color — Splash theme color sync
 *   3. removeConflictingStringsXml — Remove duplicate strings.xml
 *   4. configure-backup-rules    — Exclude device-bound TOTP prefs from backup
 *   5. changeAppInfo             — Update app name & version
 *   6. generateIcons             — Download & resize CDN icons
 *   7. customizeWebview          — Set webview background color
 *   8. update-android-small-icon — Copy notification icons
 *
 * Hooks that remain separate (shared with iOS):
 *   - injectBuildInfo.js
 *   - customizeColors.js
 */

const STEPS = [
  { name: 'Install build-extras',       hook: './install-build-extras' },
  { name: 'Aggressive color replace',   hook: './aggressive-color-replace' },
  { name: 'Update splash theme color',  hook: '../update-splash-theme-color' },
  { name: 'Remove conflicting strings', hook: '../removeConflictingStringsXml' },
  { name: 'Configure backup rules',     hook: './configure-backup-rules' },
  { name: 'Change app info',            hook: '../changeAppInfo' },
  { name: 'Generate icons',             hook: '../generateIcons' },
  { name: 'Customize webview',          hook: '../customizeWebview' },
  { name: 'Update small icon',          hook: './update-android-small-icon' },
];

module.exports = async function(context) {
  if (!context.opts.platforms.includes('android')) {
    return;
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  🤖 Android Unified Prepare');
  console.log('═══════════════════════════════════════');

  let succeeded = 0;
  let failed = 0;

  for (const step of STEPS) {
    try {
      console.log(`\n🔹 ${step.name}...`);
      const hookFn = require(step.hook);
      const result = hookFn(context);
      if (result && typeof result.then === 'function') {
        await result;
      }
      console.log(`   ✅ ${step.name} completed`);
      succeeded++;
    } catch (error) {
      console.error(`   ⚠️  ${step.name} failed: ${error.message}`);
      failed++;
    }
  }

  console.log('\n───────────────────────────────────────');
  console.log(`  Prepare complete: ${succeeded} succeeded, ${failed} failed`);
  console.log('═══════════════════════════════════════\n');
};
