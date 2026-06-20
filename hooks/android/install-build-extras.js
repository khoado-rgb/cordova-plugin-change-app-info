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

const MARKER = '// CHANGE_APP_INFO_BUILD_EXTRAS v4';

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

        // Ensure the debug signingConfig has a usable storeFile. On MABS +
        // cordova-android 14, the build worker only provisions the release
        // keystore; the debug signingConfig is left with a null storeFile
        // Property, so 'cdvBuildDebug' fails during dependency resolution
        // with: Could not determine the dependencies of task ':app:packageDebug'.
        //       > Cannot query the value of this property because it has no value available.
        // Fall back to ~/.android/debug.keystore (AGP convention) — auto-create
        // it with keytool when missing (clean MABS worker may not have one).
        try {
            def debugCfg = project.android.signingConfigs.findByName('debug')
            if (debugCfg != null) {
                def hasStoreFile = false
                try { hasStoreFile = debugCfg.storeFile != null } catch (Throwable ignored2) {}
                if (!hasStoreFile) {
                    def home = System.getProperty('user.home')
                    def ksFile = new File(home, '.android/debug.keystore')
                    if (!ksFile.exists()) {
                        ksFile.parentFile.mkdirs()
                        def keytool = System.getProperty('java.home') + '/bin/keytool'
                        project.exec {
                            commandLine keytool,
                                '-genkeypair', '-v',
                                '-keystore', ksFile.absolutePath,
                                '-storepass', 'android',
                                '-alias', 'androiddebugkey',
                                '-keypass', 'android',
                                '-dname', 'CN=Android Debug,O=Android,C=US',
                                '-keyalg', 'RSA',
                                '-keysize', '2048',
                                '-validity', '10000'
                            standardOutput = new ByteArrayOutputStream()
                            errorOutput = new ByteArrayOutputStream()
                            ignoreExitValue = true
                        }
                    }
                    if (ksFile.exists()) {
                        debugCfg.storeFile = ksFile
                        debugCfg.storePassword = 'android'
                        debugCfg.keyAlias = 'androiddebugkey'
                        debugCfg.keyPassword = 'android'
                        logger.lifecycle("CDV: bound debug signingConfig to \${ksFile.absolutePath}")
                    }
                }
            }
        } catch (Throwable t) {
            logger.warn("CDV: could not bind debug signingConfig: \${t.message}")
        }
    }
}
`;

module.exports = function (context) {
  if (!context.opts.platforms || !context.opts.platforms.includes('android')) {
    return;
  }

  const root = context.opts.projectRoot;
  const androidDir = path.join(root, 'platforms', 'android');
  const targetPath = path.join(androidDir, 'app', 'build-extras.gradle');
  const targetDir = path.dirname(targetPath);

  if (!fs.existsSync(targetDir)) {
    console.log(`   ⚠️  ${targetDir} not found, skipping build-extras install`);
    return;
  }

  let wroteFile = false;
  if (fs.existsSync(targetPath)) {
    const existing = fs.readFileSync(targetPath, 'utf8');
    if (existing.includes(MARKER)) {
      console.log('   ✓ app/build-extras.gradle already at current version');
    } else {
      console.log('   ♻️  Overwriting older app/build-extras.gradle');
      fs.writeFileSync(targetPath, CONTENT, 'utf8');
      wroteFile = true;
    }
  } else {
    fs.writeFileSync(targetPath, CONTENT, 'utf8');
    wroteFile = true;
  }

  if (wroteFile) {
    console.log(`   ✅ Wrote ${targetPath}`);
    console.log('      → compileOptions = JavaVersion.VERSION_17 (forced via afterEvaluate)');
    console.log('      → Kotlin/kapt tasks jvmTarget = 17 (forced via afterEvaluate)');
    console.log('      → debug signingConfig fallback to ~/.android/debug.keystore');
  }

  // Append stacktrace logging to gradle.properties so any future Gradle
  // failure (e.g. "Cannot query the value of this property because it has no
  // value available") prints the exact property class and source location.
  // Without this, MABS' gradle invocation gives no stacktrace and the root
  // cause cannot be determined from the build log alone.
  const propsPath = path.join(androidDir, 'gradle.properties');
  const STACKTRACE_MARKER = '# CHANGE_APP_INFO_DIAG';
  const STACKTRACE_BLOCK = `\n${STACKTRACE_MARKER}\norg.gradle.logging.stacktrace=full\n`;
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
