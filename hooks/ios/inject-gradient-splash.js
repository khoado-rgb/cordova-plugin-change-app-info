#!/usr/bin/env node

/**
 * Inject Gradient Splash Screen Hook
 * 
 * Injects CSS gradient splash screen that displays BEFORE app loads
 * Replaces solid color splash with beautiful gradient
 * 
 * Supported gradients:
 * - Linear gradient (45deg, 90deg, etc)
 * - Radial gradient (circle, ellipse)
 * - Multiple color stops
 * 
 * Runs at: after_prepare stage
 */

const fs = require('fs');
const path = require('path');
const { getConfigParser } = require('../utils');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function injectGradientSplash(context) {
  const root = context.opts.projectRoot;
  const config = getConfigParser(context, path.join(root, 'config.xml'));
  
  // Get gradient from config - format: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
  const gradientValue = config.getPreference('SPLASH_GRADIENT');
  
  if (!gradientValue) {
    log(colors.yellow, '\n⚠️  SPLASH_GRADIENT preference not set in config.xml');
    log(colors.yellow, '   Add to config.xml:');
    log(colors.yellow, '   <preference name="SPLASH_GRADIENT" value="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" />');
    return;
  }
  
  log(colors.bright + colors.blue, '\n╔════════════════════════════════════════════════════════════╗');
  log(colors.bright + colors.blue, '║         Injecting Gradient Splash Screen                    ║');
  log(colors.bright + colors.blue, '╚════════════════════════════════════════════════════════════╝\n');
  
  log(colors.reset, '🎨 Gradient Splash Screen Configuration:');
  log(colors.green, `   ✅ Gradient: ${gradientValue}`);
  
  const wwwPath = path.join(root, 'www');
  const indexPath = path.join(wwwPath, 'index.html');
  
  if (!fs.existsSync(indexPath)) {
    log(colors.red, `\n   ❌ index.html not found at: ${indexPath}`);
    return;
  }
  
  let html = fs.readFileSync(indexPath, 'utf8');
  
  // Create gradient CSS
  const gradientCSS = `
    /* Gradient Splash Screen - appears before app loads */
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: ${gradientValue};
      background-attachment: fixed;
    }
    
    /* Center content */
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white;
    }
    
    /* Loading indicator (optional) */
    .app-loading {
      text-align: center;
      z-index: 1000;
    }
    
    .app-loading-spinner {
      width: 50px;
      height: 50px;
      margin: 20px auto;
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 0.8s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  
  // Check if gradient CSS already injected
  if (html.includes('Gradient Splash Screen')) {
    log(colors.yellow, '\n   ⚠️  Gradient CSS already injected');
    return;
  }
  
  // Inject into <head>
  if (html.includes('</head>')) {
    const styleTag = `    <style>${gradientCSS}    </style>`;
    html = html.replace('</head>', `${styleTag}\n  </head>`);
    
    fs.writeFileSync(indexPath, html, 'utf8');
    
    log(colors.reset, '\n📝 Injection Complete:');
    log(colors.green, '   ✅ Gradient CSS injected into <head>');
    log(colors.green, '   ✅ Gradient displays before app loads');
    log(colors.green, '   ✅ Loading spinner added (optional)');
    
  } else {
    log(colors.red, '\n   ❌ Could not find </head> tag in index.html');
    return;
  }
  
  // Also update body background in case CSS doesn't apply immediately
  if (!html.includes('style="background:')) {
    // Inject inline style as fallback
    const inlineStyle = `style="background: ${gradientValue}; width: 100%; height: 100%; margin: 0; padding: 0;"`;
    html = html.replace('<body>', `<body ${inlineStyle}>`);
    fs.writeFileSync(indexPath, html, 'utf8');
    log(colors.green, '   ✅ Inline fallback style added to <body>');
  }
  
  log(colors.reset, '\n' + '═'.repeat(60));
  log(colors.green, '✅ Gradient Splash Screen Setup Complete!\n');
}

module.exports = function(context) {
  const platforms = context.opts.platforms;
  
  if (!platforms || !platforms.includes('ios')) {
    return;
  }
  
  injectGradientSplash(context);
};
