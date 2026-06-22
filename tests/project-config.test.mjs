import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import languageDefinitions, { LANGUAGE_ORDER } from "../data/languages.mjs";

const require = createRequire(import.meta.url);
const cityPresetData = require("../src/city-presets.js");
const project = JSON.parse(readFileSync(new URL("../project.json", import.meta.url), "utf8"));
const mainSource = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const workshopUrl = "https://steamcommunity.com/sharedfiles/filedetails/?id=3747734053";
const readmeUrls = [
  new URL("../README.md", import.meta.url),
  new URL("../docs/readme/README.zh-Hant.md", import.meta.url),
  new URL("../docs/readme/README.en.md", import.meta.url),
  new URL("../docs/readme/README.ja.md", import.meta.url),
  new URL("../docs/readme/README.ko.md", import.meta.url),
  new URL("../docs/readme/README.es.md", import.meta.url),
  new URL("../docs/readme/README.ru.md", import.meta.url),
  new URL("../docs/readme/README.pt.md", import.meta.url),
  new URL("../docs/readme/README.de.md", import.meta.url)
];

test("project settings do not expose label density", () => {
  const properties = project.general.properties;

  assert.equal(Object.hasOwn(properties, "labeldensity"), false);
  for (const entries of Object.values(project.general.localization)) {
    assert.equal(Object.hasOwn(entries, "ui_label_density"), false);
    assert.equal(Object.hasOwn(entries, "ui_density_minimal"), false);
    assert.equal(Object.hasOwn(entries, "ui_density_balanced"), false);
    assert.equal(Object.hasOwn(entries, "ui_density_full"), false);
  }
});

test("project settings expose current city and exactly six extra city slots", () => {
  const properties = project.general.properties;

  assert.equal(Object.hasOwn(properties, "language"), true);
  assert.equal(Object.hasOwn(properties, "labelsize"), true);
  assert.equal(Object.hasOwn(properties, "currentcityname"), true);
  assert.equal(Object.hasOwn(properties, "currentcitycoords"), true);
  assert.equal(Object.hasOwn(properties, "currentcitytimezone"), true);
  for (let index = 1; index <= 6; index += 1) {
    assert.equal(Object.hasOwn(properties, `cityslot${index}`), true);
  }
  assert.equal(Object.hasOwn(properties, "cityslot7"), false);
  assert.equal(Object.hasOwn(properties, "cityslot8"), false);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((index) => properties[`cityslot${index}`].value),
    ["los_angeles", "new_york", "london", "shanghai", "tokyo", "sydney"]
  );
  for (let index = 1; index <= 6; index += 1) {
    const values = properties[`cityslot${index}`].options.map((option) => option.value);
    assert.equal(values.includes("auto"), false);
  }
});

