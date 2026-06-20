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
  labelMetrics,
  isDaylightAt,
  localeForLanguage,
  parseIso6709Coordinate,
  parseCustomCities,
  projectMercator,
  resolveCurrentCity,
  resolveSelectedCities,
  resolveRuntimeLanguage,
  timeZoneCoordinates,
  shouldBreakLandSegment,
  terminatorCellSize,
  unprojectMercator,
  viewportFillRect
} = require("../src/wallpaper-core.js");

test("parseCustomCities keeps valid entries and ignores invalid entries", () => {
  const result = parseCustomCities(JSON.stringify([
    { name: "Paris", lat: 48.8566, lon: 2.3522, timeZone: "Europe/Paris" },
    { name: "", lat: 0, lon: 0 },
    { name: "Broken", lat: 200, lon: 0, timeZone: "Broken/Zone" }
  ]));

  assert.equal(result.cities.length, 1);
  assert.equal(result.cities[0].name, "Paris");
  assert.equal(result.cities[0].timeZone, "Europe/Paris");
  assert.equal(result.errors.length, 2);
});

test("parseCustomCities handles invalid JSON without throwing", () => {
  const result = parseCustomCities("{");

  assert.deepEqual(result.cities, []);
  assert.equal(result.errors.length, 1);
});

test("parseCustomCities accepts an object without array brackets and auto-fills from timezone", () => {
  const result = parseCustomCities('{"timeZone":"Asia/Tokyo"}');

  assert.equal(result.errors.length, 0);
  assert.equal(result.cities.length, 1);
  assert.equal(result.cities[0].timeZone, "Asia/Tokyo");
  assert.equal(result.cities[0].names.ja, "東京");
  assert.equal(result.cities[0].names.ko, "도쿄");
  assert.equal(Math.abs(result.cities[0].lat - 35.65) < 0.2, true);
  assert.equal(Math.abs(result.cities[0].lon - 139.74) < 0.2, true);
});

test("parseCustomCities uses the IANA representative location for any timezone", () => {
  const shanghai = parseCustomCities('{"timeZone":"Asia/Shanghai"}').cities[0];
  const kolkata = parseCustomCities('{"timeZone":"Asia/Kolkata"}').cities[0];

  assert.equal(shanghai.names.en, "Shanghai");
  assert.equal(shanghai.names.zh, "上海");
  assert.equal(Math.abs(shanghai.lat - 31.2333) < 0.01, true);
  assert.equal(Math.abs(shanghai.lon - 121.4667) < 0.01, true);
  assert.equal(kolkata.names.en, "Kolkata");
  assert.equal(kolkata.names.ja, "コルカタ");
  assert.equal(Math.abs(kolkata.lat - 22.5333) < 0.01, true);
  assert.equal(Math.abs(kolkata.lon - 88.3667) < 0.01, true);
});

test("parseCustomCities localizes IANA cities that are not in the curated list", () => {
  const vienna = parseCustomCities('{"timeZone":"Europe/Vienna"}').cities[0];

  assert.equal(vienna.names.en, "Vienna");
  assert.equal(vienna.names.de, "Wien");
  assert.equal(vienna.names.ja, "ウィーン");
});

test("parseCustomCities accepts multiple objects without array brackets", () => {
  const result = parseCustomCities([
    '{"timeZone":"Asia/Tokyo"}',
    '{"timeZone":"Europe/Amsterdam","name":"Desk"}'
  ].join("\n"));

  assert.equal(result.errors.length, 0);
  assert.equal(result.cities.length, 2);
  assert.equal(result.cities[1].name, "Desk");
  assert.equal(result.cities[1].timeZone, "Europe/Amsterdam");
  assert.equal(Math.abs(result.cities[1].lat - 52.37) < 0.2, true);
});

test("custom city manual name overrides the timezone city name in every language", () => {
  const result = parseCustomCities('{"timeZone":"America/Toronto","name":"ウォータールー","lat":43.4643,"lon":-80.5204}');
  const city = result.cities[0];

  assert.equal(result.errors.length, 0);
  assert.equal(getCityName(city, "ja"), "ウォータールー");
  assert.equal(getCityName(city, "en"), "ウォータールー");
});

