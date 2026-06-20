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
const cldrByLanguage = Object.fromEntries(Object.entries(cldrLocales).map(([language, locale]) => [
  language,
  JSON.parse(readFileSync(new URL(`../data/cldr/${locale}/timeZoneNames.json`, import.meta.url), "utf8"))
]));
const buildCuratedRecords = () => buildCityRecords({
  cityIds: curatedCityIds,
  zone1970Text,
  zoneText,
  year: 2026
});

test("parseZoneTab reads countries coordinates timezone and comments", () => {
  const rows = parseZoneTab([
    "# comment",
    "CA\t+5024-10439\tAmerica/Regina\tCST - SK (most areas)",
    "JP,AU\t+353916+1394441\tAsia/Tokyo"
  ].join("\n"));

  assert.deepEqual(rows, [
    {
      countries: ["CA"],
      coordinates: "+5024-10439",
      timeZone: "America/Regina",
      comments: "CST - SK (most areas)"
    },
    {
      countries: ["JP", "AU"],
      coordinates: "+353916+1394441",
      timeZone: "Asia/Tokyo",
      comments: ""
    }
  ]);
});

test("locationNameFromZone generates readable English names", () => {
  assert.equal(locationNameFromZone("America/Argentina/Buenos_Aires"), "Buenos Aires");
  assert.equal(locationNameFromZone("America/St_Johns"), "St Johns");
  assert.equal(locationNameFromZone("Asia/Tokyo"), "Tokyo");
});

test("offset formatting omits UTC and spaces while preserving minute offsets", () => {
  assert.equal(formatOffsetMinutes(0), "+0");
  assert.equal(formatOffsetMinutes(-240), "-4");
  assert.equal(formatOffsetMinutes(330), "+5:30");
  assert.equal(formatOffsetMinutes(765), "+12:45");
});

test("offsetProfile places standard offset before daylight offset", () => {
  assert.deepEqual(offsetProfile("America/New_York", 2026), {
    offsets: [-300, -240],
    firstOffset: -300,
    secondOffset: -240,
    label: "-5/-4"
  });
  assert.equal(offsetProfile("America/Regina", 2026).label, "-6");
  assert.equal(offsetProfile("Australia/Lord_Howe", 2026).label, "+10:30/+11");
});

test("curated records cover useful country-specific and uncommon rules", () => {
  const records = buildCuratedRecords();
  const byId = Object.fromEntries(records.map((record) => [record.id, record]));

  assert.equal(byId.regina.country, "CA");
  assert.equal(byId.regina.timeZone, "America/Regina");
  assert.equal(byId.regina.offsetLabel, "-6");
  assert.equal(
    records.some((record) => ["BO", "VE", "BR"].includes(record.country) && record.offsetLabel === "-4"),
    true
  );
  assert.equal(byId.eucla.offsetLabel, "+8:45");
  assert.equal(byId.chatham.offsetLabel, "+12:45/+13:45");
  assert.equal(byId.lord_howe.offsetLabel, "+10:30/+11");
});

test("curated records include requested cities with distinct timezone rules", () => {
  const records = buildCuratedRecords();
  const byId = Object.fromEntries(records.map((record) => [record.id, record]));

  assert.deepEqual(
    {
      havana: [byId.havana.country, byId.havana.timeZone, byId.havana.offsetLabel],
      kabul: [byId.kabul.country, byId.kabul.timeZone, byId.kabul.offsetLabel],
      beirut: [byId.beirut.country, byId.beirut.timeZone, byId.beirut.offsetLabel],
      chisinau: [byId.chisinau.country, byId.chisinau.timeZone, byId.chisinau.offsetLabel]
    },
    {
      havana: ["CU", "America/Havana", "-5/-4"],
      kabul: ["AF", "Asia/Kabul", "+4:30"],
      beirut: ["LB", "Asia/Beirut", "+2/+3"],
      chisinau: ["MD", "Europe/Chisinau", "+2/+3"]
    }
  );
});

test("curated records do not duplicate a time rule inside one country", () => {
  const records = buildCuratedRecords();
  const duplicates = findDuplicateCountryRules(records, { startYear: 2026, years: 5 });

  assert.deepEqual(duplicates, []);
});

test("curated city source is an ordered list of city identifiers only", () => {
  const issues = validateCuratedCityList(curatedCityIds);

  assert.deepEqual(issues, []);
  assert.equal(Array.isArray(curatedCityIds), true);
  assert.equal(curatedCityIds.includes("shanghai"), true);
  assert.equal(curatedCityIds.includes("kolkata"), true);
  assert.equal(curatedCityIds.includes("beijing"), false);
  assert.equal(curatedCityIds.includes("delhi"), false);
  for (const cityId of curatedCityIds) {
    assert.equal(typeof cityId, "string");
    assert.match(cityId, /^[a-z0-9]+(?:_[a-z0-9]+)*$/);
  }
});

