#!/usr/bin/env node

/**
 * Theme Color Extraction
 *
 * Reads the brand colour out of the CSS downloaded from CDN_RESOURCE so it can
 * be handed to the web layer at runtime instead of being duplicated by hand in
 * the build configuration.
 *
 * Values are normalised to hex and anything unrecognised is rejected: the
 * result is serialised into cordova-build-config.json and injected into the
 * page, so a malformed declaration must never reach JavaScript verbatim.
 */

const fs = require('fs');
const path = require('path');

// Checked in order; the first one that resolves to a valid colour wins.
const DEFAULT_VARIABLE_NAMES = ['--color-primary', '--primary-color', '--primary'];

// A custom property may point at another one (--color-primary: var(--brand)).
const MAX_VAR_INDIRECTION = 5;

const CSS_FILE_CANDIDATES = [
  ['assets', 'cdn-styles.css']
];

/**
 * Locate the downloaded CSS. Checks the platform www first (populated by
 * prepare) then falls back to the project www that downloadCDNResources writes.
 */
function findCssFile(wwwPath, projectRoot) {
  const roots = [wwwPath, projectRoot && path.join(projectRoot, 'www')].filter(Boolean);

  for (const root of roots) {
    for (const segments of CSS_FILE_CANDIDATES) {
      const candidate = path.join(root, ...segments);

      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Extract the primary colour from the CDN stylesheet.
 * Returns a hex string, or null when nothing usable is found.
 */
function readPrimaryColor(wwwPath, projectRoot, variableNames) {
  const cssPath = findCssFile(wwwPath, projectRoot);

  if (!cssPath) {
    return null;
  }

  let css;

  try {
    css = fs.readFileSync(cssPath, 'utf8');
  } catch (error) {
    return null;
  }

  return parsePrimaryColor(css, variableNames);
}

function parsePrimaryColor(css, variableNames) {
  const names = normalizeVariableNames(variableNames);

  for (const name of names) {
    const resolved = resolveVariable(css, name, 0);

    if (resolved) {
      return resolved;
    }
  }

  return null;
}

/**
 * The single custom-property name the web layer should read.
 * Falls back to the first default when nothing valid is supplied.
 */
function normalizeVariableName(variableName) {
  const name = String(variableName || '').trim();

  if (!name) {
    return DEFAULT_VARIABLE_NAMES[0];
  }

  const prefixed = name.startsWith('--') ? name : `--${name}`;

  // Guard the value that native writes via style.setProperty().
  return /^--[a-zA-Z0-9_-]+$/.test(prefixed) ? prefixed : DEFAULT_VARIABLE_NAMES[0];
}

function normalizeVariableNames(variableNames) {
  const provided = (Array.isArray(variableNames) ? variableNames : [variableNames])
    .map(name => String(name || '').trim())
    .filter(Boolean)
    .map(name => (name.startsWith('--') ? name : `--${name}`));

  // Caller-supplied names take priority, defaults remain as fallback.
  return provided.concat(DEFAULT_VARIABLE_NAMES.filter(name => !provided.includes(name)));
}

function resolveVariable(css, name, depth) {
  if (depth > MAX_VAR_INDIRECTION) {
    return null;
  }

  const declaration = findDeclaration(css, name);

  if (!declaration) {
    return null;
  }

  const indirection = /^var\(\s*(--[\w-]+)/i.exec(declaration);

  if (indirection) {
    return resolveVariable(css, indirection[1], depth + 1);
  }

  return normalizeColor(declaration);
}

/**
 * Last declaration wins, mirroring the cascade within a single stylesheet.
 */
function findDeclaration(css, name) {
  const pattern = new RegExp(`${escapeRegex(name)}\\s*:\\s*([^;}]+)`, 'gi');
  let match;
  let value = null;

  while ((match = pattern.exec(css)) !== null) {
    value = match[1].trim();
  }

  return value;
}

/**
 * Accepts #rgb, #rrggbb, #rrggbbaa, rgb() and rgba(); rejects everything else.
 */
function normalizeColor(value) {
  const raw = String(value || '').trim().replace(/\s*!important$/i, '').trim();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw);

  if (hex) {
    return `#${expandShorthandHex(hex[1]).toUpperCase()}`;
  }

  const rgb = /^rgba?\(\s*([^)]+)\)$/i.exec(raw);

  if (rgb) {
    return rgbToHex(rgb[1]);
  }

  return null;
}

function expandShorthandHex(digits) {
  if (digits.length === 3 || digits.length === 4) {
    return digits.split('').map(digit => digit + digit).join('');
  }

  return digits;
}

function rgbToHex(body) {
  // Handles both "12, 34, 56" and the space-separated "12 34 56 / 50%" form.
  const parts = body
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length < 3) {
    return null;
  }

  const channels = parts.slice(0, 3).map(parseChannel);

  if (channels.some(channel => channel === null)) {
    return null;
  }

  return `#${channels.map(toHexPair).join('').toUpperCase()}`;
}

function parseChannel(part) {
  const percentage = /^(\d{1,3}(?:\.\d+)?)%$/.exec(part);

  if (percentage) {
    return clampChannel(Math.round((parseFloat(percentage[1]) / 100) * 255));
  }

  if (!/^\d{1,3}(?:\.\d+)?$/.test(part)) {
    return null;
  }

  return clampChannel(Math.round(parseFloat(part)));
}

function clampChannel(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.min(255, Math.max(0, value));
}

function toHexPair(value) {
  return value.toString(16).padStart(2, '0');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  readPrimaryColor,
  parsePrimaryColor,
  normalizeColor,
  normalizeVariableName,
  DEFAULT_VARIABLE_NAMES
};
