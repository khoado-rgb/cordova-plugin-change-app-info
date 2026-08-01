#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const plist = require('plist');
const { getConfigParser } = require('./utils');

const MARKER_START = '<!-- cordova-plugin-change-app-info universal-links:start -->';
const MARKER_END = '<!-- cordova-plugin-change-app-info universal-links:end -->';
const ASSOCIATED_DOMAINS_KEY = 'com.apple.developer.associated-domains';
const DEFAULT_SCHEME = 'https';

module.exports = async function registerUniversalLinks(context) {
  const platforms = (context.opts && context.opts.platforms) || [];

  if (!platforms.includes('android') && !platforms.includes('ios')) {
    return;
  }

  console.log('\n=======================================');
  console.log('  Universal Links Registration');
  console.log('=======================================');

  const root = context.opts.projectRoot;
  const config = readUniversalLinksConfig(context, root);

  if (!config.hosts.length) {
    console.log('   No universal links configured, skipping');
    console.log('=======================================\n');
    return;
  }

  console.log(`   Found ${config.hosts.length} host(s)`);

  if (platforms.includes('android')) {
    registerAndroidUniversalLinks(root, config.hosts);
  }

  if (platforms.includes('ios')) {
    registerIosUniversalLinks(root, config.hosts);
  }

  console.log('=======================================\n');
};

function readUniversalLinksConfig(context, root) {
  const configXmlPath = path.join(root, 'config.xml');
  const configXml = fs.existsSync(configXmlPath) ? fs.readFileSync(configXmlPath, 'utf8') : '';
  const hosts = [];

  hosts.push(...readXmlUniversalLinks(configXml));
  hosts.push(...readPreferenceUniversalLinks(context, configXmlPath));

  return {
    hosts: normalizeHosts(hosts)
  };
}

function readPreferenceUniversalLinks(context, configXmlPath) {
  let configParser;

  try {
    configParser = getConfigParser(context, configXmlPath);
  } catch (error) {
    console.log(`   Could not read Cordova preferences: ${error.message}`);
    return [];
  }

  const values = [
    ...getPreferenceValues(configParser, 'UNIVERSAL_LINKS'),
    ...getPreferenceValues(configParser, 'UNIVERSAL_LINK_HOSTS')
  ];

  const hosts = values.flatMap(parseUniversalLinksPreference);

  // Fallback: use API_HOSTNAME as universal link host if no explicit config
  if (!hosts.length) {
    const apiHostname = configParser.getPreference('API_HOSTNAME');
    if (apiHostname) {
      console.log(`   Using API_HOSTNAME as universal link host: ${apiHostname}`);
      hosts.push(...parseUniversalLinksPreference(apiHostname));
    }
  }

  return hosts;
}

function getPreferenceValues(configParser, name) {
  return unique([
    configParser.getPreference(name),
    configParser.getPreference(name, 'android'),
    configParser.getPreference(name, 'ios')
  ]);
}

function readXmlUniversalLinks(configXml) {
  if (!configXml) {
    return [];
  }

  const hosts = [];
  const xml = stripXmlComments(configXml);
  const blockRegex = /<universal-links\b[^>]*>([\s\S]*?)<\/universal-links>/gi;
  let blockMatch;

  while ((blockMatch = blockRegex.exec(xml)) !== null) {
    const block = blockMatch[1];
    const hostRegex = /<host\b([^>]*?)(?:\/>|>([\s\S]*?)<\/host>)/gi;
    let hostMatch;

    while ((hostMatch = hostRegex.exec(block)) !== null) {
      const attrs = parseXmlAttributes(hostMatch[1]);
      const name = attrs.name || attrs.host || attrs.domain;

      if (!name) {
        continue;
      }

      hosts.push({
        name,
        scheme: attrs.scheme || DEFAULT_SCHEME,
        paths: parseXmlPaths(hostMatch[2])
      });
    }
  }

  return hosts;
}

function parseXmlPaths(hostBody) {
  if (!hostBody) {
    return ['*'];
  }

  const paths = [];
  const pathRegex = /<path\b([^>]*?)(?:\/>|>[\s\S]*?<\/path>)/gi;
  let pathMatch;

  while ((pathMatch = pathRegex.exec(hostBody)) !== null) {
    const attrs = parseXmlAttributes(pathMatch[1]);
    if (attrs.url || attrs.path) {
      paths.push(attrs.url || attrs.path);
    }
  }

  return paths.length ? paths : ['*'];
}

function parseUniversalLinksPreference(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return [];
  }

  const parsedJson = parseJsonPreference(raw);
  if (parsedJson) {
    return parseJsonUniversalLinks(parsedJson);
  }

  return raw
    .split(/[\n,;]+/)
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(parseUniversalLinkString)
    .filter(Boolean);
}