test("parseCustomCities requires timezone but treats name and coordinates as optional overrides", () => {
  const result = parseCustomCities([
    '{"name":"Missing zone"}',
    '{"timeZone":"Europe/London","lat":48.8566,"lon":2.3522}'
  ].join("\n"));

  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].type, "invalid-timezone");
  assert.equal(result.cities.length, 1);
  assert.equal(result.cities[0].lat, 48.8566);
  assert.equal(result.cities[0].lon, 2.3522);
  assert.equal(result.cities[0].names.en, "London");
});

test("parseCustomCities rejects empty coordinate values before falling back to timezone coordinates", () => {
  const nullCoordinates = parseCustomCities('{"timeZone":"Asia/Tokyo","lat":null,"lon":null}');
  const emptyCoordinates = parseCustomCities('{"timeZone":"Asia/Tokyo","lat":"","lon":""}');

  for (const result of [nullCoordinates, emptyCoordinates]) {
    assert.equal(result.cities.length, 1);
    assert.equal(result.errors[0].type, "invalid-coordinates");
    assert.equal(Math.abs(result.cities[0].lat - 35.65) < 0.2, true);
    assert.equal(Math.abs(result.cities[0].lon - 139.74) < 0.2, true);
  }
});

test("resolveSelectedCities gives custom cities priority over dropdown presets", () => {
  const result = resolveSelectedCities({
    currentCity: { name: "", coords: "", timeZone: "Asia/Tokyo" },
    slots: ["london", "london", "empty", "tokyo"],
    customCities: [{ id: "custom-paris", name: "Paris", lat: 48.8566, lon: 2.3522, timeZone: "Europe/Paris" }],
    localTimeZone: "Asia/Tokyo"
  });

  assert.deepEqual(result.map((city) => city.id), ["current", "custom-paris", "london"]);
  assert.equal(result[0].current, true);
});

test("resolveSelectedCities deduplicates the same place by current custom preset priority", () => {
  const customTokyo = parseCustomCities('{"timeZone":"Asia/Tokyo","name":"Custom Tokyo","lat":35.6762,"lon":139.6503}').cities[0];
  const result = resolveSelectedCities({
    currentCity: { name: "Home", coords: "35.6812,139.7671", timeZone: "Asia/Tokyo" },
    customCities: [customTokyo],
    slots: ["tokyo", "london"],
    localTimeZone: "Asia/Tokyo"
  });

  assert.deepEqual(result.map((city) => city.id), ["current", "london"]);
});

test("resolveSelectedCities keeps distinct cities that share one timezone", () => {
  const customToronto = parseCustomCities('{"timeZone":"America/Toronto"}').cities[0];
  const result = resolveSelectedCities({
    currentCity: { name: "Waterloo", coords: "43.4643,-80.5204", timeZone: "America/Toronto" },
    customCities: [customToronto],
    slots: ["toronto", "london"],
    localTimeZone: "America/Toronto"
  });

  assert.deepEqual(result.map((city) => city.id), ["current", "custom-toronto-1", "london"]);
});

test("resolveCurrentCity maps automatic fields to the detected local timezone", () => {
  const result = resolveCurrentCity({
    name: "",
    coords: "",
    timeZone: "",
    localTimeZone: "Asia/Tokyo"
  });

  assert.equal(result.city.id, "current");
  assert.equal(result.city.current, true);
  assert.equal(result.city.names.en, "Tokyo");
  assert.equal(result.city.timeZone, "Asia/Tokyo");
  assert.equal(Math.abs(result.city.lat - 35.65) < 0.2, true);
  assert.equal(Math.abs(result.city.lon - 139.73333333333332) < 0.2, true);
  assert.deepEqual(result.errors, []);
});

test("resolveCurrentCity uses IANA representative cities independently of the curated list", () => {
  const shanghai = resolveCurrentCity({
    name: "",
    coords: "",
    timeZone: "Asia/Shanghai",
    localTimeZone: "UTC"
  }).city;
  const kolkata = resolveCurrentCity({
    name: "",
    coords: "",
    timeZone: "Asia/Kolkata",
    localTimeZone: "UTC"
  }).city;

  assert.equal(shanghai.names.en, "Shanghai");
  assert.equal(shanghai.names.zh, "上海");
  assert.equal(Math.abs(shanghai.lat - 31.2333) < 0.01, true);
  assert.equal(Math.abs(shanghai.lon - 121.4667) < 0.01, true);
  assert.equal(kolkata.names.en, "Kolkata");
  assert.equal(kolkata.names.ko, "콜카타");
  assert.equal(Math.abs(kolkata.lat - 22.5333) < 0.01, true);
  assert.equal(Math.abs(kolkata.lon - 88.3667) < 0.01, true);
});

