import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  CITY_PRESETS,
  TERMINATOR_PIXEL_LEVEL_DEFAULT,
  TERMINATOR_PIXEL_LEVEL_MAX,
  TERMINATOR_PIXEL_LEVEL_SMOOTH,
  canvasBackingSize,
  chooseLabelPlacement,
  clamp,
  coastlineWidth,
  coverMercatorRect,
  formatZonedTime,
  getCityName,
  isDaylightAt,
  labelViewportForMapView,
  labelMetrics,
  localeForLanguage,
  landSouthLimit,
  mapViewForViewport,
  nextClockDelay,
  nextTerminatorDelay,
  normalizeTerminatorPixelLevel,
  parseCustomCities,
  parseIso6709Coordinate,
  projectMercator,
  resolveCurrentCity,
  resolveRuntimeLanguage,
  resolveSelectedCities,
  shouldBreakLandSegment,
  solarCosine,
  solarCosineFromPosition,
  solarPosition,
  terminatorCellDevicePixels,
  terminatorCellSize,
  terminatorFadeAlpha,
  terminatorGridCoordinates,
  terminatorPaintKey,
  terminatorPaintStyle,
  terminatorSolarFactors,
  timeZoneCoordinates,
  unprojectMercator,
  viewportFillRect,
  writeTerminatorPixels
} = require("../src/wallpaper-core.js");

test("custom city parsing accepts supported formats and reports invalid entries", () => {
  const single = parseCustomCities('{"timeZone":"Asia/Tokyo"}');
  const sequence = parseCustomCities(
    '{"timeZone":"Europe/London"},{"timeZone":"Europe/Paris","name":"Desk"}'
  );
  const mixed = parseCustomCities(JSON.stringify([
    { timeZone: "Asia/Shanghai", name: "Beijing", lat: 39.9042, lon: 116.4074 },
    { name: "Missing timezone" },
    { timeZone: "Broken/Zone" }
  ]));
  const invalidJson = parseCustomCities("{");

  assert.equal(single.cities[0].names.ja, "東京");
  assert.equal(Math.abs(single.cities[0].lat - 35.65) < 0.2, true);
  assert.deepEqual(sequence.cities.map((city) => city.name || city.names.en), ["London", "Desk"]);
  assert.deepEqual(mixed.cities.map((city) => city.name || city.names.en), ["Beijing"]);
  assert.deepEqual(mixed.errors.map((error) => error.type), ["invalid-timezone", "invalid-timezone"]);
  assert.deepEqual(invalidJson, { cities: [], errors: [{ type: "invalid-json" }] });
});

test("custom city overrides are optional, validated, and localized", () => {
  const manual = parseCustomCities(
    '{"timeZone":"Asia/Kolkata","name":"Mumbai","lat":"19.076","lon":"72.8777"}'
  );
  const incomplete = parseCustomCities(
    '{"timeZone":"Europe/Vienna","lat":"","lon":null}'
  );

  assert.deepEqual(
    {
      name: manual.cities[0].name,
      lat: manual.cities[0].lat,
      lon: manual.cities[0].lon,
      names: [...new Set(Object.values(manual.cities[0].names))]
    },
    { name: "Mumbai", lat: 19.076, lon: 72.8777, names: ["Mumbai"] }
  );
  assert.equal(incomplete.cities[0].names.de, "Wien");
  assert.equal(incomplete.errors[0].type, "invalid-coordinates");
  assert.equal(Number.isFinite(incomplete.cities[0].lat), true);
});