function parseJsonPreference(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function parseJsonUniversalLinks(value) {
  if (Array.isArray(value)) {
    return value.map(parseJsonHost).filter(Boolean);
  }

  if (value && Array.isArray(value.hosts)) {
    return value.hosts.map(parseJsonHost).filter(Boolean);
  }

  const host = parseJsonHost(value);
  return host ? [host] : [];
}

function parseJsonHost(value) {
  if (typeof value === 'string') {
    return parseUniversalLinkString(value);
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const name = value.host || value.name || value.domain;

  if (!name) {
    return value.url ? parseUniversalLinkString(value.url) : null;
  }

  return {
    name,
    scheme: value.scheme || DEFAULT_SCHEME,
    paths: normalizePathList(value.paths || value.path || '*')
  };
}

function parseUniversalLinkString(entry) {
  const value = entry.trim();

  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return {
        name: url.hostname,
        scheme: url.protocol.replace(':', ''),
        paths: [url.pathname && url.pathname !== '/' ? url.pathname : '*']
      };
    } catch (error) {
      return null;
    }
  }

  const slashIndex = value.indexOf('/');
  const name = slashIndex >= 0 ? value.slice(0, slashIndex) : value;
  const linkPath = slashIndex >= 0 ? value.slice(slashIndex) : '*';

  return {
    name,
    scheme: DEFAULT_SCHEME,
    paths: [linkPath]
  };
}

function normalizeHosts(hosts) {
  const grouped = new Map();

  hosts.forEach(host => {
    const name = normalizeHostName(host.name);
    const scheme = normalizeScheme(host.scheme);

    if (!name || !scheme) {
      return;
    }

    const key = `${scheme}://${name}`;
    const existing = grouped.get(key) || { name, scheme, paths: [] };

    normalizePathList(host.paths).forEach(linkPath => {
      if (!existing.paths.includes(linkPath)) {
        existing.paths.push(linkPath);
      }
    });

    grouped.set(key, existing);
  });

  return Array.from(grouped.values());
}

