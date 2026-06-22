#!/usr/bin/env node

/**
 * Android-specific utilities
 *
 * Thin wrapper around the shared utils module (../utils.js).
 * Provides a file-path-based readColorConfigFromXml() for hooks
 * that don't have access to a ConfigParser instance.
 */

const fs = require('fs');
const path = require('path');
const sharedUtils = require('../utils');

// Re-export everything from shared utils
const {
  normalizeHexColor,
  readXmlFile,
  writeXmlFile,
  createCdvColorsTemplate,
  createCdvThemesTemplate,
  termColors: colors,
  colorLog: log,
} = sharedUtils;

/**
 * Read color preferences from config.xml by file path (raw XML parsing).
 * Use this when you don't have a Cordova context / ConfigParser instance.
 *
 * @param {string} configPath - Path to config.xml
 * @returns {{ oldColor: string, newColor: string, hasNewColor: boolean }}
 */
function readColorConfigFromXml(configPath) {
  const defaultOldColor = '#1E1464';

  if (!fs.existsSync(configPath)) {
    log(colors.yellow, `⚠️  config.xml not found: ${configPath}`);
    return { oldColor: defaultOldColor, newColor: defaultOldColor, hasNewColor: false };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');

    const oldColorMatch = content.match(
      /<preference\s+name=["']OLD_COLOR["']\s+value=["']([^"']+)["']/i
    );
    const oldColor = oldColorMatch ? oldColorMatch[1].trim() : defaultOldColor;

    let newColor = null;

    const preferenceNames = [
      'BackgroundColor',
      'SplashScreenBackgroundColor',
      'AndroidWindowSplashScreenBackground',
      'AndroidWindowSplashScreenBackgroundColor',
      'WEBVIEW_BACKGROUND_COLOR'
    ];

    for (const preferenceName of preferenceNames) {
      const match = content.match(
        new RegExp(`<preference\\s+name=["']${preferenceName}["']\\s+value=["']([^"']+)["']`, 'i')
      );
      if (match && match[1]) {
        newColor = match[1].trim();
        break;
      }
    }

    const hasNewColor = Boolean(newColor);

    if (!newColor) {
      newColor = oldColor;
    }

    const normalizedOldColor = normalizeHexColor(oldColor) || defaultOldColor;
    const normalizedNewColor = normalizeHexColor(newColor) || normalizedOldColor;

    log(colors.blue, `📖 Config.xml colors:`);
    log(colors.reset, `   OLD_COLOR (to replace): ${normalizedOldColor}`);
    log(colors.reset, `   BackgroundColor target: ${normalizedNewColor}`);

    return { oldColor: normalizedOldColor, newColor: normalizedNewColor, hasNewColor };
  } catch (error) {
    log(colors.yellow, `⚠️  Error reading config.xml: ${error.message}`);
    return { oldColor: defaultOldColor, newColor: defaultOldColor, hasNewColor: false };
  }
}

/**
 * Get background color preference from config.xml file path.
 */
function getBackgroundColorPreference(root) {
  const configPath = path.join(root, 'config.xml');
  const { newColor } = readColorConfigFromXml(configPath);
  return newColor;
}

module.exports = {
  normalizeHexColor,
  readColorConfigFromXml,
  getBackgroundColorPreference,
  readXmlFile,
  writeXmlFile,
  createCdvColorsTemplate,
  createCdvThemesTemplate,
  log,
  colors
};
