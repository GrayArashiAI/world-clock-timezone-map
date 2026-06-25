import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import languageDefinitions, { LANGUAGE_ORDER } from "../data/languages.mjs";

const require = createRequire(import.meta.url);
const cityPresetData = require("../src/city-presets.js");
const project = JSON.parse(readFileSync(new URL("../project.json", import.meta.url), "utf8"));
const cityPresetSource = readFileSync(new URL("../src/city-presets.js", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const properties = project.general.properties;
const workshopUrl = "https://steamcommunity.com/sharedfiles/filedetails/?id=3747734053";
const ianaUrl = "https://data.iana.org/time-zones/tzdb-2026b/zone.tab";
const readmeUrls = [
  new URL("../README.md", import.meta.url),
  ...["zh-Hant", "en", "ja", "ko", "es", "ru", "pt", "de"].map(
    (language) => new URL(`../docs/readme/README.${language}.md`, import.meta.url)
  )
];
const workshopDescriptionUrls = ["zh-Hans", "zh-Hant", "en", "ja", "ko", "es", "ru", "pt", "de"].map(
  (language) => new URL(`../docs/workshop/description.${language}.txt`, import.meta.url)
);

test("Wallpaper Engine settings expose the supported city and display controls", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((index) => properties[`cityslot${index}`].value),
    ["los_angeles", "new_york", "london", "shanghai", "tokyo", "sydney"]
  );
  assert.equal(Object.hasOwn(properties, "cityslot7"), false);
  assert.equal(properties.customcities.value, "");
  assert.deepEqual(properties.labelsize.options.map((option) => option.value), ["small", "medium", "large"]);
  assert.deepEqual(properties.maplayout.options.map((option) => option.value), ["atlantic", "pacific"]);
  assert.deepEqual(properties.hourformat.options.map((option) => option.value), ["24", "12"]);
  assert.equal(properties.showseconds.type, "bool");
  assert.equal(properties.showterminator.type, "bool");
});

test("browser defaults and rendering performance contracts stay aligned", () => {
  const projectDefaults = [1, 2, 3, 4, 5, 6]
    .map((index) => properties[`cityslot${index}`].value);
  const sourceMatch = mainSource.match(/slots:\s*\[([^\]]+)\]/);

  assert.notEqual(sourceMatch, null);
  assert.deepEqual(
    Array.from(sourceMatch[1].matchAll(/"([^"]+)"/g), (match) => match[1]),
    projectDefaults
  );
  assert.equal(mainSource.includes("setInterval"), false);
  assert.match(mainSource, /const staticCanvas\s*=\s*document\.createElement\("canvas"\)/);
  assert.match(mainSource, /const terminatorCanvas\s*=\s*document\.createElement\("canvas"\)/);
  assert.match(mainSource, /core\.terminatorSolarFactors\(grid, sun\)/);
  assert.match(mainSource, /document\.documentElement\.clientWidth/);
});

test("browser loads the global label planner before the wallpaper runtime", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const layoutIndex = html.indexOf("src/label-layout.js");
  const runtimeIndex = html.indexOf("src/main.js");

  assert.equal(layoutIndex >= 0, true);
  assert.equal(layoutIndex < runtimeIndex, true);
  assert.match(html, /<svg[^>]+id="connectorLayer"/);
  assert.match(mainSource, /getBoundingClientRect\(\)/);
  assert.match(mainSource, /planLabelLayout\(/);
  assert.doesNotMatch(mainSource, /renderedLabels\s*<\s*80|chooseLabelPlacement\(/);
  assert.match(styles, /#connectorLayer/);
  assert.match(styles, /\.city-connector/);
});

test("city menus and localized labels come from the generated preset catalog", () => {
  const expectedValues = Object.keys(cityPresetData.presets);
  const firstOptions = properties.cityslot1.options;

  assert.deepEqual(firstOptions.map((option) => option.value), expectedValues);
  for (let index = 2; index <= 6; index += 1) {
    assert.deepEqual(properties[`cityslot${index}`].options, firstOptions);
  }
  for (const language of LANGUAGE_ORDER) {
    for (const locale of languageDefinitions[language].wallpaperLocales) {
      const localization = project.general.localization[locale];
      for (const [id, city] of Object.entries(cityPresetData.presets)) {
        if (id === "empty") {
          continue;
        }
        const label = localization[`ui_city_${id}`];
        assert.equal(label.startsWith(`${city.names[language]}(`), true, `${locale}:${id}`);
        assert.equal(label.includes("UTC"), false, label);
        assert.equal(/\(\s|\s\)/.test(label), false, label);
      }
    }
  }
});

test("runtime timezone catalog is complete and localized beyond preset cities", () => {
  const catalog = cityPresetData.timeZoneCatalog;

  assert.equal(Object.keys(catalog).length > Object.keys(cityPresetData.presets).length, true);
  for (const timeZone of Intl.supportedValuesOf("timeZone")) {
    const city = catalog[timeZone];
    assert.equal(Boolean(city), true, timeZone);
    assert.equal(Number.isFinite(city.lat) && Number.isFinite(city.lon), true, timeZone);
    for (const language of LANGUAGE_ORDER) {
      assert.equal(Boolean(city.names[language]), true, `${timeZone}:${language}`);
    }
  }
  assert.equal(catalog["Europe/Vienna"].names.de, "Wien");
  assert.deepEqual(
    [catalog["Etc/GMT+5"].lat, catalog["Etc/GMT+5"].lon],
    [0, 0]
  );
});

test("generated city preset module stores names once and expands runtime records", () => {
  const languageCount = Object.keys(cityPresetData.languages).length;

  assert.equal(Array.isArray(cityPresetData.nameSets), true);
  assert.equal(cityPresetData.nameSets.length < Object.keys(cityPresetData.timeZoneCatalog).length, true);
  assert.equal(cityPresetData.nameSets.every((names) => names.length === languageCount), true);
  assert.equal(Object.hasOwn(cityPresetData.presets.tokyo, "nameIndex"), false);
  assert.equal(Object.hasOwn(cityPresetData.timeZoneCatalog["Asia/Tokyo"], "nameIndex"), false);
  assert.equal(cityPresetData.presets.tokyo.names.ja, "東京");
  assert.equal(cityPresetData.timeZoneCatalog["US/Pacific"].names.en, "Los Angeles");
  assert.match(cityPresetSource, /"nameSets":\[/);
  assert.match(cityPresetSource, /"nameIndex":/);
  assert.equal(cityPresetSource.includes('"names":{"en"'), false);
});

test("development project retains published Workshop metadata", () => {
  assert.deepEqual(
    {
      workshopid: project.workshopid,
      workshopurl: project.workshopurl,
      visibility: project.visibility
    },
    {
      workshopid: "3747734053",
      workshopurl: "steam://url/CommunityFilePage/3747734053",
      visibility: "public"
    }
  );
  assert.equal(project.description.length > 100, true);
});
