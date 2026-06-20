import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import curatedCityIds from "../data/curated-cities.mjs";
import languages, { LANGUAGE_ORDER } from "../data/languages.mjs";

import {
  buildCityRecords,
  buildLocalizedCityRecords,
  buildTimeZoneCityRecords,
  buildZoneCoordinateRecords,
  findDuplicateCountryRules,
  sortCityRecords,
  validateCuratedCityList
} from "./timezone-generator-lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readText = (path) => readFileSync(join(root, path), "utf8");
const version = readText("data/iana/version.txt").trim();
const sourceYear = Number(version.slice(0, 4));
const zone1970Text = readText("data/iana/zone1970.tab");
const zoneText = readText("data/iana/zone.tab");
const backwardText = readText("data/iana/backward");
const cldrLocales = Object.fromEntries(LANGUAGE_ORDER.map((language) => [language, languages[language].cldrLocale]));
const cldrByLanguage = Object.fromEntries(LANGUAGE_ORDER.map((language) => [
  language,
  JSON.parse(readText(`data/cldr/${languages[language].cldrLocale}/timeZoneNames.json`))
]));
const curatedCityIssues = validateCuratedCityList(curatedCityIds);
if (curatedCityIssues.length) {
  throw new Error(`Invalid curated city list: ${curatedCityIssues.join(", ")}`);
}
const zones = buildZoneCoordinateRecords(zone1970Text, zoneText, backwardText);
const timeZoneCities = buildTimeZoneCityRecords({
  zones,
  cldrByLanguage,
  cldrLocales
});

const cities = sortCityRecords(buildLocalizedCityRecords({
  records: buildCityRecords({
    cityIds: curatedCityIds,
    zone1970Text,
    zoneText,
    year: sourceYear
  }),
  timeZoneCities,
  languages: LANGUAGE_ORDER
}));

const duplicates = findDuplicateCountryRules(cities, { startYear: sourceYear, years: 5 });
if (duplicates.length) {
  throw new Error(`Duplicate country rules: ${JSON.stringify(duplicates)}`);
}

writeGeneratedModule(
  "src/city-presets.js",
  "WorldClockCityPresetData",
  createPresetData(version, cities, timeZoneCities),
  "都市プリセット"
);

generateProjectJson(cities);

function createPresetData(dataVersion, records, allTimeZoneCities) {
  const emptyNames = Object.fromEntries(LANGUAGE_ORDER.map((language) => [language, languages[language].empty]));
  const presets = {
    empty: {
      id: "empty",
      lat: 0,
      lon: 0,
      timeZone: "UTC",
      names: emptyNames
    }
  };

  for (const city of records) {
    presets[city.id] = {
      id: city.id,
      lat: city.lat,
      lon: city.lon,
      timeZone: city.timeZone,
      names: city.names
    };
  }

  return {
    version: dataVersion,
    languages: Object.fromEntries(LANGUAGE_ORDER.map((language) => [language, languages[language].locale])),
    presets,
    timeZoneCatalog: Object.fromEntries(allTimeZoneCities.map((city) => [city.timeZone, city]))
  };
}

function writeGeneratedModule(relativePath, globalName, data, subject) {
  const serialized = JSON.stringify(data);
  const content = [
    `// このファイルはIANA tzdb ${version}から生成された${subject}データです。`,
    "(function attachGeneratedData(root) {",
    `  const data = ${serialized};`,
    "  if (typeof module !== \"undefined\" && module.exports) {",
    "    module.exports = data;",
    "  }",
    `  root.${globalName} = data;`,
    "}(typeof globalThis !== \"undefined\" ? globalThis : this));",
    ""
  ].join("\n");
  writeFileSync(join(root, relativePath), content, "utf8");
}

function generateProjectJson(records) {
  const path = join(root, "project.json");
  const project = JSON.parse(readFileSync(path, "utf8"));
  const options = [
    { label: "ui_city_empty", value: "empty" },
    ...records.map((city) => ({
      label: `ui_city_${city.id}`,
      value: city.id
    }))
  ];

  for (let index = 1; index <= 6; index += 1) {
    project.general.properties[`cityslot${index}`].options = options;
  }

  project.general.properties.language.value = "en";
  project.general.properties.language.options = LANGUAGE_ORDER.map((language) => ({
    label: `ui_language_${language.replace("-", "_")}`,
    value: language
  }));
  project.general.properties.customcities.value = "";

  const localization = {};
  for (const language of LANGUAGE_ORDER) {
    for (const wallpaperLocale of languages[language].wallpaperLocales) {
      localization[wallpaperLocale] = buildLocalization(language, records);
    }
  }
  project.general.localization = localization;

  writeFileSync(path, `${JSON.stringify(project, null, "\t")}\n`, "utf8");
}

function buildLocalization(language, records) {
  const definition = languages[language];
  const ui = definition.ui;
  const localization = {
    ui_city_slot_1: `${ui.extraCity} 1`,
    ui_city_slot_2: `${ui.extraCity} 2`,
    ui_city_slot_3: `${ui.extraCity} 3`,
    ui_city_slot_4: `${ui.extraCity} 4`,
    ui_city_slot_5: `${ui.extraCity} 5`,
    ui_city_slot_6: `${ui.extraCity} 6`,
    ui_custom_cities: ui.moreCities,
    ui_map_layout: ui.mapLayout,
    ui_language: ui.language,
    ui_hour_format: ui.hourFormat,
    ui_show_seconds: ui.showSeconds,
    ui_show_terminator: ui.showTerminator,
    ui_layout_atlantic: ui.atlantic,
    ui_layout_pacific: ui.pacific,
    ui_hour_24: ui.hour24,
    ui_hour_12: ui.hour12,
    ui_current_city_name: ui.currentCity,
    ui_current_city_coords: ui.coordinates,
    ui_current_city_timezone: ui.timeZone,
    ui_label_size: ui.labelSize,
    ui_label_size_small: ui.small,
    ui_label_size_medium: ui.medium,
    ui_label_size_large: ui.large,
    ui_city_empty: definition.empty
  };

  for (const optionLanguage of LANGUAGE_ORDER) {
    localization[`ui_language_${optionLanguage.replace("-", "_")}`] = languages[optionLanguage].optionLabel;
  }
  for (const city of records) {
    localization[`ui_city_${city.id}`] = `${city.names[language]}(${city.offsetLabel})`;
  }
  return localization;
}
