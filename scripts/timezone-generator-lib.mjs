const offsetFormatterCache = new Map();

export function parseZoneTab(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [countries = "", coordinates = "", timeZone = "", comments = ""] = line.split("\t");
      return {
        countries: countries.split(",").filter(Boolean),
        coordinates,
        timeZone,
        comments
      };
    })
    .filter((row) => row.timeZone && row.coordinates);
}

function parseBackwardLinks(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line.startsWith("Link"))
    .map((line) => {
      const [, target = "", alias = ""] = line.split(/\s+/);
      return { target, alias };
    })
    .filter((link) => link.target && link.alias);
}

export function parseIso6709Coordinate(value) {
  const match = String(value || "").match(/^([+-])(\d{4}|\d{6})([+-])(\d{5}|\d{7})$/);
  if (!match) {
    throw new Error(`Invalid ISO 6709 coordinate: ${value}`);
  }

  return {
    lat: parseCoordinatePart(match[1], match[2], 2),
    lon: parseCoordinatePart(match[3], match[4], 3)
  };
}

function parseCoordinatePart(sign, digits, degreeDigits) {
  const degrees = Number(digits.slice(0, degreeDigits));
  const minutes = Number(digits.slice(degreeDigits, degreeDigits + 2));
  const seconds = digits.length > degreeDigits + 2 ? Number(digits.slice(degreeDigits + 2)) : 0;
  const value = degrees + minutes / 60 + seconds / 3600;
  return sign === "-" ? -value : value;
}

export function locationNameFromZone(timeZone) {
  const segment = String(timeZone || "").split("/").filter(Boolean).pop() || "";
  return segment.replaceAll("_", " ");
}

function sanitizeDisplayName(value) {
  return String(value || "").replace(/\p{Cf}/gu, "").trim();
}

export function parseCldrExemplarCities(document, locale) {
  const localeRoot = document && document.main && (document.main[locale] || Object.values(document.main)[0]);
  const zoneRoot = localeRoot && localeRoot.dates && localeRoot.dates.timeZoneNames && localeRoot.dates.timeZoneNames.zone;
  const cities = new Map();

  function visit(node, path) {
    if (!node || typeof node !== "object") {
      return;
    }
    if (typeof node.exemplarCity === "string" && node.exemplarCity.trim()) {
      cities.set(path.join("/"), node.exemplarCity.trim());
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "_type" || key === "exemplarCity") {
        continue;
      }
      visit(value, [...path, key]);
    }
  }

  visit(zoneRoot, []);
  return cities;
}