test("localized city records use the same CLDR path as the complete timezone catalog", () => {
  const records = buildCuratedRecords();
  const zones = buildZoneCoordinateRecords(zone1970Text, zoneText, backwardText);
  const timeZoneCities = buildTimeZoneCityRecords({ zones, cldrByLanguage, cldrLocales });
  const localized = buildLocalizedCityRecords({
    records,
    timeZoneCities,
    languages: Object.keys(cldrLocales)
  });
  const byId = Object.fromEntries(localized.map((city) => [city.id, city]));

  assert.equal(byId.tokyo.names.en, "Tokyo");
  assert.equal(byId.tokyo.names.ja, "東京");
  assert.equal(byId.shanghai.names.en, "Shanghai");
  assert.equal(byId.shanghai.names.zh, "上海");
  assert.equal(byId.kolkata.names.en, "Kolkata");
  assert.equal(byId.kolkata.names.ko, "콜카타");
});

test("every curated city identifier directly matches its IANA location segment", () => {
  const records = buildCuratedRecords();

  for (const record of records) {
    const locationId = locationNameFromZone(record.timeZone)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    assert.equal(record.id, locationId, `${record.id}:${record.timeZone}`);
  }
});

test("sortCityRecords orders every city by first offset then second offset and English name", () => {
  const zones = buildZoneCoordinateRecords(zone1970Text, zoneText, backwardText);
  const timeZoneCities = buildTimeZoneCityRecords({ zones, cldrByLanguage, cldrLocales });
  const records = buildLocalizedCityRecords({
    records: buildCuratedRecords(),
    timeZoneCities,
    languages: Object.keys(cldrLocales)
  });
  const sorted = sortCityRecords(records);

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const previousKey = [previous.firstOffset, previous.secondOffset, previous.names.en, previous.timeZone];
    const currentKey = [current.firstOffset, current.secondOffset, current.names.en, current.timeZone];
    assert.equal(
      previousKey.join("\u0000").localeCompare(currentKey.join("\u0000"), "en", { numeric: true }) <= 0 ||
        previous.firstOffset < current.firstOffset ||
        (previous.firstOffset === current.firstOffset && previous.secondOffset < current.secondOffset),
      true,
      `${previous.id} must sort before ${current.id}`
    );
  }
});

test("combined IANA coordinate data covers country-specific names and backward aliases", () => {
  const records = buildZoneCoordinateRecords(zone1970Text, zoneText, backwardText);
  const byZone = new Map(records.map((record) => [record.timeZone, record]));

  assert.equal(byZone.has("America/Regina"), true);
  assert.equal(byZone.has("Europe/Amsterdam"), true);
  assert.equal(byZone.has("Asia/Tokyo"), true);
  assert.equal(byZone.has("Asia/Calcutta"), true);
  assert.equal(byZone.has("Europe/Kiev"), true);
  assert.equal(Number.isFinite(byZone.get("America/Regina").lat), true);
  assert.equal(Number.isFinite(byZone.get("America/Regina").lon), true);
  assert.equal(byZone.get("Asia/Calcutta").canonicalTimeZone, "Asia/Kolkata");
  assert.equal(byZone.get("Europe/Kiev").canonicalTimeZone, "Europe/Kyiv");
  assert.equal(byZone.get("Etc/GMT+12").lat, 0);
  assert.equal(byZone.get("Etc/GMT+12").lon, 0);
  assert.equal(byZone.get("Etc/GMT-14").lat, 0);
  assert.equal(byZone.get("Etc/GMT-14").lon, 0);
});

test("parseCldrExemplarCities flattens localized exemplar city paths", () => {
  const cities = parseCldrExemplarCities(cldrByLanguage["zh-hant"], "zh-Hant");

  assert.equal(cities.get("Asia/Tokyo"), "東京");
  assert.equal(cities.get("Europe/Chisinau"), "基西紐");
});