test("current city resolution handles automatic, manual, and invalid inputs", () => {
  const automatic = resolveCurrentCity({ localTimeZone: "Asia/Tokyo" });
  const manual = resolveCurrentCity({
    name: "Desk",
    coords: "48.8566,2.3522",
    timeZone: "Europe/Paris",
    localTimeZone: "Asia/Tokyo"
  });
  const invalid = resolveCurrentCity({
    coords: "200,300",
    timeZone: "Broken/Zone",
    localTimeZone: "Europe/London"
  });
  const untrustedResolved = resolveCurrentCity({
    current: true,
    lat: 95,
    lon: 200,
    timeZone: "Asia/Tokyo",
    localTimeZone: "UTC"
  });

  assert.deepEqual(
    [automatic.city.id, automatic.city.names.en, automatic.city.timeZone, automatic.errors],
    ["current", "Tokyo", "Asia/Tokyo", []]
  );
  assert.deepEqual(
    [manual.city.name, manual.city.lat, manual.city.lon, manual.city.timeZone],
    ["Desk", 48.8566, 2.3522, "Europe/Paris"]
  );
  assert.equal(invalid.city.names.en, "London");
  assert.deepEqual(
    invalid.errors.map((error) => error.type).sort(),
    ["invalid-coordinates", "invalid-timezone"]
  );
  assert.equal(Math.abs(untrustedResolved.city.lat - 35.65) < 0.2, true);
});

test("current city rejects incomplete coordinates and uses timezone coordinates", () => {
  for (const coords of [",", "35,", ",139", "，"]) {
    const result = resolveCurrentCity({
      coords,
      timeZone: "Asia/Tokyo",
      localTimeZone: "UTC"
    });
    assert.equal(result.city.manualCoordinates, false);
    assert.equal(result.city.names.ja, "東京");
    assert.equal(result.errors[0].type, "invalid-coordinates");
  }
});

test("selected cities preserve priority, slot limits, and meaningful nearby places", () => {
  const customTokyo = parseCustomCities(
    '{"timeZone":"Asia/Tokyo","name":"Custom Tokyo","lat":35.6762,"lon":139.6503}'
  ).cities[0];
  const yokohama = parseCustomCities(
    '{"timeZone":"Asia/Tokyo","name":"Yokohama","lat":35.4437,"lon":139.638}'
  ).cities[0];
  const prioritized = resolveSelectedCities({
    currentCity: { name: "Home", coords: "35.6812,139.7671", timeZone: "Asia/Tokyo" },
    customCities: [customTokyo],
    slots: ["tokyo", "london"],
    localTimeZone: "Asia/Tokyo"
  });
  const nearby = resolveSelectedCities({
    currentCity: { name: "Home", coords: "48.8566,2.3522", timeZone: "Europe/Paris" },
    customCities: [yokohama],
    slots: ["tokyo", "london"],
    localTimeZone: "Europe/Paris"
  });
  const limited = resolveSelectedCities({
    currentCity: { timeZone: "Europe/Paris" },
    slots: ["los_angeles", "new_york", "london", "shanghai", "tokyo", "sydney", "auckland"],
    localTimeZone: "Europe/Paris"
  });

  assert.deepEqual(prioritized.map((city) => city.id), ["current", "london"]);
  assert.deepEqual(nearby.map((city) => city.id), ["current", "custom-yokohama-1", "tokyo", "london"]);
  assert.deepEqual(
    limited.map((city) => city.id),
    ["current", "los_angeles", "new_york", "london", "shanghai", "tokyo", "sydney"]
  );
});

test("IANA coordinate helpers resolve modern, legacy, and fixed-offset zones", () => {
  assert.deepEqual(parseIso6709Coordinate("+3539+13944"), {
    lat: 35.65,
    lon: 139.73333333333332
  });

  const cases = {
    "America/New_York": [40.714166666666664, -74.00638888888889],
    "Asia/Calcutta": [22.533333333333335, 88.36666666666666],
    "Europe/Kiev": [50.43333333333333, 30.516666666666666]
  };
  for (const [timeZone, [lat, lon]] of Object.entries(cases)) {
    const coordinates = timeZoneCoordinates(timeZone);
    assert.equal(Math.abs(coordinates.lat - lat) < 0.2, true, timeZone);
    assert.equal(Math.abs(coordinates.lon - lon) < 0.2, true, timeZone);
  }
  assert.deepEqual(timeZoneCoordinates("Etc/GMT+5"), {
    lat: 0,
    lon: 0,
    timeZone: "Etc/GMT+5"
  });
});