test("resolveCurrentCity uses manual name coordinates and timezone first", () => {
  const result = resolveCurrentCity({
    name: "Desk",
    coords: "48.8566,2.3522",
    timeZone: "Europe/Paris",
    localTimeZone: "Asia/Tokyo"
  });

  assert.equal(result.city.name, "Desk");
  assert.equal(result.city.lat, 48.8566);
  assert.equal(result.city.lon, 2.3522);
  assert.equal(result.city.timeZone, "Europe/Paris");
  assert.deepEqual(result.errors, []);
});

test("resolveCurrentCity falls back from invalid manual fields without throwing", () => {
  const result = resolveCurrentCity({
    name: "",
    coords: "200,300",
    timeZone: "Broken/Zone",
    localTimeZone: "Europe/London"
  });

  assert.equal(result.city.timeZone, "Europe/London");
  assert.equal(result.city.names.en, "London");
  assert.equal(result.errors.some((error) => error.type === "invalid-coordinates"), true);
  assert.equal(result.errors.some((error) => error.type === "invalid-timezone"), true);
});

test("resolveCurrentCity rejects incomplete coordinates before using timezone coordinates", () => {
  for (const coords of [",", "35,", ",139", "，"]) {
    const result = resolveCurrentCity({
      name: "",
      coords,
      timeZone: "Asia/Tokyo",
      localTimeZone: "Europe/London"
    });

    assert.equal(result.city.manualCoordinates, false);
    assert.equal(result.errors[0].type, "invalid-coordinates");
    assert.equal(Math.abs(result.city.lat - 35.65) < 0.2, true);
    assert.equal(Math.abs(result.city.lon - 139.74) < 0.2, true);
  }
});

test("parseIso6709Coordinate handles zone1970 coordinates", () => {
  const tokyo = parseIso6709Coordinate("+3539+13944");
  const adelaide = parseIso6709Coordinate("-3455+13835");

  assert.equal(Math.abs(tokyo.lat - 35.65) < 0.001, true);
  assert.equal(Math.abs(tokyo.lon - 139.73333333333332) < 0.001, true);
  assert.equal(Math.abs(adelaide.lat + 34.916666666666664) < 0.001, true);
  assert.equal(Math.abs(adelaide.lon - 138.58333333333334) < 0.001, true);
});

test("timeZoneCoordinates resolves common IANA zones through zone1970", () => {
  const tokyo = timeZoneCoordinates("Asia/Tokyo");
  const newYork = timeZoneCoordinates("America/New_York");
  const london = timeZoneCoordinates("Europe/London");
  const amsterdam = timeZoneCoordinates("Europe/Amsterdam");
  const calcutta = timeZoneCoordinates("Asia/Calcutta");
  const kiev = timeZoneCoordinates("Europe/Kiev");
  const fixedOffset = timeZoneCoordinates("Etc/GMT+5");
  const utc = timeZoneCoordinates("UTC");

  assert.equal(Math.abs(tokyo.lat - 35.65) < 0.2, true);
  assert.equal(Math.abs(tokyo.lon - 139.73333333333332) < 0.2, true);
  assert.equal(Math.abs(newYork.lat - 40.714166666666664) < 0.2, true);
  assert.equal(Math.abs(newYork.lon + 74.00638888888889) < 0.2, true);
  assert.equal(Math.abs(london.lat - 51.50833333333333) < 0.2, true);
  assert.equal(Math.abs(london.lon + 0.12527777777777777) < 0.2, true);
  assert.equal(Math.abs(amsterdam.lat - 52.36666666666667) < 0.2, true);
  assert.equal(Math.abs(amsterdam.lon - 4.9) < 0.2, true);
  assert.equal(Math.abs(calcutta.lat - 22.533333333333335) < 0.2, true);
  assert.equal(Math.abs(calcutta.lon - 88.36666666666666) < 0.2, true);
  assert.equal(Math.abs(kiev.lat - 50.43333333333333) < 0.2, true);
  assert.equal(Math.abs(kiev.lon - 30.516666666666666) < 0.2, true);
  assert.deepEqual(fixedOffset, { lat: 0, lon: 0, timeZone: "Etc/GMT+5" });
  assert.deepEqual(utc, { lat: 0, lon: 0, timeZone: "UTC" });
});

