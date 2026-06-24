import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  CITY_PRESETS,
  canvasBackingSize,
  chooseLabelPlacement,
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
  terminatorCellSize,
  terminatorFadeAlpha,
  terminatorGridCoordinates,
  terminatorSolarFactors,
  timeZoneCoordinates,
  unprojectMercator,
  viewportFillRect
} = require("../src/wallpaper-core.js");

test("custom city parsing accepts supported formats and reports invalid entries", () => {
  const single = parseCustomCities('{"timeZone":"Asia/Tokyo"}');
  const sequence = parseCustomCities(
    '{"timeZone":"Europe/London"},{"timeZone":"Europe/Paris","name":"Desk"}'
  );
  const mixed = parseCustomCities(JSON.stringify([
    { timeZone: "Asia/Shanghai" },
    { name: "Missing timezone" },
    { timeZone: "Broken/Zone" }
  ]));
  const invalidJson = parseCustomCities("{");

  assert.equal(single.cities[0].names.ja, "東京");
  assert.equal(Math.abs(single.cities[0].lat - 35.65) < 0.2, true);
  assert.deepEqual(sequence.cities.map((city) => city.name || city.names.en), ["London", "Desk"]);
  assert.deepEqual(mixed.cities.map((city) => city.names.en), ["Shanghai"]);
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
      ja: manual.cities[0].names.ja
    },
    { name: "Mumbai", lat: 19.076, lon: 72.8777, ja: "コルカタ" }
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
      timeZone: "Asia/Shanghai",
      localTimeZone: "UTC"
    });
    assert.equal(result.city.manualCoordinates, false);
    assert.equal(result.city.names.zh, "上海");
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
  assert.deepEqual(
    [terminatorCellSize(1920, 1032), terminatorCellSize(2560, 1440), terminatorCellSize(390, 844)],
    [8, 10, 4]
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
    de: "de-DE"
  };
  for (const [language, locale] of Object.entries(expected)) {
    assert.equal(resolveRuntimeLanguage(language), language);
    assert.equal(localeForLanguage(language), locale);
  }
  assert.equal(getCityName({ name: "Manual", names: { en: "Generated" } }, "en"), "Manual");
  assert.equal(getCityName({ id: "tokyo", names: { en: "Tokyo", ja: "東京" } }, "ja"), "東京");
  assert.equal(resolveRuntimeLanguage("broken"), "en");
  assert.equal(localeForLanguage("broken"), "en-US");
});
