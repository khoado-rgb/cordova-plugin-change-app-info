#!/usr/bin/env node

/**
 * Install Android build-extras.gradle
 *
 * Why this hook exists (in addition to the gradleReference framework in
 * plugin.xml): on MABS, registering the gradle file via
 *   <framework src="..." custom="true" type="gradleReference" />
 * does install the file, but it is NOT applied early enough — the MABS
 * Android template still ends up compiling with sourceCompatibility=1.8 /
 * targetCompatibility=1.8. OutSystems-bundled plugins (e.g. OSNavigationBar
 * in template 16.5.1) use Java 10+ `var`, so `:app:compileReleaseJavaWithJavac`
 * fails with:
 *   error: cannot find symbol
 *     var context = cordova.getContext();
 *               ^   symbol: class var
 *
 * cordova-android automatically `apply from`s the file
 *   platforms/android/app/build-extras.gradle
 * at the end of app/build.gradle, AFTER the android { ... } block, so
 * overrides applied there win. This hook writes that file deterministically.
 */

const fs = require('fs');
const path = require('path');

const MARKER = '// CHANGE_APP_INFO_BUILD_EXTRAS v1';

const CONTENT = `${MARKER}
// Raise Java source/target so OutSystems-bundled plugins that use Java 10+
// 'var' declarations compile under MABS, whose Android template still pins
// sourceCompatibility/targetCompatibility to 1.8.

android {
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

// MABS template may set compileOptions AFTER this file is applied (e.g. via
// configuration phase callbacks). Re-assert in afterEvaluate so the final
// value of the JavaCompile tasks is Java 17, regardless of ordering.
afterEvaluate { project ->
    if (project.extensions.findByName('android') != null) {
        project.android.compileOptions {
            sourceCompatibility JavaVersion.VERSION_17
            targetCompatibility JavaVersion.VERSION_17
        }
    }
    project.tasks.withType(JavaCompile).configureEach {
        sourceCompatibility = JavaVersion.VERSION_17.toString()
        targetCompatibility = JavaVersion.VERSION_17.toString()
    }
}
`;

module.exports = function (context) {
  if (!context.opts.platforms || !context.opts.platforms.includes('android')) {
    return;
  }

  const root = context.opts.projectRoot;
  const targetPath = path.join(root, 'platforms', 'android', 'app', 'build-extras.gradle');
  const targetDir = path.dirname(targetPath);

  if (!fs.existsSync(targetDir)) {
    console.log(`   ⚠️  ${targetDir} not found, skipping build-extras install`);
    return;
  }

  if (fs.existsSync(targetPath)) {
    const existing = fs.readFileSync(targetPath, 'utf8');
    if (existing.includes(MARKER)) {
      console.log('   ✓ app/build-extras.gradle already at current version');
      return;
    }
    console.log('   ♻️  Overwriting older app/build-extras.gradle');
  }

  fs.writeFileSync(targetPath, CONTENT, 'utf8');
  console.log(`   ✅ Wrote ${targetPath}`);
  console.log('      → compileOptions = JavaVersion.VERSION_17 (forced via afterEvaluate)');
};