test("resolveSelectedCities prepends current city to the six configured extra slots", () => {
  const result = resolveSelectedCities({
    currentCity: { name: "", coords: "", timeZone: "Europe/Paris" },
    slots: ["los_angeles", "new_york", "london", "shanghai", "tokyo", "sydney", "paris"],
    customCities: [],
    localTimeZone: "Europe/Paris"
  });

  assert.deepEqual(result.map((city) => city.id), ["current", "los_angeles", "new_york", "london", "shanghai", "tokyo", "sydney"]);
});

test("resolveSelectedCities deduplicates automatic current city against explicit same timezone", () => {
  const result = resolveSelectedCities({
    currentCity: { name: "", coords: "", timeZone: "Asia/Tokyo" },
    slots: ["tokyo", "tokyo", "london"],
    customCities: [],
    localTimeZone: "Asia/Tokyo"
  });

  assert.deepEqual(result.map((city) => city.id), ["current", "london"]);
  assert.equal(result[0].timeZone, "Asia/Tokyo");
});

test("resolveSelectedCities deduplicates Shanghai and Kolkata after automatic current-city resolution", () => {
  const shanghai = resolveSelectedCities({
    currentCity: { name: "", coords: "", timeZone: "Asia/Shanghai" },
    slots: ["shanghai", "london"],
    customCities: [],
    localTimeZone: "Asia/Shanghai"
  });
  const kolkata = resolveSelectedCities({
    currentCity: { name: "", coords: "", timeZone: "Asia/Kolkata" },
    slots: ["kolkata", "london"],
    customCities: [],
    localTimeZone: "Asia/Kolkata"
  });

  assert.deepEqual(shanghai.map((city) => city.id), ["current", "london"]);
  assert.equal(shanghai[0].names.en, "Shanghai");
  assert.deepEqual(kolkata.map((city) => city.id), ["current", "london"]);
  assert.equal(kolkata[0].names.en, "Kolkata");
});

test("resolveSelectedCities keeps distant explicit city in the same timezone", () => {
  const result = resolveSelectedCities({
    currentCity: { name: "Waterloo", coords: "43.4643,-80.5204", timeZone: "America/Toronto" },
    slots: ["toronto", "london"],
    customCities: [],
    localTimeZone: "America/Toronto"
  });

  assert.deepEqual(result.map((city) => city.id), ["current", "toronto", "london"]);
  assert.equal(result[0].manualCoordinates, true);
});

test("projectMercator places Greenwich according to each layout seam", () => {
  const atlantic = projectMercator({ lat: 0, lon: 0, width: 1000, height: 500, layout: "atlantic" });
  const pacific = projectMercator({ lat: 0, lon: 0, width: 1000, height: 500, layout: "pacific" });

  assert.equal(Math.round(atlantic.x), 469);
  assert.equal(Math.round(pacific.x), 83);
  assert.equal(atlantic.y > 290, true);
  assert.equal(atlantic.y < 320, true);
});

test("projectMercator uses the configured Atlantic and Pacific seams", () => {
  const atlanticSeam = projectMercator({ lat: 0, lon: -169, width: 1000, height: 500, layout: "atlantic" });
  const atlanticCenter = projectMercator({ lat: 0, lon: 11, width: 1000, height: 500, layout: "atlantic" });
  const pacificSeam = projectMercator({ lat: 0, lon: -30, width: 1000, height: 500, layout: "pacific" });
  const pacificCenter = projectMercator({ lat: 0, lon: 150, width: 1000, height: 500, layout: "pacific" });
  const pacificAuckland = projectMercator({ lat: -36.8485, lon: 174.7633, width: 1000, height: 500, layout: "pacific" });

  assert.equal(Math.round(atlanticSeam.x), 0);
  assert.equal(Math.round(atlanticCenter.x), 500);
  assert.equal(Math.round(pacificSeam.x), 0);
  assert.equal(Math.round(pacificCenter.x), 500);
  assert.equal(pacificAuckland.x > 565, true);
  assert.equal(pacificAuckland.x < 570, true);
});

