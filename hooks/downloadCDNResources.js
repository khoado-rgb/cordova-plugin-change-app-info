#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');
const utils = require('./utils');

const MAX_CSS_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const ALLOWED_CSS_CONTENT_TYPES = [
  'text/css',
  'text/plain',
  'application/octet-stream'
];

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
      validateHttpsUrl(cdnResource);
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
function validateHttpsUrl(urlString, baseUrl) {
  const parsed = baseUrl ? new url.URL(urlString, baseUrl) : new url.URL(urlString);
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS CDN_RESOURCE URLs are allowed');
  }
  return parsed;
}

function isAllowedContentType(contentType) {
  if (!contentType) {
    return true;
  }
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  return ALLOWED_CSS_CONTENT_TYPES.includes(normalized);
}

function downloadFileAsString(urlString, redirectsRemaining = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const timeoutMs = 30000;
    let isResolved = false;

    try {
      const parsedUrl = validateHttpsUrl(urlString);
      const request = https.get(parsedUrl, { timeout: timeoutMs }, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          if (redirectsRemaining <= 0) {
            if (!isResolved) {
              isResolved = true;
              reject(new Error('Too many CDN redirects'));
            }
            return;
          }

          let redirectUrl;
          try {
            redirectUrl = validateHttpsUrl(response.headers.location, parsedUrl);
          } catch (redirectError) {
            if (!isResolved) {
              isResolved = true;
              reject(redirectError);
            }
            return;
          }
          console.log(`   Redirecting to: ${redirectUrl.href}`);
          return downloadFileAsString(redirectUrl.href, redirectsRemaining - 1)
            .then(resolve)
            .catch(reject);
        }

        // Check for errors
        if (response.statusCode !== 200) {
          const err = new Error(`HTTP ${response.statusCode} - ${response.statusMessage || 'Unknown error'}`);
          if (!isResolved) {
            isResolved = true;
            reject(err);
          }
          return;
        }

        if (!isAllowedContentType(response.headers['content-type'])) {
          if (!isResolved) {
            isResolved = true;
            reject(new Error(`Unsupported CDN content type: ${response.headers['content-type']}`));
          }
          return;
        }

        let totalBytes = 0;
        const chunks = [];

        response.on('data', (chunk) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_CSS_BYTES) {
            request.destroy(new Error(`CDN CSS exceeds ${MAX_CSS_BYTES} bytes`));
            return;
          }
          chunks.push(chunk);
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
            resolve(Buffer.concat(chunks).toString('utf8'));
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
