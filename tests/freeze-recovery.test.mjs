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

// 画面に実際に繋がっているノードの時刻だけを読む。
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

function canvasOpaquePixelCount(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById("mapCanvas");
    const context = canvas.getContext("2d");
    const pixels = context.getImageData(0, 0, Math.min(canvas.width, 64), Math.min(canvas.height, 64)).data;
    let opaque = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) {
        opaque += 1;
      }
    }
    return opaque;
  });
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

test("clock keeps ticking through a transient error inside a tick", async () => {
  const browser = await chromium.launch();
  try {
    const page = await openWallpaperPage(browser);
    // 時刻整形を一定時間だけ確実に例外化し、tick 本体を失敗させる。
    await page.evaluate(() => {
      const core = window.WorldClockCore;
      const original = core.formatZonedTime;
      core.formatZonedTime = () => {
        throw new Error("transient formatting failure");
      };
      window.setTimeout(() => {
        core.formatZonedTime = original;
      }, 1500);
    });
    await page.waitForTimeout(600);
    const frozenText = await readFirstClockText(page);
    // 例外が収まった後、心拍が生きていれば時計は再び進む。
    await waitForClockChange(page, frozenText, 5000);
  } finally {
    await browser.close();
  }
});

test("clock keeps ticking even while the engine reports paused", async () => {
  const browser = await chromium.launch();
  try {
    const page = await openWallpaperPage(browser);
    const hasSetPaused = await page.evaluate(
      () => typeof window.wallpaperPropertyListener.setPaused === "function"
    );
    assert.equal(hasSetPaused, true, "wallpaperPropertyListener.setPaused が実装されていること");

    // 一時停止通知を受けても時計の心拍は止めない(復帰通知の欠落で凍結しない)。
    await page.evaluate(() => window.wallpaperPropertyListener.setPaused(true));
    await page.waitForTimeout(600);
    const pausedText = await readFirstClockText(page);
    await waitForClockChange(page, pausedText, 4000);

    // 復帰通知が来たら描画も追従する。
    await page.evaluate(() => window.wallpaperPropertyListener.setPaused(false));
    const resumedText = await readFirstClockText(page);
    await waitForClockChange(page, resumedText, 4000);
  } finally {
    await browser.close();
  }
});

test("clock recovers when on-screen labels diverge from the tracked views", async () => {
  const browser = await chromium.launch();
  try {
    const page = await openWallpaperPage(browser);
    // 再構築が途中で失敗し、画面には古いノードだけが残った状態を再現する。
    // 内部が保持するビューは画面から切り離され、更新しても見た目は凍る。
    await page.evaluate(() => {
      const layer = document.getElementById("labelLayer");
      const stale = Array.from(layer.children).map((node) => node.cloneNode(true));
      layer.replaceChildren(...stale);
    });
    await page.waitForTimeout(600);
    const frozenText = await readFirstClockText(page);
    await waitForClockChange(page, frozenText, 5000);
  } finally {
    await browser.close();
  }
});

test("a large wall-clock jump forces a full rebuild", async () => {
  const browser = await chromium.launch();
  try {
    const page = await openWallpaperPage(browser);
    // 比較基準となる前回 tick が必要なので、心拍が一度回るまで待つ。
    const initialText = await readFirstClockText(page);
    await waitForClockChange(page, initialText, 4000);
    await page.evaluate(() => {
      document.querySelectorAll("#labelLayer .city-label").forEach((node) => {
        node.dataset.beforeWake = "1";
      });
    });
    // 待機復帰で実時間が飛んだ状況を再現する。
    await page.evaluate(() => {
      const realNow = Date.now.bind(Date);
      Date.now = () => realNow() + 120000;
    });
    await page.waitForFunction(
      () => document.querySelectorAll("#labelLayer .city-label[data-before-wake]").length === 0,
      undefined,
      { timeout: 5000, polling: 100 }
    );
  } finally {
    await browser.close();
  }
});

test("canvas context restoration redraws the map", async () => {
  const browser = await chromium.launch();
  try {
    const page = await openWallpaperPage(browser);
    // 昼夜レイヤーの定期更新を止め、復帰処理だけが再描画源になるようにする。
    await page.evaluate(() => window.wallpaperPropertyListener.applyUserProperties({
      showterminator: { value: false }
    }));
    await page.waitForTimeout(600);
    assert.ok(await canvasOpaquePixelCount(page) > 0, "初期状態では地図が描かれていること");

    // GPU コンテキスト喪失で内容が消えた状態を再現する。
    await page.evaluate(() => {
      const canvas = document.getElementById("mapCanvas");
      const context = canvas.getContext("2d");
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.restore();
    });
    assert.equal(await canvasOpaquePixelCount(page), 0, "消去後は地図が空であること");

    await page.evaluate(() => {
      document.getElementById("mapCanvas").dispatchEvent(new Event("contextrestored"));
    });
    await page.waitForFunction(() => {
      const canvas = document.getElementById("mapCanvas");
      const context = canvas.getContext("2d");
      const pixels = context.getImageData(0, 0, 64, 64).data;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) {
          return true;
        }
      }
      return false;
    }, undefined, { timeout: 3000, polling: 100 });
  } finally {
    await browser.close();
  }
});

test("diagnostics expose a live heartbeat counter", async () => {
  const browser = await chromium.launch();
  try {
    const page = await openWallpaperPage(browser);
    const first = await page.evaluate(() => window.__worldClockDiag && window.__worldClockDiag.tickCount);
    assert.equal(typeof first, "number", "__worldClockDiag.tickCount が数値であること");
    await page.waitForFunction(
      (previous) => window.__worldClockDiag.tickCount > previous,
      first,
      { timeout: 4000, polling: 100 }
    );
  } finally {
    await browser.close();
  }
});