test("canvasBackingSize never undersizes fractional device pixels", () => {
  assert.deepEqual(canvasBackingSize(1919, 1.25), { css: 1919, pixels: 2399 });
  assert.deepEqual(canvasBackingSize(1920, 1.5), { css: 1920, pixels: 2880 });
  assert.deepEqual(canvasBackingSize(0, 2), { css: 1, pixels: 2 });
});

test("projectMercator maps north latitude 72 to the top edge and keeps one world width", () => {
  const north = projectMercator({ lat: 72, lon: 0, width: 1000, height: 500, layout: "atlantic" });
  const south = projectMercator({ lat: -60, lon: 0, width: 1000, height: 500, layout: "atlantic" });
  const seam = projectMercator({ lat: 0, lon: -169, width: 1000, height: 500, layout: "atlantic" });

  assert.equal(Math.round(north.y), 0);
  assert.equal(south.y > 450, true);
  assert.equal(south.y < 550, true);
  assert.equal(Math.round(seam.x), 0);
});

test("coverMercatorRect always maps one world circumference to the viewport width and top-aligns", () => {
  const sixteenNine = coverMercatorRect(1920, 1080);
  const ultrawide = coverMercatorRect(2560, 1080);

  assert.equal(sixteenNine.width, 1920);
  assert.equal(sixteenNine.x, 0);
  assert.equal(sixteenNine.y, 0);
  assert.equal(sixteenNine.height < 1080, true);
  assert.equal(sixteenNine.height > 900, true);
  assert.equal(ultrawide.width, 2560);
  assert.equal(ultrawide.x, 0);
  assert.equal(ultrawide.y, 0);
  assert.equal(ultrawide.height > 1080, true);
});

test("viewportFillRect covers the full viewport below the clipped map", () => {
  assert.deepEqual(viewportFillRect(1920, 1032), { x: 0, y: 0, width: 1920, height: 1032 });
});

test("projectMercator clamps very high latitudes into the visible map", () => {
  const north = projectMercator({ lat: 89, lon: 0, width: 1000, height: 500, layout: "atlantic" });
  const south = projectMercator({ lat: -89, lon: 0, width: 1000, height: 500, layout: "atlantic" });

  assert.equal(Math.round(north.y), 0);
  assert.equal(Number.isFinite(south.y), true);
  assert.equal(south.y > 0, true);
});

test("unprojectMercator round-trips visible points and allows extension below the clipped map", () => {
  const projected = projectMercator({ lat: 35.6762, lon: 139.6503, width: 1000, layout: "pacific" });
  const roundTrip = unprojectMercator({ x: projected.x, y: projected.y, width: 1000, layout: "pacific" });
  const rect = coverMercatorRect(1000, 800);
  const below = unprojectMercator({ x: 500, y: rect.height + 80, width: 1000, layout: "atlantic" });

  assert.equal(Math.abs(roundTrip.lat - 35.6762) < 0.0001, true);
  assert.equal(Math.abs(roundTrip.lon - 139.6503) < 0.0001, true);
  assert.equal(below.lat < -60, true);
});

test("terminatorCellSize returns square screen pixels", () => {
  const desktop = terminatorCellSize(1920, 1032);
  const highResolution = terminatorCellSize(2560, 1440);
  const mobile = terminatorCellSize(390, 844);

  assert.equal(desktop, 8);
  assert.equal(highResolution, 10);
  assert.equal(mobile, 4);
  assert.equal(Number.isInteger(desktop), true);
  assert.equal(Number.isInteger(highResolution), true);
  assert.equal(Number.isInteger(mobile), true);
  assert.equal(desktop > 1, true);
  assert.equal(highResolution > 1, true);
  assert.equal(mobile > 1, true);
});

