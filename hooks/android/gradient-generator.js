#!/usr/bin/env node

/**
 * Android Gradient Generator
 * Creates Android drawable resources from CSS gradient
 */

const fs = require('fs');
const path = require('path');
const GradientParser = require('../gradient-parser');

class AndroidGradientGenerator {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.resPath = path.join(projectRoot, 'platforms/android/app/src/main/res');
  }

  /**
   * Generate Android drawable XML from gradient
   */
  generateDrawable(gradientStr, filename = 'splash_gradient') {
    const parsed = GradientParser.parse(gradientStr);
    
    if (!parsed || !parsed.colors || parsed.colors.length < 2) {
      console.warn('[Android] Invalid gradient, falling back to solid color');
      return this.generateSolidColor(
        GradientParser.getDominantColor(gradientStr) || '#000000',
        filename
      );
    }

    const drawableXml = this.createGradientXml(parsed);
    return this.saveDrawable(drawableXml, filename);
  }

  /**
   * Create gradient XML drawable
   * Must be properly formatted for Android resource compiler
   */
  createGradientXml(parsed) {
    const { angle, colors } = parsed;
    
    if (!colors || colors.length < 2) {
      throw new Error('Gradient must have at least 2 colors');
    }
    
    // Android gradient angles
    // 0deg = bottom-to-top, 90deg = left-to-right
    // Convert CSS angle to Android angle
    const androidAngle = this.convertAngleToAndroid(angle);
    
    console.log(`[Android] Creating gradient: angle=${androidAngle}°, colors=${colors.length}`);

    // Create proper gradient XML
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <gradient
        android:type="linear"
        android:angle="${androidAngle}"
        android:startColor="${colors[0].color}"
        android:endColor="${colors[colors.length - 1].color}"
        android:interpolator="@android:interpolator/accelerate_decelerate"
        android:dither="true" />
</shape>`;

    return xml;
  }

  /**
   * Convert CSS gradient angle to Android angle
   * CSS: 0deg = top-to-bottom, 90deg = left-to-right
   * Android: 0deg = bottom-to-top, 90deg = left-to-right
   */
  convertAngleToAndroid(cssAngle) {
    // Android only supports: 0, 45, 90, 135, 180, 225, 270, 315
    const validAngles = [0, 45, 90, 135, 180, 225, 270, 315];
    
    // Normalize CSS angle
    let normalizedAngle = cssAngle % 360;
    if (normalizedAngle < 0) {
      normalizedAngle += 360;
    }
    
    // Convert CSS angle (0 = top-to-bottom) to Android angle (0 = bottom-to-top)
    let androidAngle = (360 - normalizedAngle) % 360;
    
    // Round to nearest valid angle
    let nearest = validAngles[0];
    let minDiff = Math.abs(androidAngle - validAngles[0]);
    
    for (let angle of validAngles) {
      const diff = Math.abs(androidAngle - angle);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = angle;
      }
    }

    console.log(`[Android] Angle conversion: ${cssAngle}° (CSS) → ${nearest}° (Android)`);
    return nearest;
  }

  /**
   * Generate solid color drawable (fallback)
   */
  generateSolidColor(colorHex, filename) {
    console.log(`[Android] Generating solid color drawable: ${colorHex}`);
    
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="${colorHex}" />
</shape>`;

    return this.saveDrawable(xml, filename);
  }

  /**
   * Save drawable to drawable folder (NOT values!)
   * Drawables must go in res/drawable or res/drawable-* folders
   */
  saveDrawable(xml, filename) {
    try {
      // IMPORTANT: Save to drawable folder, NOT values!
      // Android resource compiler expects drawables in drawable/
      const drawableDir = path.join(this.resPath, 'drawable');
      
      console.log(`[Android] Ensuring drawable directory exists: ${drawableDir}`);
      if (!fs.existsSync(drawableDir)) {
        fs.mkdirSync(drawableDir, { recursive: true });
      }

      const filePath = path.join(drawableDir, `${filename}.xml`);
      
      // Validate XML before saving
      if (!xml || xml.length === 0) {
        throw new Error('XML content is empty');
      }
      
      if (!xml.includes('<shape') || !xml.includes('</shape>')) {
        throw new Error('Invalid XML structure: missing shape tags');
      }
      
      // Write file
      fs.writeFileSync(filePath, xml, 'utf8');
      
      // Verify file was created
      if (!fs.existsSync(filePath)) {
        throw new Error('File was not created');
      }
      
      const fileSize = fs.statSync(filePath).size;
      console.log(`[Android] ✓ Generated drawable: ${filePath} (${fileSize} bytes)`);
      
      return filePath;
    } catch (error) {
      console.error(`[Android] ✗ Error saving drawable: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate splash screen layout using gradient
   * FIXED: No ImageView reference (ic_launcher_foreground not guaranteed)
   * Just use gradient as background
   */
  generateSplashLayout(gradientStr) {
    try {
      // Generate the gradient drawable first
      console.log('[Android] Generating splash background drawable...');
      this.generateDrawable(gradientStr, 'splash_background');

      // Create simple layout with ONLY gradient background
      // No ImageView reference to avoid "resource not found" errors
      const layoutXml = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/splash_background"
    android:gravity="center">
    
    <!-- Gradient splash screen - no external drawables referenced -->
    <!-- This ensures compatibility across all app configurations -->
    
</LinearLayout>`;

      const layoutDir = path.join(this.resPath, 'layout');
      if (!fs.existsSync(layoutDir)) {
        fs.mkdirSync(layoutDir, { recursive: true });
      }

      const filePath = path.join(layoutDir, 'activity_splash.xml');
      fs.writeFileSync(filePath, layoutXml, 'utf8');
      
      console.log(`[Android] ✓ Generated splash layout: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('[Android] ✗ Error saving layout:', error.message);
      throw error;
    }
  }

  /**
   * Update AndroidManifest.xml with splash activity theme
   */
  updateManifestWithGradient(gradientStr) {
    try {
      const manifestPath = path.join(
        this.projectRoot,
        'platforms/android/app/src/main/AndroidManifest.xml'
      );

      if (!fs.existsSync(manifestPath)) {
        console.warn(`[Android] ⚠️ AndroidManifest.xml not found at ${manifestPath}`);
        return;
      }

      let manifest = fs.readFileSync(manifestPath, 'utf8');

      // Check if theme already exists to avoid duplication
      if (manifest.includes('SplashTheme')) {
        console.log('[Android] SplashTheme already exists in AndroidManifest.xml');
        return;
      }

      // Add splash theme
      const themeStyle = `
    <style name="SplashTheme" parent="android:Theme.Material.Light.NoActionBar">
        <item name="android:windowBackground">@drawable/splash_background</item>
        <item name="android:windowNoTitle">true</item>
        <item name="android:windowFullscreen">true</item>
    </style>`;

      // Insert theme in resources tag (safer than application tag)
      let updated = false;
      
      // Try to insert after last style tag
      if (manifest.includes('</style>')) {
        const lastStyleIndex = manifest.lastIndexOf('</style>');
        manifest = manifest.substring(0, lastStyleIndex + 8) + themeStyle + manifest.substring(lastStyleIndex + 8);
        updated = true;
      } else if (manifest.includes('<resources>')) {
        // If no styles, add inside resources
        manifest = manifest.replace(
          /<resources[^>]*>/,
          `$&${themeStyle}`
        );
        updated = true;
      }
      
      if (updated) {
        fs.writeFileSync(manifestPath, manifest, 'utf8');
        console.log('[Android] ✓ Updated AndroidManifest.xml with splash theme');
      } else {
        console.warn('[Android] ⚠️ Could not update AndroidManifest.xml - structure not recognized');
      }
    } catch (error) {
      console.error('[Android] ✗ Error updating manifest:', error.message);
    }
  }
}

module.exports = AndroidGradientGenerator;
