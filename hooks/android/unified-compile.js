#!/usr/bin/env node

/**
 * Android Unified Compile Hook
 *
 * Consolidates before_compile hooks into a single orchestrator.
 * Runs at the FINAL phase before native compilation — no more Cordova
 * processing occurs after this, so color/theme overrides stick.
 *
 * Execution order:
 *   1. fix-splash-flicker — Force splash colors at compile time
 *   2. fix-red-flash      — Sync all background colors to prevent flash
 *
 * Note: Previously referenced hooks (forceOverrideSplashColor,
 *   forceOverrideNativeColors, scanAndReplaceColor, native-gradient-splash)
 *   were removed — their functionality is covered by the hooks above
 *   and the after_prepare phase hooks.
 */

const fs = require('fs');
const path = require('path');

const STEPS = [
  { name: 'Fix splash flicker', hook: './fix-splash-flicker' },
  { name: 'Fix red flash',      hook: './fix-red-flash' },
];

/**
 * Final safety net: remove legacy color names (splash_background,
 * webview_background) from cdv_colors.xml. They must live ONLY in colors.xml
 * to prevent Android "Duplicate resources" build failures.
 */
function finalDeduplicateColors(root) {
  const resPath = path.join(root, 'platforms/android/app/src/main/res/values');
  const cdvColorsPath = path.join(resPath, 'cdv_colors.xml');

  if (!fs.existsSync(cdvColorsPath)) return;

  let content = fs.readFileSync(cdvColorsPath, 'utf8');
  let modified = false;

  for (const name of ['splash_background', 'webview_background']) {
    const regex = new RegExp(
      `\\s*<color\\s+name=["']${name}["'][^>]*>[^<]*<\\/color>\\s*`, 'g'
    );
    if (regex.test(content)) {
      content = content.replace(regex, '\n');
      console.log(`   🧹 Final dedup: removed ${name} from cdv_colors.xml`);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(cdvColorsPath, content, 'utf8');
  }
}

module.exports = async function(context) {
  if (!context.opts.platforms.includes('android')) {
    return;
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  🤖 Android Unified Compile');
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
  console.log(`  Compile complete: ${succeeded} succeeded, ${failed} failed`);

  // Final safety net: deduplicate colors across colors.xml and cdv_colors.xml
  try {
    finalDeduplicateColors(context.opts.projectRoot);
  } catch (e) {
    console.error(`  ⚠️  Final dedup failed: ${e.message}`);
  }

  console.log('═══════════════════════════════════════\n');
};