test("shouldBreakLandSegment skips artificial antimeridian cut edges", () => {
  const antimeridian = shouldBreakLandSegment({
    previous: { lon: 180, lat: 68.963722, x: 1120 },
    current: { lon: 180, lat: 64.979584, x: 1120 },
    width: 1920
  });
  const wrapped = shouldBreakLandSegment({
    previous: { lon: 179.8, lat: 52, x: 1918 },
    current: { lon: -179.8, lat: 52, x: 2 },
    width: 1920
  });
  const ordinary = shouldBreakLandSegment({
    previous: { lon: 178, lat: 52, x: 1100 },
    current: { lon: 179, lat: 54, x: 1105 },
    width: 1920
  });

  assert.equal(antimeridian, true);
  assert.equal(wrapped, true);
  assert.equal(ordinary, false);
});

test("chooseLabelPlacement avoids blocked marker boxes before using a placement", () => {
  const takenBoxes = [];
  const placement = chooseLabelPlacement({
    screenX: 140,
    screenY: 100,
    viewport: { x: 0, y: 0, width: 360, height: 220 },
    estimatedWidth: 100,
    estimatedHeight: 40,
    takenBoxes,
    blockedBoxes: [{ left: 152, right: 260, top: 76, bottom: 124 }]
  });

  assert.equal(placement.placement, "left");
  assert.equal(takenBoxes.length, 1);
  assert.equal(takenBoxes[0].right <= 126, true);
});

test("chooseLabelPlacement falls back when marker avoidance would hide the label", () => {
  const placement = chooseLabelPlacement({
    screenX: 180,
    screenY: 100,
    viewport: { x: 0, y: 0, width: 360, height: 220 },
    estimatedWidth: 100,
    estimatedHeight: 40,
    takenBoxes: [],
    blockedBoxes: [{ left: 0, right: 360, top: 0, bottom: 220 }]
  });

  assert.notEqual(placement, null);
  assert.equal(placement.placement, "right");
});

test("chooseLabelPlacement keeps searching farther vertical offsets near an edge", () => {
  const placement = chooseLabelPlacement({
    screenX: 470,
    screenY: 120,
    viewport: { x: 0, y: 0, width: 560, height: 260 },
    estimatedWidth: 100,
    estimatedHeight: 40,
    takenBoxes: [
      { left: 356, right: 456, top: 100, bottom: 140 },
      { left: 356, right: 456, top: 66, bottom: 106 },
      { left: 356, right: 456, top: 134, bottom: 174 },
      { left: 356, right: 456, top: 188, bottom: 228 }
    ],
    blockedBoxes: []
  });

  assert.notEqual(placement, null);
  assert.equal(placement.placement, "left");
  assert.equal(placement.y < 60, true);
});

test("labelMetrics scales label box, text, and day-night icon together", () => {
  const small = labelMetrics("small", 1280);
  const medium = labelMetrics("medium", 1280);
  const large = labelMetrics("large", 1280);
  const fallback = labelMetrics("broken", 1280);

  assert.deepEqual(fallback, small);
  assert.equal(small.scale, 1);
  assert.equal(medium.scale >= 1.34, true);
  assert.equal(large.scale >= 1.68, true);
  assert.equal(small.estimatedWidth < medium.estimatedWidth, true);
  assert.equal(medium.estimatedWidth < large.estimatedWidth, true);
  assert.equal(small.estimatedHeight < medium.estimatedHeight, true);
  assert.equal(medium.estimatedHeight < large.estimatedHeight, true);
  assert.equal(small.iconPx < medium.iconPx, true);
  assert.equal(medium.iconPx < large.iconPx, true);
  assert.equal(small.timePx < medium.timePx, true);
  assert.equal(medium.timePx < large.timePx, true);
  assert.equal(small.nameLineHeight < medium.nameLineHeight, true);
  assert.equal(medium.nameLineHeight <= large.nameLineHeight, true);
  assert.equal(small.timeLineHeight < medium.timeLineHeight, true);
  assert.equal(medium.timeLineHeight <= large.timeLineHeight, true);
  assert.equal(small.timeGapPx < medium.timeGapPx, true);
  assert.equal(medium.timeGapPx < large.timeGapPx, true);
});