test("Mercator projection supports both seams and round-trips visible points", () => {
  const seamCases = [
    ["atlantic", -168.4, 11.6],
    ["pacific", -30, 150]
  ];
  for (const [layout, seam, center] of seamCases) {
    assert.equal(Math.round(projectMercator({ lat: 0, lon: seam, width: 1000, layout }).x), 0);
    assert.equal(Math.round(projectMercator({ lat: 0, lon: center, width: 1000, layout }).x), 500);
  }

  const point = { lat: 35.6762, lon: 139.6503 };
  const projected = projectMercator({ ...point, width: 1000, layout: "pacific" });
  const restored = unprojectMercator({ ...projected, width: 1000, layout: "pacific" });
  assert.equal(Math.abs(restored.lat - point.lat) < 0.0001, true);
  assert.equal(Math.abs(restored.lon - point.lon) < 0.0001, true);
  assert.equal(projectMercator({ lat: 89, lon: 0, width: 1000 }).y, 0);
});

test("adaptive map view preserves useful latitude ranges across common aspect ratios", () => {
  const nearCore = mapViewForViewport(2340, 1080);
  assert.equal(nearCore.taskbarReserve, 56);
  assert.equal(Math.abs(nearCore.north - 66.6) < 0.001, true);
  assert.equal(Math.abs(nearCore.south + 56) < 0.001, true);
  assert.equal(nearCore.height, 1080);
  assert.equal(nearCore.usableHeight, 1024);
  assert.equal(nearCore.mode, "wide-core");
  assert.equal(nearCore.x >= 0 && nearCore.x < 10, true);
  assert.equal(Math.abs(nearCore.x * 2 + nearCore.width - 2340) < 0.001, true);

  const northExpanded = mapViewForViewport(2200, 1080);
  assert.equal(northExpanded.mode, "north-expand");
  assert.equal(northExpanded.north > 66.6 && northExpanded.north < 72, true);
  assert.equal(Math.abs(northExpanded.south + 56) < 0.001, true);

  const southStarted = mapViewForViewport(2100, 1080);
  assert.equal(southStarted.mode, "south-expand");
  assert.equal(southStarted.north, 72);
  assert.equal(southStarted.south < -56 && southStarted.south > -60, true);

  const widescreen = mapViewForViewport(1920, 1080);
  assert.equal(widescreen.mode, "south-expand");
  assert.equal(widescreen.north, 72);
  assert.equal(widescreen.south < -60 && widescreen.south > -72, true);
  assert.equal(widescreen.width, 1920);
  assert.equal(widescreen.height, 1080);
  assert.equal(widescreen.usableHeight, 1024);

  const tallerDesktop = mapViewForViewport(1920, 1200);
  assert.equal(tallerDesktop.mode, "equator");
  assert.equal(tallerDesktop.north > 73 && tallerDesktop.north < 75, true);
  assert.equal(Math.abs(tallerDesktop.north + tallerDesktop.south) < 0.001, true);
  assert.equal(tallerDesktop.usableHeight, 1200);

  const ultraWide = mapViewForViewport(3440, 1440);
  assert.equal(Math.abs(ultraWide.north - 66.6) < 0.001, true);
  assert.equal(ultraWide.width < 3440, true);
  assert.equal(ultraWide.height, 1440);
  assert.equal(ultraWide.usableHeight, 1365);
  assert.equal(ultraWide.x > 100, true);

  const portrait = mapViewForViewport(1080, 1920);
  assert.equal(portrait.north, 85);
  assert.equal(portrait.south, -85);
  assert.equal(portrait.y > 400, true);
  assert.equal(portrait.usableHeight, 1920);
  assert.equal(portrait.y + portrait.height < portrait.usableHeight, true);

  const tiny = mapViewForViewport(32, 20);
  assert.equal(tiny.taskbarReserve, 19);
  assert.equal(tiny.usableHeight, 1);
  assert.equal(tiny.height >= 1, true);
});