test("browser defaults and Wallpaper Engine property defaults use the same city identifiers", () => {
  const projectDefaults = [1, 2, 3, 4, 5, 6].map((index) => (
    project.general.properties[`cityslot${index}`].value
  ));
  const sourceMatch = mainSource.match(/slots:\s*\[([^\]]+)\]/);

  assert.notEqual(sourceMatch, null);
  const browserDefaults = Array.from(sourceMatch[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
  assert.deepEqual(browserDefaults, projectDefaults);
});

test("project settings expose small medium large label sizes below custom cities defaulting to medium", () => {
  const properties = project.general.properties;
  const property = project.general.properties.labelsize;
  const en = project.general.localization["en-us"];
  const zh = project.general.localization["zh-chs"];
  const ja = project.general.localization["ja-jp"];

  assert.equal(property.type, "combo");
  assert.equal(property.value, "medium");
  assert.equal(property.order > properties.customcities.order, true);
  assert.equal(property.order < properties.maplayout.order, true);
  assert.deepEqual(property.options.map((option) => option.value), ["small", "medium", "large"]);
  assert.equal(en.ui_label_size, "Label size");
  assert.equal(en.ui_label_size_small, "Small");
  assert.equal(en.ui_label_size_medium, "Medium");
  assert.equal(en.ui_label_size_large, "Large");
  assert.equal(zh.ui_label_size, "标签尺寸");
  assert.equal(zh.ui_label_size_small, "小");
  assert.equal(zh.ui_label_size_medium, "中");
  assert.equal(zh.ui_label_size_large, "大");
  assert.equal(ja.ui_label_size, "ラベルサイズ");
  assert.equal(ja.ui_label_size_small, "小");
  assert.equal(ja.ui_label_size_medium, "中");
  assert.equal(ja.ui_label_size_large, "大");
});

test("project language setting exposes all supported runtime languages", () => {
  const property = project.general.properties.language;

  assert.equal(property.value, "en");
  assert.deepEqual(
    property.options.map((option) => option.value),
    ["en", "zh", "zh-hant", "ja", "ko", "es", "ru", "pt", "de"]
  );
  for (const entries of Object.values(project.general.localization)) {
    assert.equal(Object.hasOwn(entries, "ui_language_auto"), false);
    for (const language of ["zh", "zh_hant", "en", "ja", "ko", "es", "ru", "pt", "de"]) {
      assert.equal(Object.hasOwn(entries, `ui_language_${language}`), true);
    }
  }
});

test("each language is generated from one complete metadata definition", () => {
  const expectedUiKeys = Object.keys(languageDefinitions.en.ui).sort();
  const wallpaperLocales = [];

  assert.deepEqual(Object.keys(languageDefinitions).sort(), [...LANGUAGE_ORDER].sort());
  for (const language of LANGUAGE_ORDER) {
    const definition = languageDefinitions[language];
    assert.equal(Boolean(definition.optionLabel), true, `${language}:optionLabel`);
    assert.equal(Boolean(definition.locale), true, `${language}:locale`);
    assert.equal(Boolean(definition.cldrLocale), true, `${language}:cldrLocale`);
    assert.equal(Boolean(definition.empty), true, `${language}:empty`);
    assert.deepEqual(Object.keys(definition.ui).sort(), expectedUiKeys, `${language}:ui`);
    wallpaperLocales.push(...definition.wallpaperLocales);
    for (const locale of definition.wallpaperLocales) {
      assert.equal(
        project.general.localization[locale][`ui_language_${language.replace("-", "_")}`],
        definition.optionLabel,
        `${locale}:${language}`
      );
    }
  }
  assert.equal(new Set(wallpaperLocales).size, wallpaperLocales.length);
});

test("runtime does not inspect browser language preferences", () => {
  assert.equal(mainSource.includes("navigator.language"), false);
  assert.match(mainSource, /language:\s*"en"/);
});

test("project localization includes every Wallpaper Engine locale requested", () => {
  const locales = Object.keys(project.general.localization);

  for (const locale of ["en-us", "zh-chs", "zh-cht", "ja-jp", "ko-kr", "es-es", "ru-ru", "pt-br", "pt-pt", "de-de"]) {
    assert.equal(locales.includes(locale), true, locale);
  }
});

test("custom city input defaults to an empty bracket-free value", () => {
  assert.equal(project.general.properties.customcities.value, "");
});

test("project settings put language and current timezone first with simplified names", () => {
  const properties = project.general.properties;
  const en = project.general.localization["en-us"];
  const zh = project.general.localization["zh-chs"];
  const ja = project.general.localization["ja-jp"];

  assert.equal(properties.language.order < properties.currentcitytimezone.order, true);
  assert.equal(properties.currentcitytimezone.order < properties.currentcityname.order, true);
  assert.equal(properties.currentcityname.order < properties.currentcitycoords.order, true);
  assert.equal(properties.currentcitytimezone.text, "ui_current_city_timezone");
  assert.equal(properties.currentcityname.text, "ui_current_city_name");
  assert.equal(properties.currentcitycoords.text, "ui_current_city_coords");
  assert.equal(en.ui_current_city_timezone, "My time zone");
  assert.equal(en.ui_current_city_name, "My city");
  assert.equal(en.ui_current_city_coords, "My coordinates");
  assert.equal(en.ui_city_slot_1, "Extra city 1");
  assert.equal(en.ui_custom_cities, "More cities (JSON)");
  assert.equal(zh.ui_current_city_timezone, "我的时区");
  assert.equal(zh.ui_current_city_name, "我的城市");
  assert.equal(zh.ui_current_city_coords, "我的坐标");
  assert.equal(zh.ui_city_slot_1, "额外城市 1");
  assert.equal(zh.ui_custom_cities, "更多城市 (JSON)");
  assert.equal(ja.ui_current_city_timezone, "現在地のタイムゾーン");
  assert.equal(ja.ui_current_city_name, "現在地の都市名");
  assert.equal(ja.ui_current_city_coords, "現在地の座標");
  assert.equal(ja.ui_city_slot_1, "追加都市 1");
  assert.equal(ja.ui_custom_cities, "追加都市 (JSON)");
});

test("every language distinguishes current extra and JSON cities with concise labels", () => {
  const expected = {
    "en-us": ["My time zone", "My city", "My coordinates", "Extra city 1", "More cities (JSON)"],
    "zh-chs": ["我的时区", "我的城市", "我的坐标", "额外城市 1", "更多城市 (JSON)"],
    "zh-cht": ["我的時區", "我的城市", "我的座標", "額外城市 1", "更多城市 (JSON)"],
    "ja-jp": ["現在地のタイムゾーン", "現在地の都市名", "現在地の座標", "追加都市 1", "追加都市 (JSON)"],
    "ko-kr": ["내 시간대", "내 도시", "내 좌표", "추가 도시 1", "더 많은 도시 (JSON)"],
    "es-es": ["Mi zona horaria", "Mi ciudad", "Mis coordenadas", "Ciudad adicional 1", "Más ciudades (JSON)"],
    "ru-ru": ["Мой часовой пояс", "Мой город", "Мои координаты", "Доп. город 1", "Другие города (JSON)"],
    "pt-br": ["Meu fuso horário", "Minha cidade", "Minhas coordenadas", "Cidade adicional 1", "Mais cidades (JSON)"],
    "pt-pt": ["Meu fuso horário", "Minha cidade", "Minhas coordenadas", "Cidade adicional 1", "Mais cidades (JSON)"],
    "de-de": ["Eigene Zeitzone", "Eigene Stadt", "Eigene Koordinaten", "Zusatzstadt 1", "Weitere Städte (JSON)"]
  };

  for (const [locale, labels] of Object.entries(expected)) {
    const entries = project.general.localization[locale];
    assert.deepEqual([
      entries.ui_current_city_timezone,
      entries.ui_current_city_name,
      entries.ui_current_city_coords,
      entries.ui_city_slot_1,
      entries.ui_custom_cities
    ], labels, locale);
  }
});

test("viewport sizing uses layout dimensions without vw or undersized canvas pixels", () => {
  assert.match(mainSource, /document\.documentElement\.clientWidth/);
  assert.match(mainSource, /canvasBackingSize/);
  assert.equal(mainSource.includes("window.innerWidth"), false);
  assert.equal(stylesSource.includes("100vw"), false);
  assert.equal(stylesSource.includes("100vh"), false);
});

test("runtime separates static map and terminator rendering into offscreen caches", () => {
  assert.match(mainSource, /const staticCanvas\s*=\s*document\.createElement\("canvas"\)/);
  assert.match(mainSource, /const terminatorCanvas\s*=\s*document\.createElement\("canvas"\)/);
  assert.match(mainSource, /staticLayerDirty/);
  assert.match(mainSource, /terminatorLayerDirty/);
  assert.match(mainSource, /ctx\.drawImage\(\s*staticCanvas/);
  assert.match(mainSource, /ctx\.drawImage\(\s*terminatorCanvas/);
});

test("runtime aligns clock updates without a perpetual interval", () => {
  assert.equal(mainSource.includes("setInterval"), false);
  assert.match(mainSource, /setTimeout\(/);
  assert.match(mainSource, /core\.nextClockDelay\(/);
  assert.match(mainSource, /core\.nextTerminatorDelay\(/);
  assert.match(mainSource, /terminatorTimer/);
  assert.equal(mainSource.includes("lastTerminatorMinute"), false);
  assert.match(mainSource, /visibilitychange/);
});

test("runtime reuses city nodes and one solar position per terminator redraw", () => {
  assert.equal(mainSource.includes("labelLayer.innerHTML"), false);
  assert.equal(mainSource.includes("core.isDaylightAt"), false);
  assert.match(mainSource, /function updateCityLayer\(/);
  assert.match(mainSource, /core\.solarPosition\(/);
  assert.match(mainSource, /core\.solarCosineFromPosition\(/);
  assert.equal((mainSource.match(/core\.solarPosition\(/g) || []).length, 1);
  assert.match(mainSource, /core\.terminatorGridCoordinates\(/);
});

test("terminator grid cache key includes the complete map rectangle", () => {
  const keyMatch = mainSource.match(/function getTerminatorGrid[\s\S]*?const key = \[([\s\S]*?)\]\.join/);

  assert.notEqual(keyMatch, null);
  for (const field of ["x", "y", "width", "height"]) {
    assert.match(keyMatch[1], new RegExp(`runtime\\.mapRect\\.${field}`));
  }
});

test("land outlines use the requested 1.5 pixel stroke", () => {
  assert.match(mainSource, /ctx\.lineWidth\s*=\s*1\.5\s*;/);
});

test("short viewports keep city labels rendered", () => {
  assert.equal(
    /@media\s*\(max-height:[^)]+\)[\s\S]*?\.city-label\s*\{[\s\S]*?display\s*:\s*none/.test(stylesSource),
    false
  );
});

test("project settings do not expose accent color controls", () => {
  const properties = project.general.properties;

  assert.equal(Object.hasOwn(properties, "accentcolor"), false);
  for (const entries of Object.values(project.general.localization)) {
    assert.equal(Object.hasOwn(entries, "ui_accent_color"), false);
  }
});

test("project city menus are generated from the curated IANA-backed records", () => {
  const properties = project.general.properties;
  const expectedValues = Object.keys(cityPresetData.presets);
  const firstOptions = properties.cityslot1.options;

  assert.deepEqual(firstOptions.map((option) => option.value), expectedValues);
  for (let index = 2; index <= 6; index += 1) {
    assert.deepEqual(properties[`cityslot${index}`].options, firstOptions);
  }
  assert.equal(firstOptions.some((option) => option.value === "regina"), true);
  assert.equal(firstOptions.some((option) => option.value === "la_paz"), true);
  assert.equal(firstOptions.some((option) => option.value === "havana"), true);
  assert.equal(firstOptions.some((option) => option.value === "kabul"), true);
  assert.equal(firstOptions.some((option) => option.value === "beirut"), true);
  assert.equal(firstOptions.some((option) => option.value === "chisinau"), true);
  assert.equal(firstOptions.some((option) => option.value === "shanghai"), true);
  assert.equal(firstOptions.some((option) => option.value === "kolkata"), true);
  assert.equal(firstOptions.some((option) => option.value === "beijing"), false);
  assert.equal(firstOptions.some((option) => option.value === "delhi"), false);
});

test("project city localization labels use compact parenthesized offsets", () => {
  const en = project.general.localization["en-us"];
  const zh = project.general.localization["zh-chs"];
  const ja = project.general.localization["ja-jp"];

  assert.equal(en.ui_city_new_york, "New York(-5/-4)");
  assert.equal(en.ui_city_tokyo, "Tokyo(+9)");
  assert.equal(zh.ui_city_london, "伦敦(+0/+1)");
  assert.equal(ja.ui_city_sydney, "シドニー(+10/+11)");
  assert.equal(en.ui_city_regina, "Regina(-6)");
  assert.equal(en.ui_city_la_paz, "La Paz(-4)");
  assert.equal(project.general.localization["es-es"].ui_city_shanghai, "Shanghái(+8)");
  assert.equal(project.general.localization["ko-kr"].ui_city_kolkata, "콜카타(+5:30)");
});

test("settings and runtime use the same localized name for every curated city", () => {
  for (const language of LANGUAGE_ORDER) {
    for (const locale of languageDefinitions[language].wallpaperLocales) {
      const localization = project.general.localization[locale];
      for (const [id, city] of Object.entries(cityPresetData.presets)) {
        if (id === "empty") {
          continue;
        }
        const label = localization[`ui_city_${id}`];
        assert.equal(label.startsWith(`${city.names[language]}(`), true, `${locale}:${id}:${label}`);
      }
    }
  }
});

test("runtime timezone catalog localizes and locates cities outside the curated list", () => {
  assert.equal(Object.hasOwn(cityPresetData, "timeZoneCities"), false);
  assert.equal(Object.hasOwn(cityPresetData, "timeZoneCatalog"), true);
  assert.equal(Object.keys(cityPresetData.timeZoneCatalog).length > Object.keys(cityPresetData.presets).length, true);
  for (const city of Object.values(cityPresetData.timeZoneCatalog)) {
    assert.equal(Number.isFinite(city.lat), true, city.timeZone);
    assert.equal(Number.isFinite(city.lon), true, city.timeZone);
    for (const language of LANGUAGE_ORDER) {
      assert.equal(Boolean(city.names[language]), true, `${city.timeZone}:${language}`);
    }
  }
  assert.equal(cityPresetData.timeZoneCatalog["Europe/Vienna"].names.de, "Wien");
  assert.equal(cityPresetData.timeZoneCatalog["Europe/Vienna"].names.ja, "ウィーン");
  assert.equal(cityPresetData.timeZoneCatalog["Etc/GMT+5"].lat, 0);
  assert.equal(cityPresetData.timeZoneCatalog["Etc/GMT+5"].lon, 0);
  for (const timeZone of Intl.supportedValuesOf("timeZone")) {
    assert.equal(Boolean(cityPresetData.timeZoneCatalog[timeZone]), true, timeZone);
  }
});

test("every generated city label has no UTC token or offset whitespace", () => {
  const slot = project.general.properties.cityslot1;
  const localizations = Object.values(project.general.localization);

  for (const option of slot.options.filter((entry) => entry.value !== "empty")) {
    for (const localization of localizations) {
      const label = localization[option.label];
      assert.equal(label.includes("UTC"), false, label);
      assert.match(label, /\([+-]\d/);
      assert.equal(/\(\s|\s\)/.test(label), false, label);
    }
  }
});

test("every localized README links to the published Steam Workshop item", () => {
  for (const readmeUrl of readmeUrls) {
    const source = readFileSync(readmeUrl, "utf8");
    assert.equal(source.includes(workshopUrl), true, readmeUrl.pathname);
    assert.equal(source.includes("https://steamcommunity.com/workshop/"), false, readmeUrl.pathname);
  }
});

test("development project stores the published Workshop metadata", () => {
  assert.equal(project.workshopid, "3747734053");
  assert.equal(project.workshopurl, "steam://url/CommunityFilePage/3747734053");
  assert.equal(project.visibility, "public");
  assert.equal(typeof project.description, "string");
  assert.equal(project.description.length > 100, true);
});