test("labelMetrics uses compact dimensions for short viewports", () => {
  const regular = labelMetrics("medium", 1280, 720);
  const short = labelMetrics("medium", 1280, 480);

  assert.equal(short.estimatedWidth < regular.estimatedWidth, true);
  assert.equal(short.estimatedHeight < regular.estimatedHeight, true);
  assert.equal(short.namePx < regular.namePx, true);
  assert.equal(short.timePx < regular.timePx, true);
});

test("isDaylightAt identifies approximate equinox noon and midnight at Greenwich", () => {
  const noon = new Date("2026-03-20T12:00:00Z");
  const midnight = new Date("2026-03-20T00:00:00Z");

  assert.equal(isDaylightAt({ lat: 0, lon: 0, date: noon }), true);
  assert.equal(isDaylightAt({ lat: 0, lon: 0, date: midnight }), false);
});

test("formatZonedTime uses IANA timezone rules through Intl", () => {
  const winter = formatZonedTime(new Date("2026-01-15T12:00:00Z"), "Europe/London", true, true, "en-US");
  const summer = formatZonedTime(new Date("2026-07-15T12:00:00Z"), "Europe/London", true, true, "en-US");
  const morning = formatZonedTime(new Date("2026-01-15T12:30:00Z"), "America/New_York", false, true, "en-US");

  assert.equal(winter, "12:00:00");
  assert.equal(summer, "13:00:00");
  assert.match(morning, /AM|PM/);
  assert.equal(CITY_PRESETS.london.timeZone, "Europe/London");
  assert.equal(CITY_PRESETS.new_york.timeZone, "America/New_York");
  assert.equal(CITY_PRESETS.sydney.timeZone, "Australia/Sydney");
  assert.equal(CITY_PRESETS.regina.timeZone, "America/Regina");
  assert.equal(CITY_PRESETS.eucla.timeZone, "Australia/Eucla");
  assert.equal(CITY_PRESETS.havana.timeZone, "America/Havana");
  assert.equal(CITY_PRESETS.kabul.timeZone, "Asia/Kabul");
  assert.equal(CITY_PRESETS.beirut.timeZone, "Asia/Beirut");
  assert.equal(CITY_PRESETS.chisinau.timeZone, "Europe/Chisinau");
});

test("formatZonedTime removes the leading zero only from single-digit hours", () => {
  const date = new Date("2026-01-15T00:05:07Z");

  assert.equal(formatZonedTime(date, "Asia/Tokyo", true, true, "en-US"), "9:05:07");
  assert.equal(formatZonedTime(date, "Asia/Tokyo", true, true, "zh-CN"), "9:05:07");
  assert.equal(formatZonedTime(date, "Asia/Tokyo", true, true, "ja-JP"), "9:05:07");
  assert.match(formatZonedTime(date, "Asia/Tokyo", false, true, "en-US"), /^9:05:07\s*AM$/);
  assert.equal(formatZonedTime(date, "Asia/Tokyo", true, false, "ja-JP"), "9:05");
});

test("resolveRuntimeLanguage supports explicit choices and defaults unknown values to English", () => {
  assert.equal(resolveRuntimeLanguage("zh"), "zh");
  assert.equal(resolveRuntimeLanguage("zh-hant"), "zh-hant");
  assert.equal(resolveRuntimeLanguage("en"), "en");
  assert.equal(resolveRuntimeLanguage("ja"), "ja");
  assert.equal(resolveRuntimeLanguage("ko"), "ko");
  assert.equal(resolveRuntimeLanguage("es"), "es");
  assert.equal(resolveRuntimeLanguage("ru"), "ru");
  assert.equal(resolveRuntimeLanguage("pt"), "pt");
  assert.equal(resolveRuntimeLanguage("de"), "de");
  assert.equal(resolveRuntimeLanguage("auto"), "en");
  assert.equal(resolveRuntimeLanguage("broken"), "en");
});

test("localeForLanguage uses generated locales for every supported language", () => {
  assert.deepEqual(
    ["zh", "zh-hant", "en", "ja", "ko", "es", "ru", "pt", "de"].map(localeForLanguage),
    ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR", "es-ES", "ru-RU", "pt-BR", "de-DE"]
  );
  assert.equal(localeForLanguage("broken"), "en-US");
});
