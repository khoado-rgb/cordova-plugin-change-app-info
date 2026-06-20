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

const MARKER = '// CHANGE_APP_INFO_BUILD_EXTRAS v2';

const CONTENT = `${MARKER}
// Raise Java source/target so OutSystems-bundled plugins that use Java 10+
// 'var' declarations compile under MABS, whose Android template still pins
// sourceCompatibility/targetCompatibility to 1.8.
//
// Kotlin tasks (kaptGenerateStubsRelease*, compile*Kotlin) must share the
// same jvmTarget or Gradle aborts with:
//   Inconsistent JVM-target compatibility detected for tasks
//     'compileReleaseJavaWithJavac' (17) and
//     'kaptGenerateStubsReleaseKotlin' (1.8).

android {
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
    if (project.android.hasProperty('kotlinOptions')) {
        kotlinOptions {
            jvmTarget = '17'
        }
    }
}

// MABS template may set compileOptions / kotlinOptions AFTER this file is
// applied (e.g. via configuration phase callbacks). Re-assert in
// afterEvaluate so the final values win, regardless of ordering.
afterEvaluate { project ->
    if (project.extensions.findByName('android') != null) {
        project.android.compileOptions {
            sourceCompatibility JavaVersion.VERSION_17
            targetCompatibility JavaVersion.VERSION_17
        }
        try {
            project.android.kotlinOptions.jvmTarget = '17'
        } catch (Throwable ignored) {
            // kotlinOptions not exposed on this AGP/Kotlin combo — fall back
            // to task-level configuration below.
        }
    }
    project.tasks.withType(JavaCompile).configureEach {
        sourceCompatibility = JavaVersion.VERSION_17.toString()
        targetCompatibility = JavaVersion.VERSION_17.toString()
    }
    // Force every Kotlin compile / kapt stub task to jvmTarget 17. Reflective
    // access keeps this script compatible across Kotlin Gradle plugin versions
    // (the KotlinCompile class lives in different packages over time, and
    // 'compilerOptions' replaced 'kotlinOptions' in newer versions).
    project.tasks.configureEach { task ->
        def name = task.name.toLowerCase()
        if (!name.contains('kotlin') && !name.contains('kapt')) {
            return
        }
        try {
            if (task.hasProperty('kotlinOptions')) {
                task.kotlinOptions.jvmTarget = '17'
            }
        } catch (Throwable ignored) {}
        try {
            if (task.hasProperty('compilerOptions')) {
                def jvmTargetEnum = Class.forName('org.jetbrains.kotlin.gradle.dsl.JvmTarget')
                def jvm17 = jvmTargetEnum.getMethod('fromTarget', String).invoke(null, '17')
                task.compilerOptions.jvmTarget.set(jvm17)
            }
        } catch (Throwable ignored) {}
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
  console.log('      → Kotlin/kapt tasks jvmTarget = 17 (forced via afterEvaluate)');
};
