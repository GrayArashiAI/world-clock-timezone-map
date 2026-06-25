import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const modulePath = fileURLToPath(import.meta.url);
const projectRoot = dirname(dirname(modulePath));

export const PREVIEW_GIF_CONFIG = Object.freeze({
  width: 1280,
  height: 660,
  frames: 10,
  frameDelayMs: 1000,
  outputPath: "assets/world-map-timezone-map-preview.gif"
});

const DEMO_CITIES = Object.freeze([
  { name: "Honolulu", timeZone: "Pacific/Honolulu" },
  { name: "Anchorage", timeZone: "America/Anchorage" },
  { name: "Los Angeles", timeZone: "America/Los_Angeles" },
  { name: "Mexico City", timeZone: "America/Mexico_City" },
  { name: "New York", timeZone: "America/New_York" },
  { name: "London", timeZone: "Europe/London" },
  { name: "Paris", timeZone: "Europe/Paris" },
  { name: "Istanbul", timeZone: "Europe/Istanbul" },
  { name: "Moscow", timeZone: "Europe/Moscow" },
  { name: "Dubai", timeZone: "Asia/Dubai" },
  { name: "Mumbai", timeZone: "Asia/Kolkata", lat: 19.076, lon: 72.8777 },
  { name: "Bangkok", timeZone: "Asia/Bangkok" },
  { name: "Beijing", timeZone: "Asia/Shanghai", lat: 39.9042, lon: 116.4074 },
  { name: "São Paulo", timeZone: "America/Sao_Paulo" },
  { name: "Lima", timeZone: "America/Lima" },
  { name: "Santiago", timeZone: "America/Santiago" },
  { name: "Johannesburg", timeZone: "Africa/Johannesburg" },
  { name: "Sydney", timeZone: "Australia/Sydney" },
  { name: "Auckland", timeZone: "Pacific/Auckland" }
]);

function property(value) {
  return { value };
}

export function previewWallpaperProperties() {
  return {
    currentcityname: property("Tokyo"),
    currentcitycoords: property("35.6762,139.6503"),
    currentcitytimezone: property("Asia/Tokyo"),
    cityslot1: property("empty"),
    cityslot2: property("empty"),
    cityslot3: property("empty"),
    cityslot4: property("empty"),
    cityslot5: property("empty"),
    cityslot6: property("empty"),
    customcities: property(JSON.stringify(DEMO_CITIES)),
    maplayout: property("atlantic"),
    language: property("en"),
    labelsize: property("small"),
    hourformat: property("24"),
    showseconds: property(true),
    showterminator: property(true)
  };
}

async function applyPreviewSettings(page) {
  await page.evaluate((properties) => {
    window.wallpaperPropertyListener.applyUserProperties(properties);
  }, previewWallpaperProperties());
  await page.waitForFunction(() => document.querySelectorAll(".city-label").length >= 20);
  await page.waitForTimeout(150);
}

async function captureFrame(page, config) {
  const buffer = await page.screenshot({
    type: "png",
    scale: "css",
    clip: {
      x: 0,
      y: 0,
      width: config.width,
      height: config.height
    }
  });
  const metadata = await sharp(buffer).metadata();
  if (metadata.width !== config.width || metadata.height !== config.height) {
    throw new Error(`Unexpected frame size: ${metadata.width}x${metadata.height}`);
  }
  return buffer;
}

async function encodeGif(frames, config) {
  return sharp(frames, { join: { animated: true } })
    .gif({
      loop: 0,
      delay: Array.from({ length: frames.length }, () => config.frameDelayMs),
      colours: 256,
      dither: 1,
      effort: 10,
      interFrameMaxError: 0,
      interPaletteMaxError: 0,
      keepDuplicateFrames: true
    })
    .toBuffer();
}

export async function renderPreviewGif(config = PREVIEW_GIF_CONFIG) {
  const outputPath = resolve(projectRoot, config.outputPath);
  const browser = await chromium.launch();
  const consoleMessages = [];

  try {
    const page = await browser.newPage({
      viewport: { width: config.width, height: config.height },
      deviceScaleFactor: 2,
      locale: "en-US",
      timezoneId: "Asia/Tokyo"
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleMessages.push(message.text());
      }
    });

    await page.goto(pathToFileURL(join(projectRoot, "index.html")).href, { waitUntil: "load" });
    await applyPreviewSettings(page);

    const frames = [];
    for (let index = 0; index < config.frames; index += 1) {
      if (index > 0) {
        await page.waitForTimeout(config.frameDelayMs);
      }
      frames.push(await captureFrame(page, config));
    }

    if (consoleMessages.length) {
      throw new Error(`Preview rendering logged errors:\n${consoleMessages.join("\n")}`);
    }

    const gif = await encodeGif(frames, config);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, gif);
    return {
      outputPath,
      bytes: gif.length,
      frames: config.frames,
      width: config.width,
      height: config.height,
      frameDelayMs: config.frameDelayMs
    };
  } finally {
    await browser.close();
  }
}

if (resolve(process.argv[1] || "") === modulePath) {
  try {
    const result = await renderPreviewGif();
    console.log(`Generated ${result.outputPath}`);
    console.log(`${result.width}x${result.height}, ${result.frames} frames, ${result.frameDelayMs} ms/frame, ${result.bytes} bytes`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