test("viewport and terminator helpers produce stable dimensions and coordinates", () => {
  assert.deepEqual(canvasBackingSize(1919, 1.25), { css: 1919, pixels: 2399 });
  assert.deepEqual(viewportFillRect(1920, 1032), { x: 0, y: 0, width: 1920, height: 1032 });
  // 既定の目盛りでは、セルの大きさは画面の高さに比例します。
  assert.deepEqual(
    [
      terminatorCellSize(1032, 1, TERMINATOR_PIXEL_LEVEL_DEFAULT),
      terminatorCellSize(1440, 1, TERMINATOR_PIXEL_LEVEL_DEFAULT),
      terminatorCellSize(2160, 1, TERMINATOR_PIXEL_LEVEL_DEFAULT),
      terminatorCellSize(844, 1, TERMINATOR_PIXEL_LEVEL_DEFAULT)
    ],
    [5, 7, 10, 4]
  );
  // 目盛りを上げれば粗く、下げれば細かくなります。目盛りは 1080px 基準です。
  assert.deepEqual(
    [0, 1, 5, 8].map((level) => terminatorCellDevicePixels(1080, 1, level)),
    [1, 1, 5, 8]
  );
  assert.deepEqual(
    [0, 1, 5, 8].map((level) => terminatorCellDevicePixels(2160, 1, level)),
    [1, 2, 10, 16]
  );
  // 一番下の目盛りは解像度にも拡大率にも左右されず、常に端末ピクセル 1 つ = 完全に滑らかです。
  [[1080, 1], [2160, 1], [1440, 1.5], [864, 1.25], [1600, 2]].forEach(([height, dpr]) => {
    assert.equal(terminatorCellDevicePixels(height, dpr, TERMINATOR_PIXEL_LEVEL_SMOOTH), 1);
  });
  // 壊れた値は既定へ、範囲外は両端へ寄せます。
  assert.deepEqual(
    [undefined, "", "x", -3, 99, 4.4].map(normalizeTerminatorPixelLevel),
    [
      TERMINATOR_PIXEL_LEVEL_DEFAULT,
      TERMINATOR_PIXEL_LEVEL_DEFAULT,
      TERMINATOR_PIXEL_LEVEL_DEFAULT,
      TERMINATOR_PIXEL_LEVEL_SMOOTH,
      TERMINATOR_PIXEL_LEVEL_MAX,
      4
    ]
  );
  // どの目盛り・拡大率でもセル境界は端末ピクセルへ載り、格子状の筋が出ません。
  [
    [720, 1.5],
    [864, 1.25],
    [1440, 1.75],
    [1080, 1],
    [2160, 2]
  ].forEach(([height, dpr]) => {
    for (let level = TERMINATOR_PIXEL_LEVEL_SMOOTH; level <= TERMINATOR_PIXEL_LEVEL_MAX; level += 1) {
      const devicePixels = terminatorCellSize(height, dpr, level) * dpr;
      const label = `${height}@${dpr}x level ${level}`;
      assert.equal(Math.abs(devicePixels - Math.round(devicePixels)) < 1e-9, true, label);
      assert.equal(Math.round(devicePixels) >= 1, true, label);
    }
  });
  // 海岸線も同じ基準で、1080px を 1.5px として上下限に収めます。
  assert.deepEqual(
    [coastlineWidth(720), coastlineWidth(1080), coastlineWidth(1440), coastlineWidth(2160), coastlineWidth(400)],
    [1, 1.5, 2, 3, 1]
  );

  const rect = coverMercatorRect(100, 80);
  const grid = terminatorGridCoordinates({
    width: 100,
    height: 80,
    rect,
    layout: "pacific",
    cellSize: 10
  });
  assert.equal(grid.columns.length, 10);
  assert.equal(grid.rows.length, 8);
  assert.equal(Number.isFinite(grid.columns[0].lon), true);
  assert.equal(Number.isFinite(grid.rows[0].lat), true);

  // 拡大率で割った分数のセル幅でも、位置は足し込みの誤差なく端末ピクセルへ並びます。
  const fine = terminatorGridCoordinates({
    width: 100,
    height: 80,
    rect,
    layout: "pacific",
    cellSize: 1 / 1.25
  });
  assert.equal(fine.columns.length, 125);
  assert.equal(fine.rows.length, 100);
  fine.columns.forEach((column, index) => {
    const devicePixels = column.x * 1.25;
    assert.equal(Math.abs(devicePixels - index) < 1e-9, true, `column ${index}`);
  });
});