test("all IANA timezone labels receive coordinates and complete localized city names", () => {
  const zones = buildZoneCoordinateRecords(zone1970Text, zoneText, backwardText);
  const records = buildTimeZoneCityRecords({
    zones,
    cldrByLanguage,
    cldrLocales
  });
  const byZone = new Map(records.map((record) => [record.timeZone, record]));
  const languages = Object.keys(cldrLocales);

  assert.equal(records.length, zones.length);
  for (const record of records) {
    assert.equal(Number.isFinite(record.lat), true, record.timeZone);
    assert.equal(Number.isFinite(record.lon), true, record.timeZone);
    for (const language of languages) {
      assert.equal(Boolean(record.names[language]), true, `${record.timeZone}:${language}`);
    }
  }

  assert.equal(byZone.get("Asia/Tokyo").names["zh-hant"], "東京");
  assert.equal(byZone.get("Asia/Tokyo").names.ko, "도쿄");
  assert.equal(byZone.get("Asia/Tokyo").names.es, "Tokio");
  assert.equal(byZone.get("Asia/Tokyo").names.ru, "Токио");
  assert.equal(byZone.get("Asia/Tokyo").names.pt, "Tóquio");
  assert.equal(byZone.get("Asia/Tokyo").names.de, "Tokio");
  assert.equal(byZone.get("US/Eastern").names.en, "New York");
  assert.equal(byZone.get("Europe/Amsterdam").names.de, "Amsterdam");
  assert.equal(byZone.get("Asia/Shanghai").names.en, "Shanghai");
  assert.equal(byZone.get("Asia/Shanghai").names.ja, "上海");
  assert.equal(byZone.get("Asia/Kolkata").names.en, "Kolkata");
  assert.equal(byZone.get("Asia/Kolkata").names.zh, "加尔各答");
  assert.equal(byZone.get("Asia/Ho_Chi_Minh").names.en, "Ho Chi Minh City");
  assert.equal(byZone.get("Asia/Ho_Chi_Minh").names.zh, "胡志明市");
  assert.equal(byZone.get("Asia/Ho_Chi_Minh").names.ja, "ホーチミン");
  assert.equal(byZone.get("Asia/Ho_Chi_Minh").names.ko, "사이공");
  assert.equal(byZone.get("Atlantic/Faroe").names.en, "Faroes");
  assert.equal(byZone.get("Atlantic/Faroe").names.de, "Färöer");
  assert.equal(byZone.get("Pacific/Kanton").names.en, "Canton Island");
  assert.equal(byZone.get("Pacific/Kanton").names.zh, "坎顿岛");
  assert.equal(byZone.get("Africa/Asmara").names.zh, "阿斯马拉");
  assert.equal(byZone.get("America/Atikokan").names.ja, "アティコカン");
  assert.equal(byZone.get("Europe/Uzhgorod").names.zh, "基辅");
  assert.equal(byZone.get("Europe/Zaporozhye").names.de, "Kiew");
  assert.equal(byZone.get("Pacific/Chuuk").names.ja, "チューク");
  assert.equal(byZone.get("Pacific/Pohnpei").names.ko, "포나페");
  assert.equal(byZone.get("Africa/Asmera").lat, byZone.get("Africa/Asmara").lat);
  assert.equal(byZone.get("Africa/Asmera").lon, byZone.get("Africa/Asmara").lon);
  assert.equal(byZone.get("America/Coral_Harbour").lat, byZone.get("America/Atikokan").lat);
  assert.equal(byZone.get("America/Coral_Harbour").lon, byZone.get("America/Atikokan").lon);
  assert.equal(byZone.get("Pacific/Truk").lat, byZone.get("Pacific/Chuuk").lat);
  assert.equal(byZone.get("Pacific/Truk").lon, byZone.get("Pacific/Chuuk").lon);
  assert.equal(byZone.get("Pacific/Ponape").lat, byZone.get("Pacific/Pohnpei").lat);
  assert.equal(byZone.get("Pacific/Ponape").lon, byZone.get("Pacific/Pohnpei").lon);
  for (const record of records) {
    for (const name of Object.values(record.names)) {
      assert.equal(/\p{Cf}/u.test(name), false, `${record.timeZone}:${name}`);
    }
    if (!/^(?:GMT|UTC)/.test(record.names.en)) {
      const eastAsianNames = ["zh", "zh-hant", "ja", "ko"].map((language) => record.names[language]);
      assert.equal(
        eastAsianNames.every((name) => name === record.names.en),
        false,
        `${record.timeZone}:${record.names.en}`
      );
    }
  }

  for (const [index, zone] of zones.entries()) {
    if (zone.timeZone === zone.nameTimeZone) {
      continue;
    }
    const alias = records[index];
    const localMatches = zones
      .map((candidate, candidateIndex) => ({ candidate, record: records[candidateIndex] }))
      .filter(({ candidate, record }) => (
        candidate.timeZone === candidate.nameTimeZone &&
        candidate.canonicalTimeZone === zone.canonicalTimeZone &&
        record.names.en === alias.names.en
      ));
    if (localMatches.length === 1) {
      assert.equal(alias.lat, localMatches[0].record.lat, `${zone.timeZone}:lat`);
      assert.equal(alias.lon, localMatches[0].record.lon, `${zone.timeZone}:lon`);
    }
  }
});