function normalizeHostName(name) {
  return String(name || '')
    .trim()
    .replace(/^applinks:/i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .toLowerCase();
}

function normalizeScheme(scheme) {
  const normalized = String(scheme || DEFAULT_SCHEME).trim().toLowerCase();
  return normalized === 'http' || normalized === 'https' ? normalized : null;
}

function normalizePathList(paths) {
  const list = Array.isArray(paths) ? paths : [paths];
  const normalized = list
    .map(normalizePath)
    .filter(Boolean);

  return normalized.length ? normalized : ['*'];
}

function normalizePath(linkPath) {
  const value = String(linkPath || '*').trim();

  if (!value || value === '*') {
    return '*';
  }

  const cleanValue = value.replace(/[?#].*$/, '');
  return cleanValue.startsWith('/') ? cleanValue : `/${cleanValue}`;
}

function registerAndroidUniversalLinks(root, hosts) {
  const manifestPath = findAndroidManifestPath(root);

  console.log('\n   Android');

  if (!manifestPath) {
    console.log('   AndroidManifest.xml not found, skipping');
    return;
  }

  const originalContent = fs.readFileSync(manifestPath, 'utf8');
  const cleanContent = removeGeneratedAndroidFilters(originalContent);
  const mainActivity = findMainActivityBlock(cleanContent);

  if (!mainActivity) {
    console.log('   Launch activity not found, skipping');
    return;
  }

  const filters = buildAndroidIntentFilters(hosts);
  const updatedActivity = insertIntoActivity(mainActivity.block, filters);
  const updatedContent = cleanContent.slice(0, mainActivity.start) +
    updatedActivity +
    cleanContent.slice(mainActivity.end);

  if (updatedContent !== originalContent) {
    fs.writeFileSync(manifestPath, updatedContent, 'utf8');
    console.log(`   Registered ${countAndroidPaths(hosts)} intent-filter(s)`);
  } else {
    console.log('   AndroidManifest.xml already up to date');
  }
}

function findAndroidManifestPath(root) {
  const candidates = [
    path.join(root, 'platforms', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    path.join(root, 'platforms', 'android', 'AndroidManifest.xml')
  ];

  return candidates.find(candidate => fs.existsSync(candidate));
}

function removeGeneratedAndroidFilters(content) {
  const markerPattern = new RegExp(`\\s*${escapeRegex(MARKER_START)}[\\s\\S]*?${escapeRegex(MARKER_END)}`, 'g');
  return content.replace(markerPattern, '');
}

function findMainActivityBlock(cleanContent) {
  // Strip XML comments before searching so that a </activity> inside a comment
  // does not fool the regex into ending the block prematurely.  We search on the
  // stripped copy to find the right block, then map the indices back to the
  // original (unstripped) content so slicing stays correct.
  const strippedForSearch = stripXmlComments(cleanContent);
  const activityRegex = /<activity\b[\s\S]*?<\/activity>/gi;
  let match;
  let fallback;

  while ((match = activityRegex.exec(strippedForSearch)) !== null) {
    const strippedBlock = match[0];

    // Locate the same activity in the original content via its opening tag.
    const openTagMatch = strippedBlock.match(/^(<activity\b[^>]*(?:\/>|>))/i);
    if (!openTagMatch) {
      continue;
    }

    const startIdx = cleanContent.indexOf(openTagMatch[1]);
    if (startIdx === -1) {
      continue;
    }

    // Find the real </activity> closing tag by skipping over XML comments.
    const fromStart = cleanContent.slice(startIdx);
    let searchFrom = 0;
    let endIdx = -1;

    while (true) {
      const commentStart = fromStart.indexOf('<!--', searchFrom);
      const closeTag = fromStart.indexOf('</activity>', searchFrom);

      if (closeTag === -1) {
        break;
      }

      if (commentStart !== -1 && commentStart < closeTag) {
        // A comment opens before the next closing tag — skip past it.
        const commentEnd = fromStart.indexOf('-->', commentStart);
        if (commentEnd === -1) {
          break;
        }
        searchFrom = commentEnd + 3;
      } else {
        endIdx = startIdx + closeTag + '</activity>'.length;
        break;
      }
    }

    if (endIdx === -1) {
      continue;
    }

    const block = cleanContent.slice(startIdx, endIdx);
    const activity = { block, start: startIdx, end: endIdx };

    if (isLauncherActivity(block)) {
      return activity;
    }

    if (!fallback && /android:name=["'][^"']*MainActivity[^"']*["']/i.test(block)) {
      fallback = activity;
    }
  }

  return fallback || null;
}

function isLauncherActivity(activityBlock) {
  const stripped = stripXmlComments(activityBlock);
  return stripped.includes('android.intent.action.MAIN') &&
         stripped.includes('android.intent.category.LAUNCHER');
}

function buildAndroidIntentFilters(hosts) {
  const filters = [];

  hosts.forEach(host => {
    host.paths.forEach(linkPath => {
      filters.push(buildAndroidIntentFilter(host, linkPath));
    });
  });

  return `\n        ${MARKER_START}\n${filters.join('\n')}\n        ${MARKER_END}`;
}

function buildAndroidIntentFilter(host, linkPath) {
  const dataAttributes = {
    'android:scheme': host.scheme,
    'android:host': host.name
  };

  addAndroidPathAttribute(dataAttributes, linkPath);

  const dataAttrs = Object.keys(dataAttributes)
    .map(name => `${name}="${escapeXmlAttribute(dataAttributes[name])}"`)
    .join(' ');

  return [
    '        <intent-filter android:autoVerify="true">',
    '            <action android:name="android.intent.action.VIEW" />',
    '            <category android:name="android.intent.category.DEFAULT" />',
    '            <category android:name="android.intent.category.BROWSABLE" />',
    `            <data ${dataAttrs} />`,
    '        </intent-filter>'
  ].join('\n');
}

function addAndroidPathAttribute(dataAttributes, linkPath) {
  if (!linkPath || linkPath === '*') {
    return;
  }

  if (linkPath.includes('*')) {
    dataAttributes['android:pathPattern'] = linkPath.replace(/\*/g, '.*');
    return;
  }

  dataAttributes['android:path'] = linkPath;
}

function insertIntoActivity(activityBlock, contentToInsert) {
  const updated = activityBlock.replace(/\s*<\/activity>\s*$/i, `${contentToInsert}\n    </activity>`);

  if (updated === activityBlock) {
    console.warn('   ⚠️  Could not find </activity> closing tag — intent-filter was not inserted');
  }

  return updated;
}

function countAndroidPaths(hosts) {
  return hosts.reduce((total, host) => total + host.paths.length, 0);
}

function registerIosUniversalLinks(root, hosts) {
  const iosPath = path.join(root, 'platforms', 'ios');

  console.log('\n   iOS');

  if (!fs.existsSync(iosPath)) {
    console.log('   iOS platform not found, skipping');
    return;
  }

  const projectName = findIosProjectName(iosPath);

  if (!projectName) {
    console.log('   Xcode project not found, skipping');
    return;
  }

  const pbxprojPath = path.join(iosPath, `${projectName}.xcodeproj`, 'project.pbxproj');
  const entitlementsPath = resolveEntitlementsPath(iosPath, projectName, pbxprojPath);
  const associatedDomains = unique(hosts.map(host => `applinks:${host.name}`));

  writeAssociatedDomainsEntitlements(entitlementsPath, associatedDomains);
  updateXcodeEntitlementsSetting(pbxprojPath, iosPath, entitlementsPath);

  console.log(`   Registered ${associatedDomains.length} associated domain(s)`);
}

function findIosProjectName(iosPath) {
  const projects = fs.readdirSync(iosPath)
    .filter(fileName => fileName.endsWith('.xcodeproj'))
    .map(fileName => fileName.replace(/\.xcodeproj$/, ''));

  return projects[0] || null;
}

function resolveEntitlementsPath(iosPath, projectName, pbxprojPath) {
  const defaultPath = path.join(iosPath, projectName, `${projectName}.entitlements`);

  if (!fs.existsSync(pbxprojPath)) {
    return defaultPath;
  }

  const pbxContent = fs.readFileSync(pbxprojPath, 'utf8');

  // Match all occurrences — MABS pbxproj has one entry per build configuration
  // (e.g. Debug, Release) which may differ in format.
  // Patterns seen in the wild:
  //   CODE_SIGN_ENTITLEMENTS = App/App.entitlements;
  //   CODE_SIGN_ENTITLEMENTS = "App/App.entitlements";
  //   CODE_SIGN_ENTITLEMENTS = "$(PROJECT_DIR)/App/App.entitlements";
  //   CODE_SIGN_ENTITLEMENTS = $(PRODUCT_NAME)/$(PRODUCT_NAME).entitlements;
  const entitlementRegex = /CODE_SIGN_ENTITLEMENTS\s*=\s*"?([^";\n]+?)"?\s*;/g;
  const candidates = [];
  let m;

  while ((m = entitlementRegex.exec(pbxContent)) !== null) {
    let raw = m[1].trim();

    // Resolve common Xcode build variable substitutions
    raw = raw
      .replace(/\$\(PROJECT_DIR\)\//gi, '')   // $(PROJECT_DIR)/ → relative to iosPath
      .replace(/\$\(PRODUCT_NAME\)/gi, projectName)
      .replace(/\$\(TARGET_NAME\)/gi, projectName)
      .trim();

    // Skip if unresolvable variables remain
    if (raw.includes('$(')) {
      continue;
    }

    const resolved = path.join(iosPath, raw);
    candidates.push(resolved);
  }

  // Prefer first candidate whose file already exists; otherwise first candidate
  const existing = candidates.find(p => fs.existsSync(p));
  if (existing) {
    return existing;
  }

  if (candidates.length > 0) {
    return candidates[0];
  }

  return defaultPath;
}

function writeAssociatedDomainsEntitlements(entitlementsPath, associatedDomains) {
  const entitlements = readEntitlements(entitlementsPath);
  const currentDomains = Array.isArray(entitlements[ASSOCIATED_DOMAINS_KEY])
    ? entitlements[ASSOCIATED_DOMAINS_KEY]
    : [];

  entitlements[ASSOCIATED_DOMAINS_KEY] = unique(currentDomains.concat(associatedDomains));

  fs.mkdirSync(path.dirname(entitlementsPath), { recursive: true });
  fs.writeFileSync(entitlementsPath, plist.build(entitlements), 'utf8');
}

function readEntitlements(entitlementsPath) {
  if (!fs.existsSync(entitlementsPath)) {
    return {};
  }

  try {
    return plist.parse(fs.readFileSync(entitlementsPath, 'utf8')) || {};
  } catch (error) {
    console.log(`   Could not parse existing entitlements, recreating: ${error.message}`);
    return {};
  }
}

function updateXcodeEntitlementsSetting(pbxprojPath, iosPath, entitlementsPath) {
  if (!fs.existsSync(pbxprojPath)) {
    console.log('   project.pbxproj not found; entitlements file created only');
    return;
  }

  const relativePath = path.relative(iosPath, entitlementsPath).split(path.sep).join('/');
  const setting = `CODE_SIGN_ENTITLEMENTS = "${relativePath}";`;
  const content = fs.readFileSync(pbxprojPath, 'utf8');
  let updated = content;

  if (/CODE_SIGN_ENTITLEMENTS = [^;]+;/g.test(updated)) {
    updated = updated.replace(/CODE_SIGN_ENTITLEMENTS = [^;]+;/g, setting);
  } else {
    updated = updated.replace(/buildSettings = \{/g, `buildSettings = {\n\t\t\t\t${setting}`);
  }

  if (updated !== content) {
    fs.writeFileSync(pbxprojPath, updated, 'utf8');
    console.log(`   Code Sign Entitlements set to ${relativePath}`);
  } else {
    console.log('   Code Sign Entitlements already configured');
  }
}

function parseXmlAttributes(source) {
  const attrs = {};
  const attrRegex = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;

  while ((match = attrRegex.exec(source || '')) !== null) {
    attrs[match[1]] = decodeXmlAttribute(match[2] !== undefined ? match[2] : match[3]);
  }

  return attrs;
}

function stripXmlComments(xml) {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

function decodeXmlAttribute(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeXmlAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
