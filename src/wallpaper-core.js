(function attachWorldClockCore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.WorldClockCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createWorldClockCore() {
  const DEG_TO_RAD = Math.PI / 180;
  const MERCATOR_NORTH_LIMIT = 72;
  const MERCATOR_SOUTH_LIMIT = -60;
  const MAP_CORE_NORTH_LIMIT = 66.6;
  const MAP_CORE_SOUTH_LIMIT = -56;
  const MAP_NARROW_SOUTH_LIMIT = -72;
  const UNPROJECT_LAT_LIMIT = 85;
  // 白令海峡付近の小島を接合線で分断しないため、大西洋中心表示だけ少し東へ寄せます。
  const ATLANTIC_SEAM_LONGITUDE = -168.4;
  const PACIFIC_SEAM_LONGITUDE = -30;
  const MIN_LABEL_VIEWPORT_HEIGHT = 1;
  const TERMINATOR_EDGE_ALPHA = 0.72;
  const TERMINATOR_FADE_INNER_PX = 64;
  const TERMINATOR_FADE_OUTER_PX = 160;
  const DAY_MS = 86400000;
  const SAME_CITY_DISTANCE_KM = 15;
  const canonicalTimeZoneCache = new Map();
  const zonedTimeFormatterCache = new Map();

  // ブラウザーとNodeテストで同じ生成データを読み込むための共通境界です。
  function loadGeneratedData(globalName, modulePath) {
    let data = typeof globalThis !== "undefined" ? globalThis[globalName] : null;
    if (!data && typeof require === "function") {
      try {
        data = require(modulePath);
      } catch (error) {
        data = null;
      }
    }
    return data;
  }

  const cityPresetData = loadGeneratedData("WorldClockCityPresetData", "./city-presets.js");
  if (!cityPresetData || !cityPresetData.presets) {
    throw new Error("Generated city preset data is unavailable.");
  }
  const CITY_PRESETS = cityPresetData.presets;
  const RUNTIME_LOCALES = cityPresetData.languages || { zh: "zh-CN", en: "en-US", ja: "ja-JP" };
  const SUPPORTED_LANGUAGES = Object.keys(RUNTIME_LOCALES);
  const TIME_ZONE_CATALOG_BY_ZONE = new Map(
    Object.entries(cityPresetData.timeZoneCatalog || {})
  );

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeLongitude(lon) {
    let normalized = ((lon + 180) % 360 + 360) % 360 - 180;
    if (normalized === -180 && lon > 0) {
      normalized = 180;
    }
    return normalized;
  }

  function mercatorY(lat) {
    const clamped = clamp(lat, -UNPROJECT_LAT_LIMIT, UNPROJECT_LAT_LIMIT);
    const rad = clamped * DEG_TO_RAD;
    return Math.log(Math.tan(Math.PI / 4 + rad / 2));
  }

  function mercatorAspect(north, south) {
    return (Math.PI * 2) / (mercatorY(north) - mercatorY(south));
  }

  function solveLatitude(low, high, targetAspect, aspectForLatitude) {
    let minimum = low;
    let maximum = high;
    for (let index = 0; index < 48; index += 1) {
      const middle = (minimum + maximum) / 2;
      if (aspectForLatitude(middle) > targetAspect) {
        minimum = middle;
      } else {
        maximum = middle;
      }
    }
    return (minimum + maximum) / 2;
  }

  function solveSouthLatitude(targetAspect) {
    let southern = MAP_NARROW_SOUTH_LIMIT;
    let northern = MAP_CORE_SOUTH_LIMIT;
    for (let index = 0; index < 48; index += 1) {
      const middle = (southern + northern) / 2;
      if (mercatorAspect(MERCATOR_NORTH_LIMIT, middle) < targetAspect) {
        southern = middle;
      } else {
        northern = middle;
      }
    }
    return (southern + northern) / 2;
  }

  function latitudeAtMercatorY(mercator) {
    return (2 * Math.atan(Math.exp(mercator)) - Math.PI / 2) / DEG_TO_RAD;
  }

  function mapViewForViewport(width, height) {
    const viewportWidth = Math.max(1, Math.round(Number(width) || 1));
    const viewportHeight = Math.max(1, Math.round(Number(height) || 1));
    // 極小ビューポートでも投影計算用に少なくとも1pxを残します。
    const reserveCap = Math.max(0, viewportHeight - 1);
    const reserve = Math.min(
      clamp(Math.round(viewportHeight * 0.052), 48, 96),
      reserveCap
    );
    const usableHeight = Math.max(1, viewportHeight - reserve);
    const targetAspect = viewportWidth / usableHeight;
    const centeredAspect = viewportWidth / viewportHeight;
    const coreAspect = mercatorAspect(MAP_CORE_NORTH_LIMIT, MAP_CORE_SOUTH_LIMIT);
    const northExpandedAspect = mercatorAspect(MERCATOR_NORTH_LIMIT, MAP_CORE_SOUTH_LIMIT);
    const narrowFullAspect = mercatorAspect(MERCATOR_NORTH_LIMIT, MAP_NARROW_SOUTH_LIMIT);
    const maxLatitudeAspect = mercatorAspect(UNPROJECT_LAT_LIMIT, -UNPROJECT_LAT_LIMIT);
    let north = MAP_CORE_NORTH_LIMIT;
    let south = MAP_CORE_SOUTH_LIMIT;
    let mapWidth = viewportWidth;
    let mapHeight = viewportHeight;
    let labelHeight = usableHeight;
    let x = 0;
    let y = 0;
    let mode = "core";

    if (targetAspect >= coreAspect) {
      mapWidth = coreAspect * usableHeight;
      x = (viewportWidth - mapWidth) / 2;
      mode = "wide-core";
    } else if (targetAspect >= northExpandedAspect) {
      north = solveLatitude(MAP_CORE_NORTH_LIMIT, MERCATOR_NORTH_LIMIT, targetAspect, (latitude) =>
        mercatorAspect(latitude, MAP_CORE_SOUTH_LIMIT)
      );
      mode = "north-expand";
    } else if (targetAspect >= narrowFullAspect) {
      north = MERCATOR_NORTH_LIMIT;
      south = solveSouthLatitude(targetAspect);
      mode = "south-expand";
    } else if (targetAspect >= maxLatitudeAspect) {
      // 赤道中央へ切り替えた後は、タスクバー余白ではなく画面全体の中心を基準にします。
      north = solveLatitude(MERCATOR_NORTH_LIMIT, UNPROJECT_LAT_LIMIT, centeredAspect, (latitude) =>
        mercatorAspect(latitude, -latitude)
      );
      south = -north;
      labelHeight = viewportHeight;
      mode = "equator";
    } else {
      north = UNPROJECT_LAT_LIMIT;
      south = -UNPROJECT_LAT_LIMIT;
      mapHeight = viewportWidth / maxLatitudeAspect;
      y = (viewportHeight - mapHeight) / 2;
      labelHeight = viewportHeight;
      mode = "max-latitude";
    }

    return {
      x,
      y,
      width: mapWidth,
      height: mapHeight,
      north,
      south,
      taskbarReserve: reserve,
      usableHeight: labelHeight,
      mode
    };
  }

  function landSouthLimit(view) {
    const south = Number(view && view.south);
    // 南極大陸を描画対象に戻さないため、陸地だけは旧来の南限を維持します。
    return Math.max(Number.isFinite(south) ? south : MERCATOR_SOUTH_LIMIT, MERCATOR_SOUTH_LIMIT);
  }

  function labelViewportForMapView(width, height, view) {
    const viewportWidth = Math.max(1, Math.round(Number(width) || 1));
    const viewportHeight = Math.max(1, Math.round(Number(height) || 1));
    const source = view || {};
    const mapY = clamp(Number(source.y) || 0, 0, Math.max(0, viewportHeight - 1));
    const mapHeight = Math.max(1, Number(source.height) || viewportHeight);
    const safeBottom = clamp(Number(source.usableHeight) || viewportHeight, 1, viewportHeight);
    const minimumBottom = mapY + MIN_LABEL_VIEWPORT_HEIGHT;
    const mapBottom = clamp(mapY + mapHeight, minimumBottom, viewportHeight);
    const bottom = Math.max(minimumBottom, Math.min(safeBottom, mapBottom));

    return {
      x: 0,
      y: mapY,
      width: viewportWidth,
      height: bottom - mapY
    };
  }

  function normalizeLayout(layout) {
    return layout === "pacific" ? "pacific" : "atlantic";
  }

  function projectionView(options) {
    const config = options || {};
    const source = config.view || {};
    const layout = normalizeLayout(source.layout || config.layout || "atlantic");
    const north = Number(source.north);
    const south = Number(source.south);
    const resolvedNorth = Number.isFinite(north) ? clamp(north, -UNPROJECT_LAT_LIMIT, UNPROJECT_LAT_LIMIT) : MERCATOR_NORTH_LIMIT;
    const resolvedSouth = Number.isFinite(south) ? clamp(south, -UNPROJECT_LAT_LIMIT, UNPROJECT_LAT_LIMIT) : MERCATOR_SOUTH_LIMIT;
    if (resolvedNorth <= resolvedSouth) {
      return {
        width: Math.max(1, Number(source.width || config.width) || 1),
        north: MERCATOR_NORTH_LIMIT,
        south: MERCATOR_SOUTH_LIMIT,
        layout
      };
    }
    return {
      width: Math.max(1, Number(source.width || config.width) || 1),
      north: resolvedNorth,
      south: resolvedSouth,
      layout
    };
  }

  function terminatorFadeAlpha(x, view, viewportWidth) {
    if (!view) {
      return 1;
    }
    const point = Number(x) || 0;
    const left = Number(view.x) || 0;
    const mapWidth = Math.max(1, Number(view.width) || 1);
    const right = left + mapWidth;
    const screenWidth = Math.max(1, Number(viewportWidth) || right);

    function sideAlpha(distance, margin) {
      if (margin <= 0) {
        return distance >= 0 ? 1 : 0;
      }
      // 外側は余白でゆっくり消し、内側は地図本体を保つため短く戻します。
      const inner = Math.min(TERMINATOR_FADE_INNER_PX, Math.max(1, margin / 2));
      const outer = Math.min(TERMINATOR_FADE_OUTER_PX, margin);
      if (distance < 0) {
        return clamp((outer + distance) / outer, 0, 1) * TERMINATOR_EDGE_ALPHA;
      }
      if (distance < inner) {
        return TERMINATOR_EDGE_ALPHA + (1 - TERMINATOR_EDGE_ALPHA) * distance / inner;
      }
      return 1;
    }

    if (point < left) {
      return sideAlpha(point - left, left);
    }
    if (point > right) {
      return sideAlpha(right - point, screenWidth - right);
    }
    return Math.min(
      sideAlpha(point - left, left),
      sideAlpha(right - point, screenWidth - right)
    );
  }

  function layoutSeam(layout) {
    return normalizeLayout(layout) === "pacific" ? PACIFIC_SEAM_LONGITUDE : ATLANTIC_SEAM_LONGITUDE;
  }

  function longitudeToX(lon, width, layout) {
    const seam = layoutSeam(layout);
    const normalized = ((normalizeLongitude(lon - seam) + 360) % 360);
    return (normalized / 360) * width;
  }

  function projectMercator(options) {
    const view = projectionView(options);
    const top = mercatorY(view.north);
    const lat = clamp(Number(options.lat) || 0, view.south, view.north);
    const width = view.width;
    const scale = width / (Math.PI * 2);
    const x = longitudeToX(Number(options.lon) || 0, width, view.layout);
    const y = (top - mercatorY(lat)) * scale;

    return { x, y };
  }

  function unprojectMercator(options) {
    const view = projectionView(options);
    const width = view.width;
    const x = Number(options.x) || 0;
    const y = Number(options.y) || 0;
    const scale = width / (Math.PI * 2);
    const mercator = mercatorY(view.north) - y / scale;
    const lat = clamp(latitudeAtMercatorY(mercator), -UNPROJECT_LAT_LIMIT, UNPROJECT_LAT_LIMIT);
    const lon = normalizeLongitude(layoutSeam(view.layout) + (x / width) * 360);

    return { lat, lon };
  }

  function coverMercatorRect(width, height) {
    const viewportWidth = Math.max(1, Math.round(Number(width) || 1));
    const mapAspect = mercatorAspect(MERCATOR_NORTH_LIMIT, MERCATOR_SOUTH_LIMIT);
    let mapWidth = viewportWidth;
    let mapHeight = Math.round(mapWidth / mapAspect);

    return {
      x: 0,
      y: 0,
      width: mapWidth,
      height: mapHeight
    };
  }

  function viewportFillRect(width, height) {
    return {
      x: 0,
      y: 0,
      width: Math.max(1, Math.round(Number(width) || 1)),
      height: Math.max(1, Math.round(Number(height) || 1))
    };
  }

  function canvasBackingSize(cssSize, devicePixelRatio) {
    const css = Math.max(1, Math.floor(Number(cssSize) || 1));
    const scale = Math.max(1, Number(devicePixelRatio) || 1);
    return {
      css,
      pixels: Math.ceil(css * scale)
    };
  }

  function normalizeLabelSize(size) {
    return size === "medium" || size === "large" ? size : "small";
  }

  function labelMetrics(size, viewportWidth, viewportHeight) {
    const normalized = normalizeLabelSize(size);
    const height = Number(viewportHeight);
    const compact = Number(viewportWidth) < 760 || (height > 0 && height < 520);
    const scale = normalized === "large" ? 1.72 : normalized === "medium" ? 1.38 : 1;
    const baseWidth = compact ? 118 : 138;
    const baseHeight = compact ? 44 : 48;
    const nameBase = compact ? 10 : 11;
    const timeBase = compact ? 13 : 16;
    const iconBase = compact ? 11 : 11;
    const lineLift = normalized === "large" ? 0.1 : normalized === "medium" ? 0.06 : 0;

    return {
      size: normalized,
      scale,
      estimatedWidth: Math.round(baseWidth * scale),
      estimatedHeight: Math.round(baseHeight * scale),
      namePx: Math.round(nameBase * scale * 10) / 10,
      timePx: Math.round(timeBase * scale * 10) / 10,
      iconPx: Math.round(iconBase * scale * 10) / 10,
      nameLineHeight: Math.round((1.15 + lineLift) * 100) / 100,
      timeLineHeight: Math.round((1 + lineLift) * 100) / 100,
      timeGapPx: Math.round(4 * scale * 10) / 10
    };
  }

  function boxesOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function chooseLabelPlacement(options) {
    const screenX = Number(options.screenX) || 0;
    const screenY = Number(options.screenY) || 0;
    const takenBoxes = Array.isArray(options.takenBoxes) ? options.takenBoxes : [];
    const blockedBoxes = Array.isArray(options.blockedBoxes) ? options.blockedBoxes : [];
    const estimatedWidth = Math.max(1, Number(options.estimatedWidth) || 138);
    const estimatedHeight = Math.max(1, Number(options.estimatedHeight) || 48);
    const rect = options.viewport || { x: 0, y: 0, width: 1, height: 1 };
    const preferredHorizontal = screenX < rect.x + rect.width * 0.62 ? "right" : "left";
    const alternateHorizontal = preferredHorizontal === "right" ? "left" : "right";
    const sideOffset = (side) => side === "right" ? 14 : -14;
    const placements = [
      { side: preferredHorizontal, dy: 0 },
      { side: alternateHorizontal, dy: 0 },
      { side: preferredHorizontal, dy: -estimatedHeight * 0.85 },
      { side: preferredHorizontal, dy: estimatedHeight * 0.85 },
      { side: alternateHorizontal, dy: -estimatedHeight * 0.85 },
      { side: alternateHorizontal, dy: estimatedHeight * 0.85 },
      { side: preferredHorizontal, dy: -estimatedHeight * 1.35 },
      { side: preferredHorizontal, dy: estimatedHeight * 1.35 },
      { side: alternateHorizontal, dy: -estimatedHeight * 1.35 },
      { side: alternateHorizontal, dy: estimatedHeight * 1.35 },
      { side: preferredHorizontal, dy: -estimatedHeight * 1.7 },
      { side: preferredHorizontal, dy: estimatedHeight * 1.7 },
      { side: alternateHorizontal, dy: -estimatedHeight * 1.7 },
      { side: alternateHorizontal, dy: estimatedHeight * 1.7 },
      { side: preferredHorizontal, dy: -estimatedHeight * 2.1 },
      { side: preferredHorizontal, dy: estimatedHeight * 2.1 },
      { side: alternateHorizontal, dy: -estimatedHeight * 2.1 },
      { side: alternateHorizontal, dy: estimatedHeight * 2.1 }
    ].map((placement) => ({
      ...placement,
      dx: sideOffset(placement.side)
    }));

    const findPlacement = (avoidBlocked) => {
      for (const placement of placements) {
        const anchorX = screenX + placement.dx;
        const anchorY = screenY + placement.dy;
        const box = {
          left: placement.side === "right" ? anchorX : anchorX - estimatedWidth,
          right: placement.side === "right" ? anchorX + estimatedWidth : anchorX,
          top: anchorY - estimatedHeight / 2,
          bottom: anchorY + estimatedHeight / 2
        };
        const inside = box.left > rect.x + 4 && box.right < rect.x + rect.width - 4 && box.top > rect.y + 4 && box.bottom < rect.y + rect.height - 4;
        const overlapsTaken = takenBoxes.some((other) => boxesOverlap(box, other));
        const overlapsBlocked = avoidBlocked && blockedBoxes.some((other) => boxesOverlap(box, other));
        if (inside && !overlapsTaken && !overlapsBlocked) {
          return { x: anchorX, y: anchorY, placement: placement.side, box };
        }
      }
      return null;
    };

    const placement = findPlacement(true) || findPlacement(false);
    if (placement) {
      takenBoxes.push(placement.box);
    }
    return placement;
  }

  function terminatorCellSize(width, height) {
    const viewportWidth = Math.max(1, Math.round(Number(width) || 1));
    const viewportHeight = Math.max(1, Math.round(Number(height) || 1));
    const target = viewportWidth >= 2200 ? 10 : viewportWidth >= 1600 ? 8 : viewportWidth >= 760 ? 8 : 4;
    const candidates = [target, target - 2, target + 2, 10, 8, 6, 5, 4].filter((size) => size >= 4);
    const exact = candidates.find((size) => viewportWidth % size === 0 && viewportHeight % size === 0);
    return exact || target;
  }

  function terminatorGridCoordinates(options) {
    const config = options || {};
    const width = Math.max(1, Math.round(Number(config.width) || 1));
    const height = Math.max(1, Math.round(Number(config.height) || 1));
    const cellSize = Math.max(1, Math.floor(Number(config.cellSize) || 1));
    const view = config.view || config.rect || coverMercatorRect(width, height);
    const layout = normalizeLayout(config.layout || view.layout);
    const columns = [];
    const rows = [];

    for (let x = 0; x < width; x += cellSize) {
      const geo = unprojectMercator({
        x: x + cellSize / 2 - (Number(view.x) || 0),
        y: cellSize / 2 - (Number(view.y) || 0),
        width: view.width,
        view,
        layout
      });
      columns.push({ x, lon: geo.lon });
    }
    for (let y = 0; y < height; y += cellSize) {
      const geo = unprojectMercator({
        x: cellSize / 2 - (Number(view.x) || 0),
        y: y + cellSize / 2 - (Number(view.y) || 0),
        width: view.width,
        view,
        layout
      });
      rows.push({ y, lat: geo.lat });
    }

    return { columns, rows };
  }

  function shouldBreakLandSegment(options) {
    const previous = options && options.previous;
    const current = options && options.current;
    const width = Math.max(1, Number(options && options.width) || 1);
    if (!previous || !current) {
      return false;
    }

    if (Math.abs(Number(current.x) - Number(previous.x)) > width * 0.52) {
      return true;
    }

    const previousLon = Number(previous.lon);
    const currentLon = Number(current.lon);
    const previousLat = Number(previous.lat);
    const currentLat = Number(current.lat);
    const previousOnDatasetSeam = Math.abs(Math.abs(previousLon) - 180) < 0.2;
    const currentOnDatasetSeam = Math.abs(Math.abs(currentLon) - 180) < 0.2;

    return previousOnDatasetSeam && currentOnDatasetSeam && Math.abs(previousLat - currentLat) > 0.25;
  }

  function isValidTimeZone(timeZone) {
    return Boolean(canonicalTimeZone(timeZone));
  }

  function canonicalTimeZone(timeZone) {
    const text = typeof timeZone === "string" ? timeZone.trim() : "";
    if (!text) {
      return null;
    }
    if (canonicalTimeZoneCache.has(text)) {
      return canonicalTimeZoneCache.get(text);
    }
    let canonical = null;
    try {
      const formatter = new Intl.DateTimeFormat("en-US", { timeZone: text });
      canonical = formatter.resolvedOptions().timeZone || text;
    } catch (error) {
      canonical = null;
    }
    canonicalTimeZoneCache.set(text, canonical);
    return canonical;
  }

  function parseIso6709Coordinate(value) {
    const text = typeof value === "string" ? value.trim() : "";
    const match = text.match(/^([+-])(\d{2})(\d{2})(\d{2})?([+-])(\d{3})(\d{2})(\d{2})?$/);
    if (!match) {
      return null;
    }

    const lat = Number(match[2]) + Number(match[3]) / 60 + Number(match[4] || 0) / 3600;
    const lon = Number(match[6]) + Number(match[7]) / 60 + Number(match[8] || 0) / 3600;
    return {
      lat: match[1] === "-" ? -lat : lat,
      lon: match[5] === "-" ? -lon : lon
    };
  }

  function timeZoneCoordinates(timeZone) {
    const requested = typeof timeZone === "string" ? timeZone.trim() : "";
    const canonical = canonicalTimeZone(requested);
    if (!canonical) {
      return null;
    }

    // 表示名と座標は同じ生成レコードから取得し、別名でも同じ解決経路を使います。
    const entry = findTimeZoneCatalogEntry(requested);
    if (!entry || !Number.isFinite(entry.lat) || !Number.isFinite(entry.lon)) {
      return null;
    }
    return { lat: entry.lat, lon: entry.lon, timeZone: entry.timeZone };
  }

  function timeZoneEnglishName(timeZone) {
    const text = String(timeZone || "UTC").split("/").pop() || "UTC";
    return text.replace(/_/g, " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }

  function findTimeZoneCatalogEntry(timeZone) {
    const requested = typeof timeZone === "string" ? timeZone.trim() : "";
    const canonical = canonicalTimeZone(timeZone);
    if (!canonical) {
      return null;
    }

    return TIME_ZONE_CATALOG_BY_ZONE.get(requested) ||
      TIME_ZONE_CATALOG_BY_ZONE.get(canonical) ||
      (canonical === "UTC" ? TIME_ZONE_CATALOG_BY_ZONE.get("Etc/UTC") : null) ||
      null;
  }

  function fallbackNames(timeZone) {
    const english = timeZoneEnglishName(timeZone);
    return Object.fromEntries(SUPPORTED_LANGUAGES.map((language) => [language, english]));
  }

  function parseCoordinateValue(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isValidCoordinatePair(lat, lon) {
    return Number.isFinite(lat)
      && Number.isFinite(lon)
      && lat >= -90
      && lat <= 90
      && lon >= -180
      && lon <= 180;
  }

  function parseCurrentCoordinates(input) {
    const text = typeof input === "string" ? input.trim() : "";
    if (!text) {
      return null;
    }
    const parts = text.split(/[,，]/);
    if (parts.length !== 2) {
      return null;
    }
    const lat = parseCoordinateValue(parts[0]);
    const lon = parseCoordinateValue(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return null;
    }
    return { lat, lon };
  }

  function resolveCurrentCity(options) {
    const raw = options || {};
    const resolvedLat = parseCoordinateValue(raw.lat);
    const resolvedLon = parseCoordinateValue(raw.lon);
    if (
      raw.current === true
      && isValidCoordinatePair(resolvedLat, resolvedLon)
      && isValidTimeZone(raw.timeZone)
    ) {
      return {
        city: {
          ...raw,
          id: "current",
          current: true,
          lat: resolvedLat,
          lon: resolvedLon,
          manualCoordinates: Boolean(raw.manualCoordinates)
        },
        errors: []
      };
    }

    const errors = [];
    const localTimeZone = canonicalTimeZone(raw.localTimeZone) || canonicalTimeZone(detectLocalTimeZone()) || "UTC";
    const manualTimeZone = typeof raw.timeZone === "string" ? raw.timeZone.trim() : "";
    let safeTimeZone = manualTimeZone ? canonicalTimeZone(manualTimeZone) : localTimeZone;
    if (manualTimeZone && !safeTimeZone) {
      errors.push({ type: "invalid-timezone", value: manualTimeZone });
      safeTimeZone = localTimeZone;
    }
    if (!safeTimeZone) {
      safeTimeZone = "UTC";
    }

    const manualCoords = typeof raw.coords === "string" ? raw.coords.trim() : "";
    let coordinates = manualCoords ? parseCurrentCoordinates(manualCoords) : null;
    const manualCoordinates = Boolean(coordinates);
    if (manualCoords && !coordinates) {
      errors.push({ type: "invalid-coordinates", value: manualCoords });
    }
    const timeZoneCity = findTimeZoneCatalogEntry(safeTimeZone);
    if (!coordinates) {
      coordinates = timeZoneCity || timeZoneCoordinates(safeTimeZone);
      if (!coordinates) {
        errors.push({ type: "missing-timezone-coordinate", timeZone: safeTimeZone });
        coordinates = { lat: 0, lon: 0 };
      }
    }

    const manualName = typeof raw.name === "string" ? raw.name.trim() : "";
    const city = {
      id: "current",
      current: true,
      lat: coordinates.lat,
      lon: coordinates.lon,
      timeZone: safeTimeZone,
      manualCoordinates
    };

    if (manualName) {
      city.name = manualName;
    } else if (timeZoneCity && timeZoneCity.names) {
      city.names = { ...timeZoneCity.names };
    } else {
      city.names = fallbackNames(safeTimeZone);
    }

    return { city, errors };
  }

  function isSameTimeZone(a, b) {
    const first = canonicalTimeZone(a);
    const second = canonicalTimeZone(b);
    return Boolean(first && second && first === second);
  }

  function cityDistanceKm(first, second) {
    const firstLat = Number(first && first.lat);
    const firstLon = Number(first && first.lon);
    const secondLat = Number(second && second.lat);
    const secondLon = Number(second && second.lon);
    if (![firstLat, firstLon, secondLat, secondLon].every(Number.isFinite)) {
      return Infinity;
    }

    const latDelta = (secondLat - firstLat) * DEG_TO_RAD;
    const lonDelta = normalizeLongitude(secondLon - firstLon) * DEG_TO_RAD;
    const firstLatRad = firstLat * DEG_TO_RAD;
    const secondLatRad = secondLat * DEG_TO_RAD;
    const haversine = Math.sin(latDelta / 2) ** 2 +
      Math.cos(firstLatRad) * Math.cos(secondLatRad) * Math.sin(lonDelta / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
  }

  function isSameCity(first, second) {
    return isSameTimeZone(first && first.timeZone, second && second.timeZone) &&
      cityDistanceKm(first, second) <= SAME_CITY_DISTANCE_KM;
  }

  function slugify(value) {
    return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "city";
  }

  function normalizeCustomCity(raw, index) {
    if (!raw || typeof raw !== "object") {
      return { city: null, errors: ["not-object"] };
    }

    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const requestedTimeZone = typeof raw.timeZone === "string" ? raw.timeZone.trim() : "";
    const canonical = canonicalTimeZone(requestedTimeZone);
    if (!canonical) {
      return { city: null, errors: ["invalid-timezone"] };
    }

    const timeZoneCity = findTimeZoneCatalogEntry(requestedTimeZone);
    const suppliedCoordinates = raw.lat !== undefined || raw.lon !== undefined;
    const lat = parseCoordinateValue(raw.lat);
    const lon = parseCoordinateValue(raw.lon);
    const validCoordinates = isValidCoordinatePair(lat, lon);
    const generatedCoordinates = timeZoneCity || timeZoneCoordinates(requestedTimeZone);
    if (!validCoordinates && !generatedCoordinates) {
      return { city: null, errors: ["missing-timezone-coordinate"] };
    }

    const coordinates = validCoordinates ? { lat, lon } : generatedCoordinates;
    const names = timeZoneCity && timeZoneCity.names
      ? { ...timeZoneCity.names }
      : fallbackNames(requestedTimeZone);
    const englishName = name || names.en || timeZoneEnglishName(requestedTimeZone);
    return {
      city: {
        id: `custom-${slugify(englishName)}-${index + 1}`,
        lat: coordinates.lat,
        lon: coordinates.lon,
        timeZone: requestedTimeZone,
        names,
        custom: true
      },
      errors: suppliedCoordinates && !validCoordinates ? ["invalid-coordinates"] : []
    };
  }

  function parseCustomCityEntries(text) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed && Array.isArray(parsed.cities)) {
        return parsed.cities;
      }
      if (parsed && typeof parsed === "object") {
        return [parsed];
      }
      return null;
    } catch (error) {
      return parseJsonObjectSequence(text);
    }
  }

  function parseJsonObjectSequence(text) {
    const entries = [];
    let cursor = 0;

    while (cursor < text.length) {
      while (cursor < text.length && /[\s,]/.test(text[cursor])) {
        cursor += 1;
      }
      if (cursor >= text.length) {
        break;
      }
      if (text[cursor] !== "{") {
        return null;
      }

      const start = cursor;
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (; cursor < text.length; cursor += 1) {
        const character = text[cursor];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (character === "\\") {
            escaped = true;
          } else if (character === "\"") {
            inString = false;
          }
          continue;
        }
        if (character === "\"") {
          inString = true;
        } else if (character === "{") {
          depth += 1;
        } else if (character === "}") {
          depth -= 1;
          if (depth === 0) {
            cursor += 1;
            break;
          }
        }
      }
      if (depth !== 0 || inString) {
        return null;
      }
      try {
        entries.push(JSON.parse(text.slice(start, cursor)));
      } catch (error) {
        return null;
      }
    }

    return entries.length ? entries : null;
  }

  function parseCustomCities(input) {
    const text = typeof input === "string" ? input.trim() : "";
    if (!text) {
      return { cities: [], errors: [] };
    }

    const entries = parseCustomCityEntries(text);
    if (!entries) {
      return { cities: [], errors: [{ type: "invalid-json" }] };
    }

    const cities = [];
    const errors = [];
    entries.forEach((entry, index) => {
      const result = normalizeCustomCity(entry, index);
      if (result.city) {
        if (typeof entry.name === "string" && entry.name.trim()) {
          result.city.name = entry.name.trim();
        }
        cities.push(result.city);
      }
      result.errors.forEach((type) => errors.push({ type, index }));
    });

    return { cities, errors };
  }

  function detectLocalTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (error) {
      return "UTC";
    }
  }

  function resolveSelectedCities(options) {
    const config = options || {};
    const slots = Array.isArray(config.slots) ? config.slots.slice(0, 6) : [];
    const customCities = Array.isArray(config.customCities) ? config.customCities : [];
    const localTimeZone = config.localTimeZone || detectLocalTimeZone();
    const currentInput = config.currentCity && config.currentCity.current === true
      ? config.currentCity
      : { ...(config.currentCity || {}), localTimeZone };
    const current = resolveCurrentCity(currentInput).city;
    const selected = [{ ...current }];
    const appendUnique = (city) => {
      if (selected.some((existing) => isSameCity(existing, city))) {
        return;
      }
      selected.push({ ...city });
    };

    // 手動追加した都市をプリセットより先に配置し、ラベル避けの優先度を保ちます。
    customCities.forEach((city) => {
      const id = city.id || `custom-${slugify(city.name)}`;
      appendUnique({ ...city, id });
    });

    slots.forEach((slot) => {
      const id = String(slot || "empty");
      if (id === "empty" || id === "auto") {
        return;
      }
      const city = CITY_PRESETS[id];
      if (!city) {
        return;
      }
      appendUnique(city);
    });

    return selected;
  }

  function resolveRuntimeLanguage(setting) {
    if (SUPPORTED_LANGUAGES.includes(setting)) {
      return setting;
    }
    return "en";
  }

  function localeForLanguage(language) {
    return RUNTIME_LOCALES[language] || RUNTIME_LOCALES.en || "en-US";
  }

  function getCityName(city, language) {
    if (city.name) {
      return city.name;
    }
    if (city.names && city.names[language]) {
      return city.names[language];
    }
    return (city.names && city.names.en) || city.id;
  }

  function formatZonedTime(date, timeZone, use24Hour, showSeconds, locale) {
    const safeTimeZone = isValidTimeZone(timeZone) ? timeZone : "UTC";
    const safeLocale = locale || "en-US";
    const cacheKey = `${safeLocale}\u0000${safeTimeZone}\u0000${use24Hour ? "24" : "12"}\u0000${showSeconds ? "seconds" : "minutes"}`;
    let formatter = zonedTimeFormatterCache.get(cacheKey);
    if (!formatter) {
      // 毎秒更新されるため、同じ表示条件のIntlフォーマッターを再利用します。
      formatter = new Intl.DateTimeFormat(safeLocale, {
        timeZone: safeTimeZone,
        hour: "2-digit",
        minute: "2-digit",
        second: showSeconds ? "2-digit" : undefined,
        hour12: !use24Hour,
        hourCycle: use24Hour ? "h23" : undefined
      });
      zonedTimeFormatterCache.set(cacheKey, formatter);
    }
    return formatter.formatToParts(date).map((part) => {
      if (part.type !== "hour") {
        return part.value;
      }
      return part.value.replace(/^0(?=\d)/, "");
    }).join("");
  }

  function nextClockDelay(nowMs, showSeconds) {
    const interval = showSeconds ? 1000 : 60000;
    const timestamp = Math.max(0, Number(nowMs) || 0);
    return interval - timestamp % interval;
  }

  function nextTerminatorDelay(nowMs) {
    const timestamp = Math.max(0, Number(nowMs) || 0);
    return 5000 - timestamp % 5000;
  }

  function dayOfYear(date) {
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    return Math.floor((date.getTime() - start) / DAY_MS);
  }

  function solarPosition(date) {
    const day = dayOfYear(date);
    const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600 + date.getUTCMilliseconds() / 3600000;
    const declination = -23.44 * Math.cos(((360 / 365.24) * (day + 10)) * DEG_TO_RAD);
    const longitude = normalizeLongitude((12 - hours) * 15);
    return { lat: declination, lon: longitude };
  }

  function requireSolarPosition(sun) {
    if (!sun || typeof sun !== "object") {
      throw new TypeError("Solar position is required.");
    }
    const sunLat = Number(sun.lat);
    const sunLon = Number(sun.lon);
    if (!Number.isFinite(sunLat) || !Number.isFinite(sunLon)) {
      throw new TypeError("Solar position is required.");
    }
    return { lat: sunLat, lon: sunLon };
  }

  function solarCosineFromPosition(lat, lon, sun) {
    const position = requireSolarPosition(sun);
    const latRad = (Number(lat) || 0) * DEG_TO_RAD;
    const sunLatRad = position.lat * DEG_TO_RAD;
    const hourAngle = normalizeLongitude(
      (Number(lon) || 0) - position.lon
    ) * DEG_TO_RAD;
    return Math.sin(latRad) * Math.sin(sunLatRad) +
      Math.cos(latRad) * Math.cos(sunLatRad) * Math.cos(hourAngle);
  }

  function terminatorSolarFactors(grid, sun) {
    const position = requireSolarPosition(sun);
    const rows = Array.isArray(grid && grid.rows) ? grid.rows : [];
    const columns = Array.isArray(grid && grid.columns) ? grid.columns : [];
    const sunLatRad = position.lat * DEG_TO_RAD;
    const sunSinLat = Math.sin(sunLatRad);
    const sunCosLat = Math.cos(sunLatRad);

    // 緯度と経度ごとの三角関数を一度だけ計算し、各セルでは乗算と加算だけを行います。
    return {
      rows: rows.map((row) => {
        const latRad = (Number(row.lat) || 0) * DEG_TO_RAD;
        return {
          y: row.y,
          constant: Math.sin(latRad) * sunSinLat,
          amplitude: Math.cos(latRad) * sunCosLat
        };
      }),
      columns: columns.map((column) => ({
        x: column.x,
        hourCosine: Math.cos(
          normalizeLongitude((Number(column.lon) || 0) - position.lon) * DEG_TO_RAD
        )
      }))
    };
  }

  function solarCosine(lat, lon, date) {
    return solarCosineFromPosition(lat, lon, solarPosition(date));
  }

  function isDaylightAt(options) {
    return solarCosine(Number(options.lat) || 0, Number(options.lon) || 0, options.date || new Date()) > 0;
  }

  return {
    CITY_PRESETS,
    MERCATOR_NORTH_LIMIT,
    MERCATOR_SOUTH_LIMIT,
    canvasBackingSize,
    chooseLabelPlacement,
    clamp,
    coverMercatorRect,
    detectLocalTimeZone,
    formatZonedTime,
    getCityName,
    isDaylightAt,
    isValidTimeZone,
    labelViewportForMapView,
    labelMetrics,
    landSouthLimit,
    localeForLanguage,
    mapViewForViewport,
    nextClockDelay,
    nextTerminatorDelay,
    parseIso6709Coordinate,
    parseCustomCities,
    projectMercator,
    resolveCurrentCity,
    resolveRuntimeLanguage,
    resolveSelectedCities,
    solarCosine,
    solarCosineFromPosition,
    solarPosition,
    shouldBreakLandSegment,
    terminatorCellSize,
    terminatorFadeAlpha,
    terminatorGridCoordinates,
    terminatorSolarFactors,
    timeZoneCoordinates,
    unprojectMercator,
    viewportFillRect
  };
}));