export function formatOffsetMinutes(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid UTC offset minutes: ${minutes}`);
  }
  const sign = value < 0 ? "-" : "+";
  const absolute = Math.abs(value);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `${sign}${hours}${remainder ? `:${String(remainder).padStart(2, "0")}` : ""}`;
}

function offsetMinutesAt(timeZone, date) {
  let formatter = offsetFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset"
    });
    offsetFormatterCache.set(timeZone, formatter);
  }

  const part = formatter.formatToParts(date).find((entry) => entry.type === "timeZoneName");
  const text = part ? part.value : "GMT";
  if (text === "GMT" || text === "UTC") {
    return 0;
  }
  const match = text.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) {
    throw new Error(`Cannot parse UTC offset for ${timeZone}: ${text}`);
  }
  const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
  return match[1] === "-" ? -minutes : minutes;
}

export function offsetProfile(timeZone, year) {
  const offsets = new Set();
  const start = Date.UTC(year, 0, 1, 12);
  const end = Date.UTC(year + 1, 0, 1, 12);

  for (let timestamp = start; timestamp < end; timestamp += 86400000) {
    offsets.add(offsetMinutesAt(timeZone, new Date(timestamp)));
  }

  const sorted = Array.from(offsets).sort((left, right) => left - right);
  const firstOffset = sorted[0] ?? 0;
  const secondOffset = sorted.at(-1) ?? firstOffset;
  return {
    offsets: sorted,
    firstOffset,
    secondOffset,
    label: sorted.map(formatOffsetMinutes).join("/")
  };
}

function timeRuleSignature(timeZone, startYear, years) {
  const start = Date.UTC(startYear, 0, 1, 12);
  const end = Date.UTC(startYear + years, 0, 1, 12);
  const changes = [];
  let previous = offsetMinutesAt(timeZone, new Date(start));
  changes.push(`0:${previous}`);

  for (let timestamp = start + 86400000; timestamp < end; timestamp += 86400000) {
    const current = offsetMinutesAt(timeZone, new Date(timestamp));
    if (current === previous) {
      continue;
    }

    // 日次走査で変化日を見つけ、前後を時間単位で再走査して規則差を保持します。
    const transition = locateHourlyTransition(timeZone, timestamp - 86400000, timestamp + 86400000, previous);
    changes.push(`${Math.round((transition.timestamp - start) / 3600000)}:${transition.offset}`);
    previous = current;
  }

  return changes.join("|");
}

function locateHourlyTransition(timeZone, start, end, previousOffset) {
  for (let timestamp = start; timestamp <= end; timestamp += 3600000) {
    const offset = offsetMinutesAt(timeZone, new Date(timestamp));
    if (offset !== previousOffset) {
      return { timestamp, offset };
    }
  }
  return { timestamp: end, offset: offsetMinutesAt(timeZone, new Date(end)) };
}

export function buildZoneCoordinateRecords(zone1970Text, zoneText, backwardText = "") {
  const byTimeZone = new Map();
  for (const row of [...parseZoneTab(zone1970Text), ...parseZoneTab(zoneText)]) {
    if (!byTimeZone.has(row.timeZone)) {
      const coordinates = parseIso6709Coordinate(row.coordinates);
      byTimeZone.set(row.timeZone, {
        countries: row.countries.join(","),
        coordinates: row.coordinates,
        timeZone: row.timeZone,
        nameTimeZone: row.timeZone,
        canonicalTimeZone: row.timeZone,
        comments: row.comments,
        lat: coordinates.lat,
        lon: coordinates.lon
      });
    }
  }

  // 地理座標を持たないUTC系ゾーンは赤道と本初子午線の交点に固定します。
  for (const timeZone of ["Etc/GMT", "Etc/UTC"]) {
    if (!byTimeZone.has(timeZone)) {
      byTimeZone.set(timeZone, {
        countries: "",
        coordinates: "+0000+00000",
        timeZone,
        nameTimeZone: timeZone,
        canonicalTimeZone: timeZone,
        comments: "",
        lat: 0,
        lon: 0
      });
    }
  }
  for (const timeZone of [
    ...Array.from({ length: 12 }, (_, index) => `Etc/GMT+${index + 1}`),
    ...Array.from({ length: 14 }, (_, index) => `Etc/GMT-${index + 1}`)
  ]) {
    if (!byTimeZone.has(timeZone)) {
      // 固定オフセットには代表地点がないため、座標だけを基準点に固定します。
      byTimeZone.set(timeZone, {
        countries: "",
        coordinates: "+0000+00000",
        timeZone,
        nameTimeZone: timeZone,
        canonicalTimeZone: timeZone,
        comments: "",
        lat: 0,
        lon: 0
      });
    }
  }

  const links = parseBackwardLinks(backwardText);
  const unresolved = new Map(links.map((link) => [link.alias, link.target]));
  let changed = true;
  while (unresolved.size && changed) {
    changed = false;
    for (const [alias, target] of unresolved) {
      const source = byTimeZone.get(target);
      if (!source) {
        continue;
      }
      const local = byTimeZone.get(alias);
      byTimeZone.set(alias, local
        ? { ...local, canonicalTimeZone: source.canonicalTimeZone }
        : {
            ...source,
            timeZone: alias,
            nameTimeZone: source.nameTimeZone,
            canonicalTimeZone: source.canonicalTimeZone
          });
      unresolved.delete(alias);
      changed = true;
    }
  }

  if (unresolved.size) {
    throw new Error(`Unresolved IANA backward links: ${Array.from(unresolved.keys()).join(", ")}`);
  }

  return Array.from(byTimeZone.values()).sort((left, right) => left.timeZone.localeCompare(right.timeZone, "en"));
}

export function buildTimeZoneCityRecords({ zones, cldrByLanguage, cldrLocales }) {
  const localizedMaps = {};
  const localizedLeafMaps = {};
  for (const [language, locale] of Object.entries(cldrLocales || {})) {
    const cityMap = parseCldrExemplarCities(cldrByLanguage && cldrByLanguage[language], locale);
    localizedMaps[language] = cityMap;
    localizedLeafMaps[language] = buildUniqueLeafMap(cityMap);
  }
  const cldrAliasesByTarget = new Map();
  const aliasesByCanonical = new Map();
  const localNamesByCanonical = new Map();
  for (const zone of zones || []) {
    const canonicalAliases = aliasesByCanonical.get(zone.canonicalTimeZone) || [];
    canonicalAliases.push(zone.timeZone);
    aliasesByCanonical.set(zone.canonicalTimeZone, canonicalAliases);
    if (zone.timeZone === zone.nameTimeZone) {
      const localNames = localNamesByCanonical.get(zone.canonicalTimeZone) || new Set();
      localNames.add(normalizeLocationIdentifier(locationNameFromZone(zone.timeZone)));
      localNamesByCanonical.set(zone.canonicalTimeZone, localNames);
      continue;
    }
    const aliases = cldrAliasesByTarget.get(zone.nameTimeZone) || [];
    aliases.push(zone.timeZone);
    cldrAliasesByTarget.set(zone.nameTimeZone, aliases);
  }

  const records = (zones || []).map((zone) => {
    const directLookupZones = Array.from(new Set([
      zone.timeZone,
      zone.nameTimeZone
    ].filter(Boolean)));
    const expectedEnglish = locationNameFromZone(zone.nameTimeZone || zone.timeZone);
    const matchingAlias = (aliasesByCanonical.get(zone.canonicalTimeZone) || []).find((alias) => {
      const aliasEnglish = localizedMaps.en && localizedMaps.en.get(alias);
      return aliasEnglish &&
        normalizeLocationIdentifier(aliasEnglish) === normalizeLocationIdentifier(expectedEnglish);
    });
    const localNames = localNamesByCanonical.get(zone.canonicalTimeZone) || new Set();
    const renamedAlias = (cldrAliasesByTarget.get(zone.timeZone) || []).find((alias) => {
      const aliasEnglish = localizedMaps.en && localizedMaps.en.get(alias);
      return aliasEnglish && !localNames.has(normalizeLocationIdentifier(aliasEnglish));
    });
    const lookupZones = Array.from(new Set([
      ...directLookupZones,
      matchingAlias,
      renamedAlias
    ].filter(Boolean)));
    const fallbackEnglish = sanitizeDisplayName(
      lookupLocalizedName(localizedMaps.en, localizedLeafMaps.en, lookupZones) ||
      expectedEnglish ||
      "UTC"
    );
    const names = {};

    for (const language of Object.keys(cldrLocales || {})) {
      const localizedName = lookupLocalizedName(localizedMaps[language], localizedLeafMaps[language], lookupZones);
      names[language] = sanitizeDisplayName(localizedName || fallbackEnglish);
    }

    return {
      timeZone: zone.timeZone,
      canonicalTimeZone: zone.canonicalTimeZone,
      lat: zone.lat,
      lon: zone.lon,
      names
    };
  });

  const localLocations = new Map();
  for (let index = 0; index < (zones || []).length; index += 1) {
    const zone = zones[index];
    if (zone.timeZone !== zone.nameTimeZone) {
      continue;
    }
    const record = records[index];
    const key = `${record.canonicalTimeZone}\u0000${normalizeLocationIdentifier(record.names.en)}`;
    const matches = localLocations.get(key) || [];
    matches.push(record);
    localLocations.set(key, matches);
  }

  return records.map((record, index) => {
    const zone = zones[index];
    if (zone.timeZone === zone.nameTimeZone) {
      return record;
    }
    const key = `${record.canonicalTimeZone}\u0000${normalizeLocationIdentifier(record.names.en)}`;
    const matches = localLocations.get(key) || [];
    if (matches.length !== 1) {
      return record;
    }
    // 旧別名が同じ都市名を持つ現行の地理レコードを一意に指す場合だけ、座標を引き継ぎます。
    return {
      ...record,
      lat: matches[0].lat,
      lon: matches[0].lon
    };
  });
}

export function validateCuratedCityList(cityIds) {
  const issues = [];
  const seenIds = new Set();
  const entries = Array.isArray(cityIds) ? cityIds : [];

  if (!Array.isArray(cityIds)) {
    issues.push("city-list:not-array");
  }
  for (const [index, cityId] of entries.entries()) {
    const label = typeof cityId === "string" && cityId ? cityId : `#${index + 1}`;
    if (typeof cityId !== "string" || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(cityId)) {
      issues.push(`${label}:invalid-id`);
      continue;
    }
    if (seenIds.has(cityId)) {
      issues.push(`${label}:duplicate-id`);
    }
    seenIds.add(cityId);
  }

  return issues;
}