test("terminator cells quantize into a small set of reusable fills", () => {
  // 昼側と、地図の外まで薄れた余白は塗りません。
  assert.deepEqual(
    [terminatorPaintKey(0.5, 1), terminatorPaintKey(0.1, 1), terminatorPaintKey(-0.5, 0)],
    [0, 0, 0]
  );
  assert.equal(terminatorPaintStyle(0), "");

  // 夜の深いところは濃さが一定なので、長い区間をひとまとめに塗れます。
  const deepNight = terminatorPaintKey(-0.5, 1);
  assert.equal(deepNight, terminatorPaintKey(-0.9, 1));
  assert.equal(terminatorPaintStyle(deepNight), `rgba(0, 3, 10, ${Math.round(0.44 * 255) / 255})`);

  // 薄明側は暖色で、夜側とは必ず別の値になります。
  const dawn = terminatorPaintKey(0.05, 1);
  assert.equal(dawn > 0 && dawn !== deepNight, true);
  assert.match(terminatorPaintStyle(dawn), /^rgba\(251, 191, 102, /);

  // 8bit の刻みへ丸めても、従来の計算式との差は合成後に見えない範囲に収まります。
  const cases = [
    [-0.4, 1], [-0.16, 1], [-0.08, 1], [-0.01, 0.5], [0.02, 1], [0.09, 0.3], [-0.5, 0.72]
  ];
  for (const [cosine, fade] of cases) {
    const exact = cosine < 0
      ? (cosine < -0.16 ? 0.44 : clamp(0.2 + Math.abs(cosine) / 0.16 * 0.24, 0.2, 0.44)) * fade
      : clamp((0.1 - cosine) / 0.1 * 0.11, 0.02, 0.11) * fade;
    const style = terminatorPaintStyle(terminatorPaintKey(cosine, fade));
    const painted = Number(style.slice(style.lastIndexOf(",") + 1, -1));
    assert.equal(Math.abs(painted - exact) <= 0.5 / 255, true, `${cosine}@${fade}`);
  }

  // 段階の総数が少ないから、呼ぶ側は色文字列を一度作れば使い回せます。
  const keys = new Set();
  for (let cosine = -1; cosine <= 0.1; cosine += 0.0005) {
    for (const fade of [0.18, 0.51, 1]) {
      keys.add(terminatorPaintKey(cosine, fade));
    }
  }
  assert.equal(keys.size <= 2 * 256, true, `${keys.size}`);
});

test("the per-pixel terminator path paints the same colours as the shared cells", () => {
  const width = 48;
  const height = 30;
  const view = mapViewForViewport(width, height);
  const cellSize = terminatorCellSize(height, 1, TERMINATOR_PIXEL_LEVEL_SMOOTH);
  assert.equal(cellSize, 1);
  const grid = terminatorGridCoordinates({ width, height, view, layout: "atlantic", cellSize });
  const factors = terminatorSolarFactors(grid, solarPosition(new Date(Date.UTC(2026, 2, 20, 9, 30))));
  const fades = factors.columns.map((column) => terminatorFadeAlpha(column.x + cellSize / 2, view, width));
  const pixels = new Uint8ClampedArray(width * height * 4);

  assert.equal(factors.columns.length, width);
  assert.equal(factors.rows.length, height);
  assert.equal(writeTerminatorPixels(pixels, { rows: factors.rows, columns: factors.columns, fades }), true);

  // 画素ごとの中身が、区間をまとめて塗る経路の色と 1 つずつ一致していることを確かめます。
  let painted = 0;
  factors.rows.forEach((row, rowIndex) => {
    factors.columns.forEach((column, columnIndex) => {
      const offset = (rowIndex * width + columnIndex) * 4;
      const at = `${rowIndex},${columnIndex}`;
      const paintKey = terminatorPaintKey(row.constant + row.amplitude * column.hourCosine, fades[columnIndex]);
      if (!paintKey) {
        assert.deepEqual(Array.from(pixels.slice(offset, offset + 4)), [0, 0, 0, 0], at);
        return;
      }
      const style = terminatorPaintStyle(paintKey);
      const channels = style.slice(style.indexOf("(") + 1, -1).split(",").map((part) => Number(part));
      assert.deepEqual(Array.from(pixels.slice(offset, offset + 3)), channels.slice(0, 3), at);
      assert.equal(pixels[offset + 3], Math.round(channels[3] * 255), at);
      painted += 1;
    });
  });
  assert.equal(painted > 0, true);

  // 「塗らない・夜・薄明」の 3 通りを決め打ちの値で通します。
  const branches = new Uint8ClampedArray(3 * 4);
  assert.equal(writeTerminatorPixels(branches, {
    rows: [{ constant: 0, amplitude: 1 }],
    columns: [{ hourCosine: 0.5 }, { hourCosine: -0.5 }, { hourCosine: 0.05 }],
    fades: [1, 1, 1]
  }), true);
  assert.deepEqual(Array.from(branches.slice(0, 4)), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(branches.slice(4, 7)), [0, 3, 10]);
  assert.deepEqual(Array.from(branches.slice(8, 11)), [251, 191, 102]);

  // 大きさが合わない呼び出しは、何も書かずに断って通常の塗り方へ戻せるようにします。
  const short = new Uint8ClampedArray(width * height * 4 - 4);
  const request = { rows: factors.rows, columns: factors.columns, fades };
  assert.equal(writeTerminatorPixels(short, request), false);
  assert.equal(short.every((value) => value === 0), true);
  assert.equal(writeTerminatorPixels(pixels, { ...request, fades: [] }), false);
  assert.equal(writeTerminatorPixels(null, request), false);
});

test("terminator view wraps longitudes horizontally and fades through wide margins", () => {
  const view = mapViewForViewport(3440, 1440);
  const cellSize = 10;
  const grid = terminatorGridCoordinates({
    width: 3440,
    height: 1440,
    view,
    layout: "atlantic",
    cellSize
  });
  const leftMarginColumn = grid.columns[0];
  const firstInsideColumn = grid.columns.find((column) =>
    column.x + cellSize / 2 >= view.x
  );
  assert.equal(Number.isFinite(leftMarginColumn.lon), true);
  assert.equal(Number.isFinite(firstInsideColumn.lon), true);
  const longitudeDelta = Math.abs(leftMarginColumn.lon - firstInsideColumn.lon);
  assert.equal(Math.min(longitudeDelta, 360 - longitudeDelta) < 60, true);
  assert.equal(terminatorFadeAlpha(view.x + view.width / 2, view, 3440), 1);
  assert.equal(terminatorFadeAlpha(view.x - 1, view, 3440) > 0, true);
  assert.equal(terminatorFadeAlpha(0, view, 3440), 0);

  const tinyMarginView = mapViewForViewport(2340, 1080);
  assert.equal(terminatorFadeAlpha(tinyMarginView.x / 2, tinyMarginView, 2340) > 0, true);
  assert.equal(terminatorFadeAlpha(0, tinyMarginView, 2340), 0);
});

test("map view keeps full-screen rendering separate from safe-area land limits", () => {
  const view = mapViewForViewport(1920, 1080);
  const grid = terminatorGridCoordinates({
    width: 1920,
    height: 1080,
    view,
    layout: "atlantic",
    cellSize: 8
  });
  assert.equal(grid.rows.at(-1).y >= view.usableHeight - 8, true);
  assert.equal(Number.isFinite(grid.rows.at(-1).lat), true);
  assert.equal(landSouthLimit(view), -60);
  assert.deepEqual(labelViewportForMapView(1920, 1080, view), {
    x: 0,
    y: 0,
    width: 1920,
    height: 1024
  });

  const portrait = mapViewForViewport(1080, 1920);
  const labelViewport = labelViewportForMapView(1080, 1920, portrait);
  assert.equal(labelViewport.y, portrait.y);
  assert.equal(Math.abs(labelViewport.height - portrait.height) < 0.001, true);
  assert.equal(labelViewport.y + labelViewport.height < 1920, true);
});

test("land segments break only at dataset or wrapped seams", () => {
  const cases = [
    [{ previous: { lon: 180, lat: 68.9, x: 1120 }, current: { lon: 180, lat: 64.9, x: 1120 }, width: 1920 }, true],
    [{ previous: { lon: 179.8, lat: 52, x: 1918 }, current: { lon: -179.8, lat: 52, x: 2 }, width: 1920 }, true],
    [{ previous: { lon: 178, lat: 52, x: 1100 }, current: { lon: 179, lat: 54, x: 1105 }, width: 1920 }, false]
  ];
  for (const [options, expected] of cases) {
    assert.equal(shouldBreakLandSegment(options), expected);
  }
});

test("label placement avoids markers and existing labels with a safe fallback", () => {
  const takenBoxes = [];
  const avoided = chooseLabelPlacement({
    screenX: 140,
    screenY: 100,
    viewport: { x: 0, y: 0, width: 360, height: 220 },
    estimatedWidth: 100,
    estimatedHeight: 40,
    takenBoxes,
    blockedBoxes: [{ left: 152, right: 260, top: 76, bottom: 124 }]
  });
  const fallback = chooseLabelPlacement({
    screenX: 180,
    screenY: 100,
    viewport: { x: 0, y: 0, width: 360, height: 220 },
    estimatedWidth: 100,
    estimatedHeight: 40,
    takenBoxes: [],
    blockedBoxes: [{ left: 0, right: 360, top: 0, bottom: 220 }]
  });
  const crowded = chooseLabelPlacement({
    screenX: 470,
    screenY: 120,
    viewport: { x: 0, y: 0, width: 560, height: 260 },
    estimatedWidth: 100,
    estimatedHeight: 40,
    takenBoxes: [
      { left: 356, right: 456, top: 100, bottom: 140 },
      { left: 356, right: 456, top: 66, bottom: 106 }
    ],
    blockedBoxes: []
  });

  assert.equal(avoided.placement, "left");
  assert.equal(takenBoxes.length, 1);
  assert.notEqual(fallback, null);
  assert.notEqual(crowded, null);
});

test("label metrics scale consistently and compact short viewports", () => {
  const small = labelMetrics("small", 1280, 720);
  const medium = labelMetrics("medium", 1280, 720);
  const large = labelMetrics("large", 1280, 720);
  const compact = labelMetrics("medium", 1280, 480);

  for (const field of ["estimatedWidth", "estimatedHeight", "namePx", "timePx", "iconPx"]) {
    assert.equal(small[field] < medium[field], true, field);
    assert.equal(medium[field] < large[field], true, field);
  }
  assert.equal(compact.estimatedWidth < medium.estimatedWidth, true);
  assert.deepEqual(labelMetrics("broken", 1280, 720), small);
});

test("solar helpers share a required position and identify day and night", () => {
  const date = new Date("2026-03-20T12:00:00Z");
  const sun = solarPosition(date);
  assert.equal(
    Math.abs(solarCosineFromPosition(35.6762, 139.6503, sun) - solarCosine(35.6762, 139.6503, date)) < 1e-12,
    true
  );
  assert.throws(() => solarCosineFromPosition(0, 0), /Solar position is required/);
  assert.equal(isDaylightAt({ lat: 0, lon: 0, date }), true);
  assert.equal(isDaylightAt({ lat: 0, lon: 0, date: new Date("2026-03-20T00:00:00Z") }), false);
});

test("terminator solar factors match direct cosine calculations", () => {
  const grid = terminatorGridCoordinates({
    width: 32,
    height: 24,
    rect: coverMercatorRect(32, 24),
    layout: "pacific",
    cellSize: 8
  });
  const sun = solarPosition(new Date("2026-06-23T00:00:00Z"));
  const factors = terminatorSolarFactors(grid, sun);

  for (let rowIndex = 0; rowIndex < grid.rows.length; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < grid.columns.length; columnIndex += 1) {
      const row = factors.rows[rowIndex];
      const column = factors.columns[columnIndex];
      const actual = row.constant + row.amplitude * column.hourCosine;
      const expected = solarCosineFromPosition(
        grid.rows[rowIndex].lat,
        grid.columns[columnIndex].lon,
        sun
      );
      assert.equal(Math.abs(actual - expected) < 1e-12, true);
    }
  }
  assert.throws(() => terminatorSolarFactors(grid), /Solar position is required/);
});

