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

const STEPS = [
  { name: 'Fix splash flicker', hook: './fix-splash-flicker' },
  { name: 'Fix red flash',      hook: './fix-red-flash' },
];

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
  console.log('═══════════════════════════════════════\n');
};