function normalizeLocationIdentifier(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildUniqueLeafMap(cityMap) {
  const byLeaf = new Map();
  const duplicates = new Set();
  for (const [timeZone, name] of cityMap) {
    const leaf = timeZone.split("/").pop();
    if (byLeaf.has(leaf) && byLeaf.get(leaf) !== name) {
      duplicates.add(leaf);
    } else {
      byLeaf.set(leaf, name);
    }
  }
  for (const leaf of duplicates) {
    byLeaf.delete(leaf);
  }
  return byLeaf;
}

function lookupLocalizedName(cityMap, leafMap, timeZones) {
  for (const timeZone of timeZones) {
    const direct = cityMap && cityMap.get(timeZone);
    if (direct) {
      return direct;
    }
  }
  for (const timeZone of timeZones) {
    const leaf = timeZone.split("/").pop();
    const fallback = leafMap && leafMap.get(leaf);
    if (fallback) {
      return fallback;
    }
  }
  return "";
}

export function buildCityRecords({
  cityIds,
  zone1970Text,
  zoneText,
  year
}) {
  const sourceRows = [...parseZoneTab(zone1970Text), ...parseZoneTab(zoneText)];
  const byTimeZone = new Map();
  for (const row of sourceRows) {
    if (!byTimeZone.has(row.timeZone)) {
      byTimeZone.set(row.timeZone, row);
    }
  }
  const byCityId = new Map();
  for (const row of byTimeZone.values()) {
    const cityId = normalizeLocationIdentifier(locationNameFromZone(row.timeZone));
    const rows = byCityId.get(cityId) || [];
    rows.push(row);
    byCityId.set(cityId, rows);
  }

  return cityIds.map((cityId) => {
    const candidates = byCityId.get(normalizeLocationIdentifier(cityId)) || [];
    if (candidates.length > 1) {
      throw new Error(`City matches multiple IANA zones: ${cityId}`);
    }
    const source = candidates[0];
    if (!source) {
      throw new Error(`City is missing from IANA data: ${cityId}`);
    }

    const parsed = parseIso6709Coordinate(source.coordinates);
    const timeZone = source.timeZone;
    const profile = offsetProfile(timeZone, year);
    return {
      id: cityId,
      country: source.countries[0],
      lat: parsed.lat,
      lon: parsed.lon,
      timeZone,
      firstOffset: profile.firstOffset,
      secondOffset: profile.secondOffset,
      offsetLabel: profile.label
    };
  });
}

export function buildLocalizedCityRecords({
  records,
  timeZoneCities,
  languages = []
}) {
  const byTimeZone = new Map((timeZoneCities || []).map((city) => [city.timeZone, city]));

  return (records || []).map((record) => {
    const timeZoneCity = byTimeZone.get(record.timeZone);
    if (!timeZoneCity) {
      throw new Error(`Localized timezone data is missing: ${record.timeZone}`);
    }
    const englishFallback = sanitizeDisplayName(
      (timeZoneCity.names && timeZoneCity.names.en) ||
      locationNameFromZone(record.timeZone)
    );
    const names = {};
    for (const language of languages) {
      names[language] = sanitizeDisplayName(
        (timeZoneCity.names && timeZoneCity.names[language]) ||
        englishFallback
      );
    }
    return { ...record, names };
  });
}

export function sortCityRecords(records) {
  return [...records].sort((left, right) =>
    left.firstOffset - right.firstOffset ||
    left.secondOffset - right.secondOffset ||
    String((left.names && left.names.en) || left.id).localeCompare(
      String((right.names && right.names.en) || right.id),
      "en"
    ) ||
    left.timeZone.localeCompare(right.timeZone, "en")
  );
}

export function findDuplicateCountryRules(records, options) {
  const signatureCache = new Map();
  const seen = new Map();
  const duplicates = [];

  for (const record of records) {
    let signature = signatureCache.get(record.timeZone);
    if (!signature) {
      signature = timeRuleSignature(record.timeZone, options.startYear, options.years);
      signatureCache.set(record.timeZone, signature);
    }
    const key = `${record.country}\u0000${signature}`;
    const existing = seen.get(key);
    if (existing) {
      duplicates.push({
        country: record.country,
        first: existing.id,
        second: record.id,
        signature
      });
    } else {
      seen.set(key, record);
    }
  }

  return duplicates;
}
