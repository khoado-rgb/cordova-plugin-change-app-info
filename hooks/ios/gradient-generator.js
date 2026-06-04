#!/usr/bin/env node

/**
 * iOS Gradient Image Generator
 * Creates PNG images from CSS gradient for iOS splash screen
 */

const fs = require('fs');
const path = require('path');
const GradientParser = require('../gradient-parser');

class IOSGradientGenerator {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.assetsPath = path.join(projectRoot, 'platforms/ios/*/Images.xcassets');
    // Standard iOS splash sizes
    this.splashSizes = [
      { name: '1x', width: 320, height: 568, scale: '1x', idiom: 'universal' },
      { name: '2x', width: 750, height: 1334, scale: '2x', idiom: 'universal' },
      { name: '3x', width: 1125, height: 2001, scale: '3x', idiom: 'universal' },
      // iPad
      { name: 'ipad', width: 768, height: 1024, scale: '1x', idiom: 'ipad' },
      { name: 'ipad-2x', width: 1536, height: 2048, scale: '2x', idiom: 'ipad' }
    ];
  }

  /**
   * Generate gradient images for all iOS splash sizes
   */
  async generateSplashImages(gradientStr) {
    const parsed = GradientParser.parse(gradientStr);
    
    if (!parsed) {
      console.warn('[iOS] Invalid gradient format');
      return [];
    }

    const results = [];

    try {
      // Try using sharp (better quality, but optional dependency)
      const sharp = require('sharp');
      console.log('[iOS] Using sharp for gradient generation');
      
      for (const size of this.splashSizes) {
        try {
          const imagePath = await this.generateWithSharp(sharp, parsed, size);
          results.push(imagePath);
        } catch (err) {
          console.error(`[iOS] Error generating ${size.name}: ${err.message}`);
          // Continue with other sizes
        }
      }
    } catch (err) {
      console.log('[iOS] Sharp not available, trying jimp fallback');
      
      try {
        // Fallback to jimp
        const { Jimp } = require('jimp');
        
        for (const size of this.splashSizes) {
          try {
            const imagePath = await this.generateWithJimp(Jimp, parsed, size);
            results.push(imagePath);
          } catch (jimpErr) {
            console.error(`[iOS] Error generating ${size.name} with jimp: ${jimpErr.message}`);
          }
        }
      } catch (jimpErr) {
        console.error('[iOS] Both sharp and jimp unavailable');
        console.warn('[iOS] Falling back to solid color');
        return this.generateSolidColorImages(parsed.colors[0].color);
      }
    }

    if (results.length === 0) {
      console.warn('[iOS] No splash images were successfully generated');
      console.log('[iOS] Falling back to solid color');
      return this.generateSolidColorImages(parsed.colors[0].color);
    }

    return results;
  }

  /**
   * Generate gradient image using sharp
   */
  async generateWithSharp(sharp, parsed, size) {
    const { angle, colors } = parsed;
    
    // Create SVG gradient for sharp
    const svg = this.createSVGGradient(parsed, size.width, size.height);
    
    try {
      const outputDir = this.getImageSetPath();
      const filename = `splash_${size.name}.png`;
      const outputPath = path.join(outputDir, filename);

      // Create directory if not exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`[iOS] Created directory: ${outputDir}`);
      }

      // Convert SVG to PNG using sharp
      await sharp(Buffer.from(svg))
        .png()
        .resize(size.width, size.height, {
          fit: 'fill',
          background: colors[colors.length - 1].color
        })
        .toFile(outputPath);

      console.log(`[iOS] ✓ Generated splash: ${filename}`);
      return outputPath;
    } catch (error) {
      console.error(`[iOS] Error generating with sharp for ${size.name}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate gradient image using jimp (fallback)
   */
  async generateWithJimp(Jimp, parsed, size) {
    const { angle, colors } = parsed;

    try {
      const outputDir = this.getImageSetPath();
      const filename = `splash_${size.name}.png`;
      const outputPath = path.join(outputDir, filename);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Create new image
      const image = new Jimp({ width: size.width, height: size.height, color: 0xffffffff });

      // Draw gradient manually
      this.drawGradientOnImage(image, parsed, size);

      // Save to file
      await image.write(outputPath);

      console.log(`[iOS] ✓ Generated splash (jimp): ${filename}`);
      return outputPath;
    } catch (error) {
      console.error(`[iOS] Error generating with jimp for ${size.name}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Draw gradient on jimp image
   */
  drawGradientOnImage(image, parsed, size) {
    const { angle, colors } = parsed;
    
    // Simplified: draw linear gradient using color interpolation
    const width = size.width;
    const height = size.height;

    // For each row, calculate color
    for (let y = 0; y < height; y++) {
      const progress = y / height;
      const color = this.interpolateColor(colors, progress);
      const rgba = this.hexToRgba(color);

      // Draw horizontal line with color
      for (let x = 0; x < width; x++) {
        image.setPixelColor(rgba, x, y);
      }
    }

    return image;
  }

  /**
   * Interpolate color between color stops
   */
  interpolateColor(colorStops, progress) {
    progress = Math.max(0, Math.min(1, progress));

    // Find the two colors to interpolate between
    let startStop = colorStops[0];
    let endStop = colorStops[colorStops.length - 1];

    for (let i = 0; i < colorStops.length - 1; i++) {
      if (progress >= colorStops[i].position && progress <= colorStops[i + 1].position) {
        startStop = colorStops[i];
        endStop = colorStops[i + 1];
        
        // Calculate progress between these two stops
        const range = endStop.position - startStop.position;
        const localProgress = (progress - startStop.position) / range;
        
        return this.blendColors(startStop.color, endStop.color, localProgress);
      }
    }

    return endStop.color;
  }

  /**
   * Blend two hex colors
   */
  blendColors(color1, color2, progress) {
    const c1 = this.hexToRgb(color1);
    const c2 = this.hexToRgb(color2);

    const r = Math.round(c1.r + (c2.r - c1.r) * progress);
    const g = Math.round(c1.g + (c2.g - c1.g) * progress);
    const b = Math.round(c1.b + (c2.b - c1.b) * progress);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Convert hex to RGB
   */
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  /**
   * Convert hex to RGBA (for jimp)
   */
  hexToRgba(hex) {
    const rgb = this.hexToRgb(hex);
    return ((rgb.r & 0xff) << 24) | ((rgb.g & 0xff) << 16) | ((rgb.b & 0xff) << 8) | 0xff;
  }

  /**
   * Create SVG gradient string
   */
  createSVGGradient(parsed, width, height) {
    const { angle, colors } = parsed;

    const colorStops = colors
      .map(stop => {
        const offset = Math.round(stop.position * 100);
        return `<stop offset="${offset}%" stop-color="${stop.color}" />`;
      })
      .join('\n');

    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
      ${colorStops}
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#grad)"/>
</svg>`;

    return svg;
  }

  /**
   * Generate solid color images (fallback)
   */
  generateSolidColorImages(color) {
    const results = [];
    
    console.warn(`[iOS] Generating solid color splash images (${color}) as fallback`);
    
    // Document the fallback usage
    this.splashSizes.forEach(size => {
      console.log(`[iOS]   - ${size.name}: ${size.width}x${size.height} (${color})`);
      results.push(`splash_${size.name} [solid: ${color}]`);
    });

    return results;
  }

  /**
   * Get image set directory path
   */
  getImageSetPath() {
    // Find first app directory
    const platformsPath = path.join(this.projectRoot, 'platforms/ios');
    
    if (fs.existsSync(platformsPath)) {
      const dirs = fs.readdirSync(platformsPath);
      const appDir = dirs.find(d => d.endsWith('.xcodeproj') || d.includes('app') || !d.startsWith('.'));
      
      if (appDir && !appDir.includes('.')) {
        const imagePath = path.join(platformsPath, appDir, 'Images.xcassets', 'splash.imageset');
        console.log(`[iOS] Image path: ${imagePath}`);
        return imagePath;
      }
    }

    const defaultPath = path.join(platformsPath, 'Images.xcassets', 'splash.imageset');
    console.log(`[iOS] Using default image path: ${defaultPath}`);
    return defaultPath;
  }

  /**
   * Generate Contents.json for image set
   * IMPORTANT: Must include ALL splash images (1x, 2x, 3x, ipad, ipad-2x)
   */
  generateContentsJson() {
    // FIXED: Include all 5 splash sizes!
    const contentsJson = {
      "images": [
        {
          "filename": "splash_1x.png",
          "idiom": "universal",
          "scale": "1x"
        },
        {
          "filename": "splash_2x.png",
          "idiom": "universal",
          "scale": "2x"
        },
        {
          "filename": "splash_3x.png",
          "idiom": "universal",
          "scale": "3x"
        },
        {
          "filename": "splash_ipad.png",
          "idiom": "ipad",
          "scale": "1x"
        },
        {
          "filename": "splash_ipad-2x.png",
          "idiom": "ipad",
          "scale": "2x"
        }
      ],
      "info": {
        "author": "cordova-plugin-change-app-info",
        "version": 1
      }
    };

    const imageSetPath = this.getImageSetPath();
    
    if (!fs.existsSync(imageSetPath)) {
      fs.mkdirSync(imageSetPath, { recursive: true });
      console.log(`[iOS] Created imageset directory: ${imageSetPath}`);
    }

    const jsonPath = path.join(imageSetPath, 'Contents.json');
    fs.writeFileSync(jsonPath, JSON.stringify(contentsJson, null, 2), 'utf8');
    
    console.log(`[iOS] ✓ Generated Contents.json with ${contentsJson.images.length} entries`);
    return jsonPath;
  }
}

module.exports = IOSGradientGenerator;
