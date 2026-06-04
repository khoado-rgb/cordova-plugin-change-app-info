# Gradient Splash Screen Implementation

## Overview

The plugin supports CSS gradient syntax for native splash screens on both Android and iOS.

## Configuration

```xml
<preference name="SPLASH_GRADIENT" value="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" />
```

Or in OutSystems JSON:

```json
{ "name": "SPLASH_GRADIENT", "value": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }
```

## Supported Syntax

```
linear-gradient(angle, color1 position1, color2 position2, ...)
```

### Angles

- Degrees: `45deg`, `135deg`, `180deg`
- Keywords: `to top`, `to bottom`, `to right`, `to left`, `to top right`, etc.
- Gradians: `100grad`
- Radians: `1.57rad`
- Turns: `0.5turn`

### Colors

- Hex: `#667eea`, `#764ba2`
- With alpha: `#667eea80`

### Color Stops

- Percentage: `#667eea 0%`, `#764ba2 100%`
- If omitted, colors are distributed evenly

## Examples

```
linear-gradient(135deg, #667eea 0%, #764ba2 100%)
linear-gradient(to bottom, #0f0c29, #302b63, #24243e)
linear-gradient(180deg, #001833 0%, #003366 50%, #001833 100%)
```

## How It Works

### Parsing

`hooks/gradient-parser.js` parses the CSS gradient string into:

```javascript
{
  angle: 135,        // degrees
  colors: [
    { color: '#667eea', position: 0 },
    { color: '#764ba2', position: 1 }
  ]
}
```

### Android

`hooks/android/gradient-generator.js` generates a `GradientDrawable` XML:

```xml
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <gradient
    android:type="linear"
    android:startColor="#667eea"
    android:endColor="#764ba2"
    android:angle="135" />
</shape>
```

### iOS

`hooks/ios/gradient-generator.js` generates PNG images for the splash screen asset catalog. It creates multiple sizes for different device screens:

- 1x, 2x, 3x scales
- iPhone and iPad sizes
- Universal fallback

Image generation requires `sharp` (preferred) or `jimp` (fallback).

The gradient is drawn pixel-by-pixel for jimp or via SVG overlay for sharp.

### Injection

`hooks/ios/inject-gradient-splash.js` runs during `after_prepare` and:
1. Parses the `SPLASH_GRADIENT` preference
2. Generates gradient PNG images
3. Creates the LaunchImage asset catalog with `Contents.json`
4. Updates the storyboard or asset references

## Requirements

- `sharp` ^0.33.0 (recommended) or `jimp` ^1.6.0 (fallback)
- Auto-installed by `scripts/auto-install-deps.js`
- If neither is available, the gradient is skipped and a solid color is used instead

## Fallback

If gradient generation fails for any reason, the plugin falls back to the first color in the gradient as a solid `SplashScreenBackgroundColor`.
