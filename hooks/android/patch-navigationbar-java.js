#!/usr/bin/env node

/**
 * Patch OutSystems NavigationBar generated Java for MABS debug builds.
 *
 * Some MABS templates generate OSNavigationBar.java with Java 10 `var`
 * declarations while the Android compile task still uses source/target 8.
 * This hook keeps the generated source Java 8-compatible.
 */

const fs = require('fs');
const path = require('path');

function findNavigationBarFiles(root) {
  const sourceRoot = path.join(root, 'platforms/android/app/src/main/java');
  const matches = [];

  if (!fs.existsSync(sourceRoot)) {
    return matches;
  }

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name === 'OSNavigationBar.java') {
        matches.push(fullPath);
      }
    }
  }

  walk(sourceRoot);
  return matches;
}

function patchNavigationBarFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  const patched = original
    .replace(
      /^(\s*)var\s+context\s*=\s*cordova\.getContext\(\);\s*$/m,
      '$1android.content.Context context = cordova.getContext();'
    )
    .replace(
      /^(\s*)var\s+resources\s*=\s*context\.getResources\(\);\s*$/m,
      '$1android.content.res.Resources resources = context.getResources();'
    );

  if (patched === original) {
    return false;
  }

  fs.writeFileSync(filePath, patched, 'utf8');
  return true;
}

module.exports = function(context) {
  const platforms = context.opts.platforms;
  if (!platforms || !platforms.includes('android')) {
    return;
  }

  const root = context.opts.projectRoot;
  const files = findNavigationBarFiles(root);

  for (const filePath of files) {
    if (patchNavigationBarFile(filePath)) {
      console.log(`   Patched Java 10 var usage in ${path.relative(root, filePath)}`);
    }
  }
};
