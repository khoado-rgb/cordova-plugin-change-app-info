#!/usr/bin/env node

/**
 * Fix Universal Links Entitlements for MABS
 * 
 * This hook ensures Associated Domains are written to the correct entitlements files
 * that MABS actually uses during build (Entitlements-Debug.plist and Entitlements-Release.plist)
 * 
 * Hook: after_prepare
 */

const fs = require('fs');
const path = require('path');
const plist = require('plist');

const ASSOCIATED_DOMAINS_KEY = 'com.apple.developer.associated-domains';

module.exports = function(context) {
  const platforms = (context.opts && context.opts.platforms) || [];
  
  if (!platforms.includes('ios')) {
    return;
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  Fix Universal Links Entitlements (MABS)');
  console.log('═══════════════════════════════════════');

  const root = context.opts.projectRoot;
  const iosPath = path.join(root, 'platforms', 'ios');

  if (!fs.existsSync(iosPath)) {
    console.log('   iOS platform not found, skipping');
    console.log('═══════════════════════════════════════\n');
    return;
  }

  // Get project name
  const projectName = findIosProjectName(iosPath);
  if (!projectName) {
    console.log('   Xcode project not found, skipping');
    console.log('═══════════════════════════════════════\n');
    return;
  }

  const projectDir = path.join(iosPath, projectName);

  // Read associated domains from config or existing entitlements
  const associatedDomains = getAssociatedDomains(context, root, iosPath, projectName);

  if (!associatedDomains.length) {
    console.log('   No associated domains found, skipping');
    console.log('═══════════════════════════════════════\n');
    return;
  }

  console.log(`   Found ${associatedDomains.length} associated domain(s):`);
  associatedDomains.forEach(domain => {
    console.log(`     - ${domain}`);
  });

  // MABS explicitly uses these files depending on the build type
  const mabsFiles = [
    'Entitlements-Debug.plist',
    'Entitlements-Release.plist',
    'Entitlements-Production.plist'
  ];

  let processedCount = 0;

  // 1. Force check and create/update MABS-specific plists
  mabsFiles.forEach(fileName => {
    const filePath = path.join(projectDir, fileName);
    if (!fs.existsSync(filePath)) {
      createEntitlementsFile(filePath, associatedDomains);
      console.log(`   ✅ Created: ${path.relative(iosPath, filePath)}`);
      processedCount++;
    } else {
      const result = updateEntitlementsFile(filePath, associatedDomains);
      if (result.processed) {
        processedCount++;
        if (result.updated) {
          console.log(`   ✅ Updated: ${path.relative(iosPath, filePath)}`);
        } else {
          console.log(`   ✅ Already up to date: ${path.relative(iosPath, filePath)}`);
        }
      }
    }
  });

  // 2. Also update the Xcode project default entitlements file if it exists
  const xcodeEntitlements = path.join(projectDir, `${projectName}.entitlements`);
  if (fs.existsSync(xcodeEntitlements)) {
    const result = updateEntitlementsFile(xcodeEntitlements, associatedDomains);
    if (result.processed) {
      processedCount++;
      if (result.updated) {
        console.log(`   ✅ Updated: ${path.relative(iosPath, xcodeEntitlements)}`);
      } else {
        console.log(`   ✅ Already up to date: ${path.relative(iosPath, xcodeEntitlements)}`);
      }
    }
  }

  console.log(`\n   Total: Processed ${processedCount} entitlements file(s)`);
  console.log('═══════════════════════════════════════\n');
};

function findIosProjectName(iosPath) {
  const projects = fs.readdirSync(iosPath)
    .filter(fileName => fileName.endsWith('.xcodeproj'))
    .map(fileName => fileName.replace(/\.xcodeproj$/, ''));

  return projects[0] || null;
}

function getAssociatedDomains(context, root, iosPath, projectName) {
  const domains = [];

  // 1. Primary: read from Cordova preferences (UNIVERSAL_LINKS, UNIVERSAL_LINK_HOSTS, API_HOSTNAME)
  try {
    const { getConfigParser } = require('../utils');
    const configXmlPath = path.join(root, 'config.xml');
    const configParser = getConfigParser(context, configXmlPath);

    // Helper: parse a preference value into one or more "applinks:host" entries
    const parseHostsFromPref = (value) => {
      if (!value) return [];
      const results = [];
      // Support JSON array/object format: ["host1", "host2"] or {"hosts":["host1"]}
      try {
        const parsed = JSON.parse(value);
        const entries = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed && parsed.hosts)
            ? parsed.hosts
            : [parsed];
        entries.forEach(entry => {
          const host = typeof entry === 'string'
            ? entry
            : (entry && (entry.host || entry.name || entry.domain || entry.url));
          if (host) {
            // Strip protocol and path
            const clean = String(host)
              .replace(/^applinks:/i, '')
              .replace(/^https?:\/\//i, '')
              .replace(/\/.*$/, '')
              .replace(/:\d+$/, '')
              .trim();
            if (clean) results.push(`applinks:${clean}`);
          }
        });
        return results;
      } catch (_) {
        // Plain text: comma/newline/semicolon separated hostnames or URLs
      }
      return value
        .split(/[\n,;]+/)
        .map(entry => entry.trim())
        .filter(Boolean)
        .map(entry => {
          const clean = entry
            .replace(/^applinks:/i, '')
            .replace(/^https?:\/\//i, '')
            .replace(/\/.*$/, '')
            .replace(/:\d+$/, '')
            .trim();
          return clean ? `applinks:${clean}` : null;
        })
        .filter(Boolean);
    };

    // Check UNIVERSAL_LINKS and UNIVERSAL_LINK_HOSTS (global + ios-specific)
    const prefNames = ['UNIVERSAL_LINKS', 'UNIVERSAL_LINK_HOSTS'];
    const platforms = [undefined, 'ios'];
    for (const prefName of prefNames) {
      for (const platform of platforms) {
        const val = platform
          ? configParser.getPreference(prefName, platform)
          : configParser.getPreference(prefName);
        if (val) {
          domains.push(...parseHostsFromPref(val));
        }
      }
    }

    // Fallback: use API_HOSTNAME when no explicit universal links config
    if (domains.length === 0) {
      const apiHostname = configParser.getPreference('API_HOSTNAME');
      if (apiHostname) {
        const clean = String(apiHostname)
          .replace(/^https?:\/\//i, '')
          .replace(/\/.*$/, '')
          .replace(/:\d+$/, '')
          .trim();
        if (clean) {
          console.log(`   Using API_HOSTNAME as associated domain: ${clean}`);
          domains.push(`applinks:${clean}`);
        }
      }
    }
  } catch (error) {
    console.log(`   Could not read config preferences: ${error.message}`);
  }

  // 2. Secondary: merge any domains already present in existing entitlements files
  //    (preserves manually added entitlements that may have been set outside this plugin)
  const existingFiles = [
    path.join(iosPath, projectName, `${projectName}.entitlements`),
    path.join(iosPath, projectName, 'Entitlements-Debug.plist')
  ];

  for (const filePath of existingFiles) {
    if (fs.existsSync(filePath)) {
      try {
        const content = plist.parse(fs.readFileSync(filePath, 'utf8'));
        if (content && Array.isArray(content[ASSOCIATED_DOMAINS_KEY])) {
          domains.push(...content[ASSOCIATED_DOMAINS_KEY]);
        }
      } catch (_) {
        // Ignore parse errors on malformed plists
      }
    }
  }

  return Array.from(new Set(domains.filter(Boolean)));
}

function updateEntitlementsFile(filePath, associatedDomains) {
  if (!fs.existsSync(filePath)) {
    return { processed: false, updated: false };
  }

  try {
    const content = plist.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (!content || typeof content !== 'object') {
      return { processed: false, updated: false };
    }

    // Update or add associated domains
    const currentDomains = Array.isArray(content[ASSOCIATED_DOMAINS_KEY])
      ? content[ASSOCIATED_DOMAINS_KEY]
      : [];

    const mergedDomains = Array.from(new Set([...currentDomains, ...associatedDomains]));
    
    // Only update if changed
    if (JSON.stringify(currentDomains.sort()) === JSON.stringify(mergedDomains.sort())) {
      return { processed: true, updated: false };
    }

    content[ASSOCIATED_DOMAINS_KEY] = mergedDomains;

    // Write back
    fs.writeFileSync(filePath, plist.build(content), 'utf8');
    return { processed: true, updated: true };
  } catch (error) {
    console.log(`   Error updating ${path.basename(filePath)}: ${error.message}`);
    return { processed: false, updated: false };
  }
}

function createEntitlementsFile(filePath, associatedDomains) {
  const entitlements = {
    [ASSOCIATED_DOMAINS_KEY]: associatedDomains
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, plist.build(entitlements), 'utf8');
}
