#!/usr/bin/env node

/**
 * Install Android build-extras.gradle
 *
 * MABS' generated Android template can still pin Java/Kotlin compilation to
 * 1.8 while bundled plugins use Java 10+ `var`. We fix that without touching
 * AGP's Android extension at Gradle configuration time, because AGP 8.x lazy
 * providers can fail during :app:packageDebug dependency graph assembly.
 */

const fs = require('fs');
const path = require('path');

const MARKER = '// CHANGE_APP_INFO_BUILD_EXTRAS v11';

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
// IMPORTANT: this file deliberately never calls android {}, project.android,
// signingConfig, applicationVariants, variantFilter, or afterEvaluate. MABS
// debug builds run Gradle with --parallel, and touching AGP lazy providers
// during configuration can produce:
//   Could not determine the dependencies of task ':app:packageDebug'.
//   > Cannot query the value of this property because it has no value available.

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
def configureChangeAppInfoKotlin17 = {
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

project.plugins.withId('org.jetbrains.kotlin.android') { configureChangeAppInfoKotlin17() }
project.plugins.withId('kotlin-android') { configureChangeAppInfoKotlin17() }

`;

function patchGeneratedAppBuildGradle(androidDir) {
  const appBuildGradle = path.join(androidDir, 'app', 'build.gradle');

  if (!fs.existsSync(appBuildGradle)) {
    return { found: false, changed: false };
  }

  const original = fs.readFileSync(appBuildGradle, 'utf8');
  let content = original;

  content = content.replace(
    /(sourceCompatibility\s*(?:=)?\s*)JavaVersion\.VERSION_(?:1_8|8|11|17)/g,
    '$1JavaVersion.VERSION_17'
  );
  content = content.replace(
    /(targetCompatibility\s*(?:=)?\s*)JavaVersion\.VERSION_(?:1_8|8|11|17)/g,
    '$1JavaVersion.VERSION_17'
  );
  content = content.replace(
    /(jvmTarget\s*=\s*['"])(?:1\.8|8|11|17)(['"])/g,
    (_match, prefix, quote) => `${prefix}17${quote}`
  );

  if (content !== original) {
    fs.writeFileSync(appBuildGradle, content, 'utf8');
    return { found: true, changed: true };
  }

  return { found: true, changed: false };
}

module.exports = function (context) {
  if (!context.opts.platforms || !context.opts.platforms.includes('android')) {
    return;
  }

  const root = context.opts.projectRoot;
  const androidDir = path.join(root, 'platforms', 'android');
  const buildGradlePatch = patchGeneratedAppBuildGradle(androidDir);
  const targetPath = path.join(androidDir, 'app', 'build-extras.gradle');
  const targetDir = path.dirname(targetPath);

  if (!fs.existsSync(targetDir)) {
    console.log(`   ⚠️  ${targetDir} not found, skipping build-extras install`);
    return;
  }

  if (fs.existsSync(targetPath)) {
    console.log('   ♻️  Rewriting app/build-extras.gradle deterministically');
  }

  fs.writeFileSync(targetPath, CONTENT, 'utf8');
  console.log(`   ✅ Wrote ${targetPath}`);
  if (buildGradlePatch.changed) {
    console.log('      → patched app/build.gradle Java/Kotlin targets to 17');
  } else if (buildGradlePatch.found) {
    console.log('      → app/build.gradle already has Java/Kotlin target overrides');
  } else {
    console.log('      → app/build.gradle not found for direct patch');
  }
  console.log('      → build-extras uses task-level Java/Kotlin configuration only');
  console.log('      → release variant is left intact (no variantFilter)');
  console.log('      → no android/signingConfig/applicationVariants access is applied');

  // Append stacktrace logging + disable --parallel to gradle.properties.
  // org.gradle.parallel=false works around an AGP 8.x bug where running
  // `gradlew --parallel cdvBuildDebug` leaks an unresolved lazy Provider
  // query from a concurrently configured task into :app:packageDebug's
  // dependency resolution, producing:
  //   Could not determine the dependencies of task ':app:packageDebug'.
  //   > Cannot query the value of this property because it has no value available.
  // The Gradle daemon's --parallel CLI flag overrides gradle.properties, so
  // we cannot disable parallelism just from the properties file; instead
  // also disable per-project task parallelism via
  // org.gradle.workers.max=1 which AGP respects even with --parallel.
  const propsPath = path.join(androidDir, 'gradle.properties');
  const STACKTRACE_MARKER = '# CHANGE_APP_INFO_DIAG';
  const STACKTRACE_BLOCK = `\n${STACKTRACE_MARKER}\norg.gradle.logging.stacktrace=full\norg.gradle.parallel=false\norg.gradle.workers.max=1\n`;
  try {
    let propsContent = fs.existsSync(propsPath) ? fs.readFileSync(propsPath, 'utf8') : '';
    if (!propsContent.includes(STACKTRACE_MARKER)) {
      fs.writeFileSync(propsPath, propsContent + STACKTRACE_BLOCK, 'utf8');
      console.log(`   ✅ Enabled org.gradle.logging.stacktrace=full in ${propsPath}`);
    }
  } catch (e) {
    console.log(`   ⚠️  could not patch gradle.properties: ${e.message}`);
  }
};
