#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DENSITIES = ["ldpi", "mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
const NOTIFICATION_ICON_NAMES = [
  "ic_launcher",
  "ic_stat_onesignal_default",
  "ic_onesignal_large_icon_default",
];

module.exports = function (ctx) {
  const platform = "android";
  if (!ctx.opts.platforms.includes(platform)) {
    return;
  }

  const rootDir = ctx.opts.projectRoot;

  // Android Gradle resource directory.
  const resDest = path.join(rootDir, "platforms", "android", "app", "src", "main", "res");

  console.log("Cordova hook: Copying launcher icon into notification drawables");

  DENSITIES.forEach((dpi) => {
    // Prefer CDN-generated launcher icons, then fall back to bundled resources.
    const srcCandidates = [
      path.join(resDest, `mipmap-${dpi}`, "ic_launcher.png"),
      path.join(rootDir, "res", "android", `drawable-${dpi}`, "icon.png"),
      path.join(rootDir, "source", "res", "android", `drawable-${dpi}`, "icon.png"),
    ];

    const src = srcCandidates.find((f) => fs.existsSync(f));

    if (src) {
      NOTIFICATION_ICON_NAMES.forEach((iconName) => {
        const dest = path.join(resDest, `drawable-${dpi}`, `${iconName}.png`);

        try {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(src, dest);
          console.log(`Copied: ${src} → ${dest}`);
        } catch (err) {
          console.error(`Error copying ${src} → ${dest}:`, err);
        }
      });
    } else {
      console.warn(`Not found: ${srcCandidates.join(" or ")}`);
    }
  });

  console.log("Hook completed.");
};