test("clock schedulers align to their configured boundaries", () => {
  assert.deepEqual(
    [
      nextClockDelay(1234, true),
      nextClockDelay(1234, false),
      nextTerminatorDelay(1234),
      nextTerminatorDelay(9999)
    ],
    [766, 58766, 3766, 1]
  );
});

test("zoned time formatting follows IANA rules and requested precision", () => {
  const date = new Date("2026-01-15T00:05:07Z");
  assert.equal(formatZonedTime(date, "Asia/Tokyo", true, true, "en-US"), "9:05:07");
  assert.equal(formatZonedTime(date, "Asia/Tokyo", true, false, "ja-JP"), "9:05");
  assert.match(formatZonedTime(date, "Asia/Tokyo", false, true, "en-US"), /^9:05:07\s*AM$/);
  assert.equal(
    formatZonedTime(new Date("2026-07-15T12:00:00Z"), "Europe/London", true, true, "en-US"),
    "13:00:00"
  );
  assert.equal(CITY_PRESETS.eucla.timeZone, "Australia/Eucla");
});

test("runtime language helpers support every generated language and English fallback", () => {
  const expected = {
    zh: "zh-CN",
    "zh-hant": "zh-TW",
    en: "en-US",
    ja: "ja-JP",
    ko: "ko-KR",
    es: "es-ES",
    ru: "ru-RU",
    pt: "pt-BR",
    de: "de-DE",
    fr: "fr-FR"
  };
  for (const [language, locale] of Object.entries(expected)) {
    assert.equal(resolveRuntimeLanguage(language), language);
    assert.equal(localeForLanguage(language), locale);
  }
  assert.equal(getCityName({ name: "Manual", names: { en: "Manual" } }, "en"), "Manual");
  assert.equal(getCityName({ id: "tokyo", names: { en: "Tokyo", ja: "東京" } }, "ja"), "東京");
  assert.equal(getCityName({ id: "london", names: { en: "London", fr: "Londres" } }, "fr"), "Londres");
  assert.equal(resolveRuntimeLanguage("broken"), "en");
  assert.equal(localeForLanguage("broken"), "en-US");
});
