import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import curatedCityIds from "../data/curated-cities.mjs";
import {
  buildCityRecords,
  buildLocalizedCityRecords,
  buildTimeZoneCityRecords,
  buildZoneCoordinateRecords,
  findDuplicateCountryRules,
  formatOffsetMinutes,
  locationNameFromZone,
  offsetProfile,
  parseCldrExemplarCities,
  parseZoneTab,
  sortCityRecords,
  validateCuratedCityList
} from "../scripts/timezone-generator-lib.mjs";

const zone1970Text = readFileSync(new URL("../data/iana/zone1970.tab", import.meta.url), "utf8");
const zoneText = readFileSync(new URL("../data/iana/zone.tab", import.meta.url), "utf8");
const backwardText = readFileSync(new URL("../data/iana/backward", import.meta.url), "utf8");
const cldrLocales = {
  en: "en",
  zh: "zh",
  "zh-hant": "zh-Hant",
  ja: "ja",
  ko: "ko",
  es: "es",
  ru: "ru",
  pt: "pt",
  de: "de"
};
const cldrByLanguage = Object.fromEntries(
  Object.entries(cldrLocales).map(([language, locale]) => [
    language,
    JSON.parse(readFileSync(new URL(`../data/cldr/${locale}/timeZoneNames.json`, import.meta.url), "utf8"))
  ])
);
const zones = buildZoneCoordinateRecords(zone1970Text, zoneText, backwardText);
const timeZoneCities = buildTimeZoneCityRecords({ zones, cldrByLanguage, cldrLocales });
const curatedRecords = buildCityRecords({
  cityIds: curatedCityIds,
  zone1970Text,
  zoneText,
  year: 2026
});
const localizedRecords = buildLocalizedCityRecords({
  records: curatedRecords,
  timeZoneCities,
  languages: Object.keys(cldrLocales)
});
const sortedRecords = sortCityRecords(localizedRecords);

test("IANA and CLDR parsers normalize source data and display helpers", () => {
  assert.deepEqual(
    parseZoneTab("CA\t+5024-10439\tAmerica/Regina\tCST - SK\nJP,AU\t+353916+1394441\tAsia/Tokyo"),
    [
      {
        countries: ["CA"],
        coordinates: "+5024-10439",
        timeZone: "America/Regina",
        comments: "CST - SK"
      },
      {
        countries: ["JP", "AU"],
        coordinates: "+353916+1394441",
        timeZone: "Asia/Tokyo",
        comments: ""
      }
    ]
  );
  assert.equal(locationNameFromZone("America/Argentina/Buenos_Aires"), "Buenos Aires");
  assert.deepEqual(
    [formatOffsetMinutes(0), formatOffsetMinutes(-240), formatOffsetMinutes(330), formatOffsetMinutes(765)],
    ["+0", "-4", "+5:30", "+12:45"]
  );
  const exemplarCities = parseCldrExemplarCities(cldrByLanguage["zh-hant"], "zh-Hant");
  assert.equal(exemplarCities.get("Asia/Tokyo"), "東京");
  assert.equal(exemplarCities.get("Europe/Chisinau"), "基西紐");
});

test("curated cities are valid, distinct by rule, and retain representative offsets", () => {
  const byId = Object.fromEntries(curatedRecords.map((record) => [record.id, record]));

  assert.deepEqual(validateCuratedCityList(curatedCityIds), []);
  assert.deepEqual(
    {
      regina: [byId.regina.country, byId.regina.timeZone, byId.regina.offsetLabel],
      eucla: byId.eucla.offsetLabel,
      chatham: byId.chatham.offsetLabel,
      havana: [byId.havana.country, byId.havana.offsetLabel],
      kabul: [byId.kabul.country, byId.kabul.offsetLabel]
    },
    {
      regina: ["CA", "America/Regina", "-6"],
      eucla: "+8:45",
      chatham: "+12:45/+13:45",
      havana: ["CU", "-5/-4"],
      kabul: ["AF", "+4:30"]
    }
  );
  for (const record of curatedRecords) {
    const expectedId = locationNameFromZone(record.timeZone)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    assert.equal(record.id, expectedId, record.timeZone);
  }
  assert.deepEqual(findDuplicateCountryRules(curatedRecords, { startYear: 2026, years: 5 }), []);
  assert.deepEqual(offsetProfile("America/New_York", 2026).offsets, [-300, -240]);
});

test("combined timezone catalog resolves aliases and fixed-offset zones", () => {
  const byZone = new Map(zones.map((record) => [record.timeZone, record]));

  assert.equal(zones.length > 400, true);
  assert.equal(byZone.get("Asia/Calcutta").canonicalTimeZone, "Asia/Kolkata");
  assert.equal(byZone.get("Europe/Kiev").canonicalTimeZone, "Europe/Kyiv");
  assert.deepEqual(
    [byZone.get("Etc/GMT+12").lat, byZone.get("Etc/GMT+12").lon],
    [0, 0]
  );
  for (const record of zones) {
    assert.equal(Number.isFinite(record.lat) && Number.isFinite(record.lon), true, record.timeZone);
  }
});

test("localized timezone catalog is complete and preserves renamed alias locations", () => {
  const byZone = new Map(timeZoneCities.map((record) => [record.timeZone, record]));
  const languages = Object.keys(cldrLocales);

  assert.equal(timeZoneCities.length, zones.length);
  for (const record of timeZoneCities) {
    for (const language of languages) {
      assert.equal(Boolean(record.names[language]), true, `${record.timeZone}:${language}`);
      assert.equal(/\p{Cf}/u.test(record.names[language]), false, `${record.timeZone}:${language}`);
    }
  }
  assert.deepEqual(
    {
      tokyo: [byZone.get("Asia/Tokyo").names.ja, byZone.get("Asia/Tokyo").names.ko],
      shanghai: [byZone.get("Asia/Shanghai").names.en, byZone.get("Asia/Shanghai").names.zh],
      vienna: byZone.get("Europe/Vienna").names.de,
      faroe: byZone.get("Atlantic/Faroe").names.en
    },
    {
      tokyo: ["東京", "도쿄"],
      shanghai: ["Shanghai", "上海"],
      vienna: "Wien",
      faroe: "Faroes"
    }
  );
  for (const [legacy, modern] of [
    ["Africa/Asmera", "Africa/Asmara"],
    ["America/Coral_Harbour", "America/Atikokan"],
    ["Pacific/Truk", "Pacific/Chuuk"],
    ["Pacific/Ponape", "Pacific/Pohnpei"]
  ]) {
    assert.deepEqual(
      [byZone.get(legacy).lat, byZone.get(legacy).lon],
      [byZone.get(modern).lat, byZone.get(modern).lon],
      legacy
    );
  }
});

test("localized curated cities sort by offsets, English name, and timezone", () => {
  const localizedById = Object.fromEntries(localizedRecords.map((record) => [record.id, record]));
  assert.deepEqual(
    [localizedById.tokyo.names.ja, localizedById.shanghai.names.zh, localizedById.kolkata.names.ko],
    ["東京", "上海", "콜카타"]
  );

  for (let index = 1; index < sortedRecords.length; index += 1) {
    const previous = sortedRecords[index - 1];
    const current = sortedRecords[index];
    const comparison =
      previous.firstOffset - current.firstOffset ||
      previous.secondOffset - current.secondOffset ||
      previous.names.en.localeCompare(current.names.en, "en") ||
      previous.timeZone.localeCompare(current.timeZone, "en");
    assert.equal(comparison <= 0, true, `${previous.id} before ${current.id}`);
  }
});
