import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import languageDefinitions, { LANGUAGE_ORDER } from "../data/languages.mjs";

const require = createRequire(import.meta.url);
const cityPresetData = require("../src/city-presets.js");
const project = JSON.parse(readFileSync(new URL("../project.json", import.meta.url), "utf8"));
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

test("language definitions generate complete runtime and Wallpaper Engine localization", () => {
  const expectedUiKeys = Object.keys(languageDefinitions.en.ui).sort();
  const wallpaperLocales = [];

  assert.deepEqual(Object.keys(languageDefinitions).sort(), [...LANGUAGE_ORDER].sort());
  assert.deepEqual(properties.language.options.map((option) => option.value), [...LANGUAGE_ORDER]);
  for (const language of LANGUAGE_ORDER) {
    const definition = languageDefinitions[language];
    assert.deepEqual(Object.keys(definition.ui).sort(), expectedUiKeys, language);
    assert.equal(cityPresetData.languages[language], definition.locale);
    for (const locale of definition.wallpaperLocales) {
      wallpaperLocales.push(locale);
      const localization = project.general.localization[locale];
      assert.equal(Boolean(localization), true, locale);
      assert.equal(
        localization[`ui_language_${language.replace("-", "_")}`],
        definition.optionLabel
      );
    }
  }
  assert.equal(new Set(wallpaperLocales).size, wallpaperLocales.length);
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

test("localized READMEs retain publication and IANA usage information", () => {
  const offlinePattern = /离线|離線|offline|オフライン|오프라인|sin conexión|автоном|Офлайн/i;

  for (const readmeUrl of readmeUrls) {
    const source = readFileSync(readmeUrl, "utf8");
    assert.equal(source.includes(workshopUrl), true, readmeUrl.pathname);
    assert.equal(source.includes(ianaUrl), true, readmeUrl.pathname);
    assert.equal(source.includes("2026b"), true, readmeUrl.pathname);
    assert.equal(offlinePattern.test(source), false, readmeUrl.pathname);
  }
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
