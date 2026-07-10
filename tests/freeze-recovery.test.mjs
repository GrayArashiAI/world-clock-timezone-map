import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const indexUrl = pathToFileURL(join(projectRoot, "index.html")).href;

async function openWallpaperPage(browser) {
  const page = await browser.newPage({
    viewport: { width: 960, height: 540 },
    locale: "en-US"
  });
  await page.addInitScript(() => {
    window.__rafBlocked = false;
    const nativeRequest = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      if (window.__rafBlocked) {
        // 壁紙エンジンが描画を止めた状態を再現: コールバックは永遠に呼ばれない。
        return 0x7fffffff;
      }
      return nativeRequest(callback);
    };
  });
  await page.goto(indexUrl, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const time = document.querySelector("#labelLayer .city-time");
    return Boolean(time && time.textContent.trim());
  });
  return page;
}

function readFirstClockText(page) {
  return page.evaluate(() => document.querySelector("#labelLayer .city-time").textContent);
}

function waitForClockChange(page, previousText, timeout) {
  return page.waitForFunction(
    (previous) => document.querySelector("#labelLayer .city-time").textContent !== previous,
    previousText,
    // rAF を塞ぐテストでも判定が走るよう、rAF ではなく間隔ポーリングで待つ。
    { timeout, polling: 100 }
  );
}

test("clock keeps ticking when a pending animation frame never fires", async () => {
  const browser = await chromium.launch();
  try {
    const page = await openWallpaperPage(browser);
    await page.evaluate(() => {
      window.__rafBlocked = true;
    });
    // 次の秒境界の tick で「発火しない rAF」がゲートを塞ぐのを待つ。
    await page.waitForTimeout(1200);
    const frozenText = await readFirstClockText(page);
    await waitForClockChange(page, frozenText, 4000);
  } finally {
    await browser.close();
  }
});

test("setPaused(true/false) suspends and resumes clock updates", async () => {
  const browser = await chromium.launch();
  try {
    const page = await openWallpaperPage(browser);
    const hasSetPaused = await page.evaluate(
      () => typeof window.wallpaperPropertyListener.setPaused === "function"
    );
    assert.equal(hasSetPaused, true, "wallpaperPropertyListener.setPaused が実装されていること");

    await page.evaluate(() => window.wallpaperPropertyListener.setPaused(true));
    await page.waitForTimeout(400);
    const pausedText = await readFirstClockText(page);
    await page.waitForTimeout(1600);
    assert.equal(await readFirstClockText(page), pausedText, "一時停止中は時計が更新されないこと");

    await page.evaluate(() => window.wallpaperPropertyListener.setPaused(false));
    await waitForClockChange(page, pausedText, 4000);
  } finally {
    await browser.close();
  }
});
