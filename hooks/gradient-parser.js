/**
 * Gradient Parser - Extract colors and angles from CSS gradient
 * Supports: linear-gradient(angle, color1 position1, color2 position2, ...)
 */

class GradientParser {
  /**
   * Parse CSS gradient string
   * @param {string} gradientStr - e.g., "linear-gradient(64.28deg, #112233 0%, #004390 100%)"
   * @returns {object} { angle, colors: [{color, position}, ...] }
   */
  static parse(gradientStr) {
    if (!gradientStr || typeof gradientStr !== 'string') {
      return null;
    }

    // Match linear-gradient pattern
    const gradientMatch = gradientStr.match(
      /linear-gradient\s*\(\s*([^,]+?)\s*,\s*(.*)\s*\)/i
    );
    
    if (!gradientMatch) {
      return null;
    }

    const angleStr = gradientMatch[1].trim();
    const colorStops = gradientMatch[2];

    // Parse angle
    const angle = this.parseAngle(angleStr);

    // Parse colors
    const colors = this.parseColorStops(colorStops);

    return {
      angle,
      colors,
      raw: gradientStr
    };
  }

  /**
   * Parse angle from string
   * Supports: "45deg", "0.5turn", "100grad"
   */
  static parseAngle(angleStr) {
    const angleMatch = angleStr.match(/^(\d+(?:\.\d+)?)\s*(deg|rad|turn|grad)?$/i);
    
    if (!angleMatch) {
      return 90; // Default angle
    }

    const value = parseFloat(angleMatch[1]);
    const unit = (angleMatch[2] || 'deg').toLowerCase();

    let degrees;
    switch (unit) {
      case 'rad':
        degrees = (value * 180) / Math.PI;
        break;
      case 'turn':
        degrees = value * 360;
        break;
      case 'grad':
        degrees = (value * 360) / 400;
        break;
      case 'deg':
      default:
        degrees = value;
    }

    return degrees % 360;
  }

  /**
   * Parse color stops
   * @param {string} colorStopsStr - "color1 pos1, color2 pos2, ..."
   * @returns {array} [{color: '#112233', position: 0}, ...]
   */
  static parseColorStops(colorStopsStr) {
    const stops = colorStopsStr.split(',').map(stop => stop.trim());
    
    return stops.map(stop => {
      // Match color and position: "#112233 0%" or just "#112233"
      const match = stop.match(/^(.+?)\s+(\d+(?:\.\d+)?%)?$/);
      
      if (!match) {
        return null;
      }

      const color = match[1].trim();
      const positionStr = match[2];
      let position = 0;

      if (positionStr) {
        position = parseInt(positionStr) / 100; // Convert 0%-100% to 0-1
      }

      return {
        color: this.normalizeColor(color),
        position: Math.min(1, Math.max(0, position))
      };
    }).filter(stop => stop !== null);
  }

  /**
   * Normalize color to #RRGGBB format
   */
  static normalizeColor(color) {
    // Already hex
    if (color.match(/^#[0-9a-f]{6}$/i)) {
      return color.toLowerCase();
    }

    // Short hex
    if (color.match(/^#[0-9a-f]{3}$/i)) {
      const hex = color.slice(1);
      return '#' + hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }

    // RGB/RGBA
    const rgbMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      return '#' + r + g + b;
    }

    return color; // Return as-is if unknown
  }

  /**
   * Get dominant color (start color) from gradient
   */
  static getDominantColor(gradientStr) {
    const parsed = this.parse(gradientStr);
    if (parsed && parsed.colors.length > 0) {
      return parsed.colors[0].color;
    }
    return null;
  }

  /**
   * Validate gradient string format
   */
  static isValid(gradientStr) {
    return /linear-gradient\s*\(/.test(gradientStr);
  }
}

module.exports = GradientParser;
