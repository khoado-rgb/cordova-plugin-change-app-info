#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { getConfigParser } = require('../utils');

const FULL_BACKUP_REF = '@xml/change_app_info_full_backup_content';
const DATA_EXTRACTION_REF = '@xml/change_app_info_data_extraction_rules';

function escapeXmlAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getXmlPathFromRef(resXmlDir, xmlRef) {
  const match = /^@xml\/([A-Za-z0-9_]+)$/.exec(xmlRef || '');
  if (!match) {
    return null;
  }
  return path.join(resXmlDir, `${match[1]}.xml`);
}

function ensureManifestAttribute(manifestContent, attrName, defaultRef) {
  const attrPattern = new RegExp(`android:${attrName}\\s*=\\s*"([^"]+)"`);
  const existing = manifestContent.match(attrPattern);
  if (existing) {
    return {
      content: manifestContent,
      ref: existing[1],
      changed: false
    };
  }

  const updated = manifestContent.replace(
    /<application\b([^>]*)>/,
    `<application$1 android:${attrName}="${defaultRef}">`
  );

  return {
    content: updated,
    ref: defaultRef,
    changed: updated !== manifestContent
  };
}

function ensureFullBackupContent(filePath, prefsFileName) {
  const excludeLine = `    <exclude domain="sharedpref" path="${escapeXmlAttribute(prefsFileName)}" />`;
  let content;

  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(`path="${escapeXmlAttribute(prefsFileName)}"`)) {
      return false;
    }
    if (content.includes('</full-backup-content>')) {
      content = content.replace('</full-backup-content>', `${excludeLine}\n</full-backup-content>`);
    } else {
      throw new Error(`Invalid full-backup-content XML: ${filePath}`);
    }
  } else {
    content = `<?xml version="1.0" encoding="utf-8"?>\n<full-backup-content>\n${excludeLine}\n</full-backup-content>\n`;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

function ensureDataExtractionRules(filePath, prefsFileName) {
  const excludeLine = `        <exclude domain="sharedpref" path="${escapeXmlAttribute(prefsFileName)}" />`;
  let content;

  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(`path="${escapeXmlAttribute(prefsFileName)}"`)) {
      return false;
    }

    let inserted = false;
    content = content.replace(/<\/cloud-backup>/, `${excludeLine}\n    </cloud-backup>`);
    inserted = content.includes(`${excludeLine}\n    </cloud-backup>`);

    if (content.includes('</device-transfer>')) {
      content = content.replace(/<\/device-transfer>/, `${excludeLine}\n    </device-transfer>`);
    } else {
      content = content.replace(
        '</data-extraction-rules>',
        `    <device-transfer>\n${excludeLine}\n    </device-transfer>\n</data-extraction-rules>`
      );
    }

    if (!inserted && content.includes('</data-extraction-rules>')) {
      content = content.replace(
        '</data-extraction-rules>',
        `    <cloud-backup>\n${excludeLine}\n    </cloud-backup>\n</data-extraction-rules>`
      );
    }
  } else {
    content = `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n    <cloud-backup>\n${excludeLine}\n    </cloud-backup>\n    <device-transfer>\n${excludeLine}\n    </device-transfer>\n</data-extraction-rules>\n`;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

module.exports = function(context) {
  if (!context.opts.platforms || !context.opts.platforms.includes('android')) {
    return;
  }

  const root = context.opts.projectRoot;
  const androidMainPath = path.join(root, 'platforms/android/app/src/main');
  const manifestPath = path.join(androidMainPath, 'AndroidManifest.xml');
  const resXmlDir = path.join(androidMainPath, 'res/xml');

  console.log('\n══════════════════════════════════════════════');
  console.log('  CONFIGURE ANDROID BACKUP RULES');
  console.log('══════════════════════════════════════════════');

  if (!fs.existsSync(manifestPath)) {
    console.log('   ⚠️  AndroidManifest.xml not found, skipping backup rules');
    return;
  }

  const config = getConfigParser(context, path.join(root, 'config.xml'));
  const packageName = config.packageName();
  if (!packageName) {
    console.log('   ⚠️  Package name not found, skipping backup rules');
    return;
  }

  const prefsFileName = `${packageName}.SecureTotpPrefs.xml`;
  let manifestContent = fs.readFileSync(manifestPath, 'utf8');

  const fullBackup = ensureManifestAttribute(manifestContent, 'fullBackupContent', FULL_BACKUP_REF);
  manifestContent = fullBackup.content;

  const dataExtraction = ensureManifestAttribute(manifestContent, 'dataExtractionRules', DATA_EXTRACTION_REF);
  manifestContent = dataExtraction.content;

  if (fullBackup.changed || dataExtraction.changed) {
    fs.writeFileSync(manifestPath, manifestContent, 'utf8');
    console.log('   ✅ AndroidManifest.xml backup attributes configured');
  } else {
    console.log('   ℹ️  AndroidManifest.xml already has backup attributes');
  }

  const fullBackupPath = getXmlPathFromRef(resXmlDir, fullBackup.ref);
  const dataExtractionPath = getXmlPathFromRef(resXmlDir, dataExtraction.ref);

  if (fullBackupPath) {
    const changed = ensureFullBackupContent(fullBackupPath, prefsFileName);
    console.log(`   ${changed ? '✅' : 'ℹ️ '} fullBackupContent excludes ${prefsFileName}`);
  } else {
    console.log(`   ⚠️  fullBackupContent is not an @xml resource (${fullBackup.ref}); add an exclude for ${prefsFileName} manually`);
  }

  if (dataExtractionPath) {
    const changed = ensureDataExtractionRules(dataExtractionPath, prefsFileName);
    console.log(`   ${changed ? '✅' : 'ℹ️ '} dataExtractionRules excludes ${prefsFileName}`);
  } else {
    console.log(`   ⚠️  dataExtractionRules is not an @xml resource (${dataExtraction.ref}); add an exclude for ${prefsFileName} manually`);
  }

  console.log('══════════════════════════════════════════════\n');
};
