#!/usr/bin/env node

/**
 * Update splash theme color in colors.xml from config.xml preferences
 * This hook runs before compile to ensure the theme uses the correct background color
 */

const fs = require('fs');
const path = require('path');

module.exports = function(context) {
    console.log('[update-splash-theme-color] Starting...');
    
    const ConfigParser = context.requireCordovaModule('cordova-common').ConfigParser;
    const configPath = path.join(context.opts.projectRoot, 'config.xml');
    
    if (!fs.existsSync(configPath)) {
        console.log('[update-splash-theme-color] config.xml not found');
        return;
    }
    
    const config = new ConfigParser(configPath);
    
    // Get native splash background from preferences. BackgroundColor is the
    // canonical OutSystems value; WEBVIEW_BACKGROUND_COLOR is only a fallback.
    let bgColor = getPreference(config, 'BackgroundColor') ||
                  getPreference(config, 'SplashScreenBackgroundColor') ||
                  getPreference(config, 'AndroidWindowSplashScreenBackground') ||
                  getPreference(config, 'AndroidWindowSplashScreenBackgroundColor') ||
                  getPreference(config, 'WEBVIEW_BACKGROUND_COLOR');
    
    if (!bgColor) {
        console.log('[update-splash-theme-color] No background color configured, skipping');
        return;
    }
    
    // Normalize color format to #RRGGBB
    bgColor = normalizeColor(bgColor);
    
    if (!bgColor) {
        console.log('[update-splash-theme-color] Invalid color format, skipping');
        return;
    }
    
    console.log('[update-splash-theme-color] Setting splash background to: ' + bgColor);
    
    // Update colors.xml files
    const platformRoot = path.join(context.opts.projectRoot, 'platforms', 'android');
    const colorsFiles = [
        path.join(platformRoot, 'app/src/main/res/values/cordova_splash_colors.xml'),
        path.join(platformRoot, 'app/src/main/res/values-night/cordova_splash_colors.xml')
    ];
    
    colorsFiles.forEach((colorsFile) => {
        if (!fs.existsSync(colorsFile)) {
            console.log('[update-splash-theme-color] File not found (will be created by plugin): ' + colorsFile);
            return;
        }
        
        try {
            let xmlContent = fs.readFileSync(colorsFile, 'utf8');
            
            // Simple regex replacement (more reliable than XML parsing)
            const colorPattern = /(<color\s+name=["']cordova_splash_background["']>)([^<]+)(<\/color>)/g;
            
            if (colorPattern.test(xmlContent)) {
                xmlContent = xmlContent.replace(colorPattern, '$1' + bgColor + '$3');
                fs.writeFileSync(colorsFile, xmlContent, 'utf8');
                console.log('[update-splash-theme-color] Updated: ' + path.basename(colorsFile));
            } else {
                console.log('[update-splash-theme-color] Color not found in: ' + path.basename(colorsFile));
            }
            
        } catch (error) {
            console.error('[update-splash-theme-color] Error updating ' + path.basename(colorsFile) + ':', error.message);
        }
    });
    
    console.log('[update-splash-theme-color] Completed');
};

function getPreference(config, name) {
    return config.getPreference(name, 'android') || config.getPreference(name);
}

/**
 * Normalize color to #RRGGBB format
 */
function normalizeColor(color) {
    if (!color) return null;
    
    let normalized = color.trim();
    
    // Remove 0x prefix if present
    if (normalized.startsWith('0x') || normalized.startsWith('0X')) {
        const hex = normalized.substring(2);
        if (hex.length === 8) {
            // 0xAARRGGBB -> #RRGGBB (remove alpha)
            normalized = '#' + hex.substring(2);
        } else if (hex.length === 6) {
            // 0xRRGGBB -> #RRGGBB
            normalized = '#' + hex;
        } else {
            return null;
        }
    }
    
    // Add # if missing
    if (!normalized.startsWith('#')) {
        if (normalized.length === 6 || normalized.length === 8) {
            normalized = '#' + normalized;
        } else {
            return null;
        }
    }
    
    // Validate format
    if (normalized.length === 7) {
        // #RRGGBB
        return normalized;
    } else if (normalized.length === 9) {
        // #AARRGGBB -> #RRGGBB (remove alpha)
        return '#' + normalized.substring(3);
    }
    
    return null;
}
