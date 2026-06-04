#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url = require('url');
const utils = require('./utils');

module.exports = function(context) {
  return downloadCDNResourcesAsync(context);
};

/**
 * Main async function
 * Downloads CSS from CDN and saves to file for runtime injection by native code
 */
async function downloadCDNResourcesAsync(context) {
  const projectRoot = context.opts.projectRoot;
  const assetsDir = path.join(projectRoot, 'www', 'assets');
  const cssFilePath = path.join(assetsDir, 'cdn-styles.css');

  console.log('\n📥 [CDN-DOWNLOAD] Downloading CSS from CDN for runtime injection...\n');

  try {
    // Get config parser from utils
    const configParser = utils.getConfigParser(context);
    if (!configParser) {
      console.log('⚠️  Could not initialize config parser, skipping CDN download');
      return;
    }

    // Read CDN_RESOURCE preference from config.xml
    const cdnResource = configParser.getPreference('CDN_RESOURCE');
    if (!cdnResource) {
      console.log('⚠️  CDN_RESOURCE not configured in config.xml, skipping download');
      return;
    }

    console.log(`✅ Found CDN_RESOURCE: ${cdnResource}`);

    // Validate URL format
    try {
      new url.URL(cdnResource);
    } catch (urlError) {
      console.log(`❌ Invalid CDN URL format: ${urlError.message}`);
      return;
    }

    // Create assets directory
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
      console.log(`✅ Created: www/assets/`);
    }

    // Download CSS content
    try {
      console.log('   Downloading CSS...');
      const cssContent = await downloadFileAsString(cdnResource);
      console.log(`✅ Downloaded: ${cssContent.length} bytes`);

      // Save CSS to file
      fs.writeFileSync(cssFilePath, cssContent, 'utf8');
      console.log(`✅ Saved to: www/assets/cdn-styles.css`);
      console.log(`\n📱 Native code will inject this CSS at runtime`);
      console.log(`   ✅ Won't be overwritten by OTA updates\n`);

    } catch (downloadError) {
      console.log(`❌ ERROR: Failed to download from CDN`);
      console.log(`   URL: ${cdnResource}`);
      console.log(`   Error: ${downloadError.message}`);
      console.log(`\n🧰 Troubleshooting:`);
      console.log(`   1. Verify CDN URL is correct`);
      console.log(`   2. Check if file exists on server`);
      console.log(`   3. Verify server is accessible\n`);
      
      // Create empty fallback file
      fs.writeFileSync(cssFilePath, '/* CDN download failed - add fallback CSS here */', 'utf8');
      console.log(`✅ Created empty fallback file\n`);
    }

  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    throw error;
  }
}

/**
 * Download file from URL and return as string
 */
function downloadFileAsString(urlString) {
  return new Promise((resolve, reject) => {
    const protocol = urlString.startsWith('https') ? https : http;
    const timeoutMs = 30000;
    let isResolved = false;
    let data = '';

    try {
      const request = protocol.get(urlString, { timeout: timeoutMs }, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          console.log(`   Redirecting to: ${response.headers.location}`);
          return downloadFileAsString(response.headers.location)
            .then(resolve)
            .catch(reject);
        }

        // Check for errors
        if (response.statusCode !== 200) {
          const err = new Error(`HTTP ${response.statusCode} - ${http.STATUS_CODES[response.statusCode] || 'Unknown error'}`);
          if (!isResolved) {
            isResolved = true;
            reject(err);
          }
          return;
        }

        response.on('data', (chunk) => {
          data += chunk.toString();
        });

        response.on('error', (err) => {
          if (!isResolved) {
            isResolved = true;
            reject(new Error(`Response error: ${err.message}`));
          }
        });

        response.on('end', () => {
          if (!isResolved) {
            isResolved = true;
            resolve(data);
          }
        });
      });

      request.on('error', (err) => {
        if (!isResolved) {
          isResolved = true;
          reject(new Error(`Request error: ${err.message}`));
        }
      });

      request.on('timeout', () => {
        request.destroy();
        if (!isResolved) {
          isResolved = true;
          reject(new Error('Download timeout (30s)'));
        }
      });

    } catch (error) {
      if (!isResolved) {
        isResolved = true;
        reject(error);
      }
    }
  });
}
