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

const MARKER = '// CHANGE_APP_INFO_BUILD_EXTRAS v3';

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
//
// IMPORTANT: keep this script scoped to JavaCompile and KotlinCompile tasks.
// A blanket project.tasks.configureEach {} block triggers premature
// realization of AGP lazy variant bindings (e.g. debug signingConfig) and
// causes 'Cannot query the value of this property because it has no value
// available' during :app:packageDebug dependency resolution on AGP 8.x.

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

// Force every JavaCompile task to Java 17. withType is lazy and only realizes
// the matching tasks, never realizes packaging/signing tasks.
tasks.withType(JavaCompile).configureEach {
    sourceCompatibility = JavaVersion.VERSION_17.toString()
    targetCompatibility = JavaVersion.VERSION_17.toString()
}

// Configure Kotlin tasks when (and only when) the Kotlin plugin is applied.
// Looking up the class via Class.forName keeps this gradle file compatible
// across Kotlin Gradle plugin versions that ship with different MABS
// templates without binding to a class at script-compile time.
project.plugins.withId('org.jetbrains.kotlin.android') {
    try {
        def kotlinCompileClass = Class.forName('org.jetbrains.kotlin.gradle.tasks.KotlinCompile')
        project.tasks.withType(kotlinCompileClass).configureEach { kotlinTask ->
            try {
                if (kotlinTask.hasProperty('kotlinOptions')) {
                    kotlinTask.kotlinOptions.jvmTarget = '17'
                }
            } catch (Throwable ignored) {}
            try {
                if (kotlinTask.hasProperty('compilerOptions')) {
                    def jvmTargetEnum = Class.forName('org.jetbrains.kotlin.gradle.dsl.JvmTarget')
                    def jvm17 = jvmTargetEnum.getMethod('fromTarget', String).invoke(null, '17')
                    kotlinTask.compilerOptions.jvmTarget.set(jvm17)
                }
            } catch (Throwable ignored) {}
        }
    } catch (Throwable ignored) {
        // KotlinCompile class not on the classpath — skip safely.
    }
}

// Re-assert compileOptions inside afterEvaluate so any MABS template
// configuration callback that mutates compileOptions later cannot stomp it.
// SCOPE: only android.compileOptions and JavaCompile tasks. Do NOT iterate
// every task here; doing so crashes AGP 8.x lazy property resolution for
// debug variants.
afterEvaluate { project ->
    if (project.extensions.findByName('android') != null) {
        project.android.compileOptions {
            sourceCompatibility JavaVersion.VERSION_17
            targetCompatibility JavaVersion.VERSION_17
        }
        try {
            project.android.kotlinOptions.jvmTarget = '17'
        } catch (Throwable ignored) {
            // kotlinOptions not exposed on this AGP/Kotlin combo — already
            // covered by the plugins.withId block above.
        }
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
