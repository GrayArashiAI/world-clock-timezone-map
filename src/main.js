(function initWorldClockWallpaper() {
  const core = window.WorldClockCore;
  const mapData = window.WorldMapData;

  const canvas = document.getElementById("mapCanvas");
  const labelLayer = document.getElementById("labelLayer");
  const ctx = canvas.getContext("2d", { alpha: true });

  const settings = {
    currentCityName: "",
    currentCityCoords: "",
    currentCityTimeZone: "",
    slots: ["los_angeles", "new_york", "london", "shanghai", "tokyo", "sydney"],
    customCities: "",
    layout: "atlantic",
    language: "en",
    labelSize: "medium",
    hourFormat: "24",
    showSeconds: true,
    showTerminator: true
  };

  const runtime = {
    cities: [],
    language: "en",
    locale: "en-US",
    dpr: 1,
    width: 0,
    height: 0,
    mapRect: { x: 0, y: 0, width: 0, height: 0 },
    lastCustomWarning: "",
    lastCurrentWarning: "",
    animationFrame: 0
  };

  window.wallpaperPropertyListener = {
    applyUserProperties(properties) {
      applyWallpaperProperties(properties || {});
      rebuildCities();
      scheduleRender();
    }
  };

  function applyWallpaperProperties(properties) {
    if (properties.currentcityname) {
      settings.currentCityName = String(properties.currentcityname.value || "");
    }
    if (properties.currentcitycoords) {
      settings.currentCityCoords = String(properties.currentcitycoords.value || "");
    }
    if (properties.currentcitytimezone) {
      settings.currentCityTimeZone = String(properties.currentcitytimezone.value || "");
    }

    for (let index = 1; index <= 6; index += 1) {
      const key = `cityslot${index}`;
      if (properties[key]) {
        settings.slots[index - 1] = String(properties[key].value || "empty");
      }
    }

    if (properties.customcities) {
      settings.customCities = String(properties.customcities.value || "");
    }
    if (properties.maplayout) {
      settings.layout = properties.maplayout.value === "pacific" ? "pacific" : "atlantic";
    }
    if (properties.language) {
      settings.language = String(properties.language.value || "en");
    }
    if (properties.labelsize) {
      settings.labelSize = normalizeLabelSize(properties.labelsize.value);
    }
    if (properties.hourformat) {
      settings.hourFormat = properties.hourformat.value === "12" ? "12" : "24";
    }
    if (properties.showseconds) {
      settings.showSeconds = Boolean(properties.showseconds.value);
    }
    if (properties.showterminator) {
      settings.showTerminator = Boolean(properties.showterminator.value);
    }

    runtime.language = core.resolveRuntimeLanguage(settings.language);
    runtime.locale = core.localeForLanguage(runtime.language);
    document.documentElement.dataset.labelSize = settings.labelSize;
  }

  function normalizeLabelSize(value) {
    return value === "medium" || value === "large" ? value : "small";
  }

  function rebuildCities() {
    const parsed = core.parseCustomCities(settings.customCities);
    const current = core.resolveCurrentCity({
      name: settings.currentCityName,
      coords: settings.currentCityCoords,
      timeZone: settings.currentCityTimeZone,
      localTimeZone: core.detectLocalTimeZone()
    });
    runtime.cities = core.resolveSelectedCities({
      currentCity: current.city,
      slots: settings.slots,
      customCities: parsed.cities,
      localTimeZone: core.detectLocalTimeZone()
    });

    if (current.errors.length) {
      const warningKey = JSON.stringify(current.errors);
      if (runtime.lastCurrentWarning !== warningKey) {
        runtime.lastCurrentWarning = warningKey;
        console.warn("現在地設定の一部を既定値で補正しました。", current.errors);
      }
    } else {
      runtime.lastCurrentWarning = "";
    }

    if (parsed.errors.length) {
      const warningKey = JSON.stringify(parsed.errors);
      if (runtime.lastCustomWarning !== warningKey) {
        runtime.lastCustomWarning = warningKey;
        // カスタム都市の問題は壁紙上に出さず、開発者コンソールだけに記録します。
        console.warn("カスタム都市設定の一部を無視しました。", parsed.errors);
      }
    }
  }

  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const width = Math.max(1, Math.floor(document.documentElement.clientWidth));
    const height = Math.max(1, Math.floor(document.documentElement.clientHeight));
    if (runtime.width === width && runtime.height === height && runtime.dpr === dpr) {
      return;
    }

    const backingWidth = core.canvasBackingSize(width, dpr);
    const backingHeight = core.canvasBackingSize(height, dpr);
    runtime.width = width;
    runtime.height = height;
    runtime.dpr = dpr;
    canvas.width = backingWidth.pixels;
    canvas.height = backingHeight.pixels;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(backingWidth.pixels / width, 0, 0, backingHeight.pixels / height, 0, 0);
  }

  function computeMapRect() {
    runtime.mapRect = core.coverMercatorRect(runtime.width, runtime.height);
  }

  function scheduleRender() {
    if (runtime.animationFrame) {
      return;
    }
    runtime.animationFrame = requestAnimationFrame(() => {
      runtime.animationFrame = 0;
      render();
    });
  }

  function render() {
    resizeCanvas();
    computeMapRect();

    const now = new Date();
    ctx.clearRect(0, 0, runtime.width, runtime.height);
    drawBackdrop();
    drawMapFrame();
    drawLand();
    if (settings.showTerminator) {
      drawTerminator(now);
    }
    renderCityLayer(now);
  }

  function drawBackdrop() {
    const gradient = ctx.createLinearGradient(0, 0, 0, runtime.height);
    gradient.addColorStop(0, "#05080d");
    gradient.addColorStop(0.56, "#07111c");
    gradient.addColorStop(1, "#03050a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, runtime.width, runtime.height);
  }

  function drawMapFrame() {
    const rect = core.viewportFillRect(runtime.width, runtime.height);
    ctx.save();
    ctx.fillStyle = "rgba(7, 16, 27, 0.58)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }

  function projectToScreen(lat, lon) {
    const projected = core.projectMercator({
      lat,
      lon,
      width: runtime.mapRect.width,
      height: runtime.mapRect.height,
      layout: settings.layout
    });
    return {
      x: runtime.mapRect.x + projected.x,
      y: runtime.mapRect.y + projected.y
    };
  }

  function forEachRing(geometry, callback) {
    if (!geometry) {
      return;
    }
    if (geometry.type === "Polygon") {
      geometry.coordinates.forEach(callback);
    }
    if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((polygon) => polygon.forEach(callback));
    }
  }

  function drawLand() {
    if (!mapData || !Array.isArray(mapData.features)) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = "rgba(132, 166, 181, 0.58)";
    ctx.lineWidth = 1.5;

    mapData.features.forEach((feature) => {
      forEachRing(feature.geometry, (ring) => {
        ctx.beginPath();
        let started = false;
        let previous = null;
        let visiblePoints = 0;

        ring.forEach((coord) => {
          const lon = coord[0];
          const lat = coord[1];
          if (lat < core.MERCATOR_SOUTH_LIMIT || lat > core.MERCATOR_NORTH_LIMIT) {
            started = false;
            previous = null;
            return;
          }
          const projected = projectToScreen(lat, lon);
          const current = { lon, lat, x: projected.x, y: projected.y };
          if (!started || core.shouldBreakLandSegment({ previous, current, width: runtime.mapRect.width })) {
            ctx.moveTo(projected.x, projected.y);
            started = true;
          } else {
            ctx.lineTo(projected.x, projected.y);
          }
          previous = current;
          visiblePoints += 1;
        });

        if (visiblePoints > 2) {
          ctx.stroke();
        }
      });
    });
    ctx.restore();
  }

  function drawTerminator(date) {
    const rect = runtime.mapRect;
    const cellSize = core.terminatorCellSize(runtime.width, runtime.height);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < runtime.height; y += cellSize) {
      for (let x = 0; x < runtime.width; x += cellSize) {
        const geo = core.unprojectMercator({
          x: x + cellSize / 2 - rect.x,
          y: y + cellSize / 2 - rect.y,
          width: rect.width,
          layout: settings.layout
        });
        const cosine = core.solarCosine(geo.lat, geo.lon, date);
        if (cosine >= 0.1) {
          continue;
        }

        if (cosine < 0) {
          const alpha = cosine < -0.16 ? 0.44 : core.clamp(0.2 + Math.abs(cosine) / 0.16 * 0.24, 0.2, 0.44);
          ctx.fillStyle = `rgba(0, 3, 10, ${alpha})`;
        } else {
          const alpha = core.clamp((0.1 - cosine) / 0.1 * 0.11, 0.02, 0.11);
          ctx.fillStyle = `rgba(251, 191, 102, ${alpha})`;
        }
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
    ctx.restore();
  }

  function markerAvoidanceBox(point) {
    const radius = runtime.width < 760 ? 12 : 14;
    return {
      left: point.x - radius,
      right: point.x + radius,
      top: point.y - radius,
      bottom: point.y + radius
    };
  }

  function renderCityLayer(date) {
    labelLayer.innerHTML = "";
    const takenBoxes = [];
    let renderedLabels = 0;
    const visibleCities = [];

    runtime.cities.forEach((city) => {
      if (city.lat < core.MERCATOR_SOUTH_LIMIT || city.lat > core.MERCATOR_NORTH_LIMIT) {
        return;
      }
      const point = projectToScreen(city.lat, city.lon);
      if (point.x < 0 || point.x > runtime.width || point.y < 0 || point.y > runtime.height) {
        return;
      }
      visibleCities.push({ city, point });
    });

    const markerBoxes = visibleCities.map((entry) => markerAvoidanceBox(entry.point));

    visibleCities.forEach(({ city, point }) => {
      const daylight = core.isDaylightAt({ lat: city.lat, lon: city.lon, date });
      const time = core.formatZonedTime(date, city.timeZone, settings.hourFormat === "24", settings.showSeconds, runtime.locale);
      const metrics = core.labelMetrics(settings.labelSize, runtime.width, runtime.height);
      const placement = renderedLabels < 80 ? core.chooseLabelPlacement({
        screenX: point.x,
        screenY: point.y,
        viewport: { x: 0, y: 0, width: runtime.width, height: runtime.height },
        estimatedWidth: metrics.estimatedWidth,
        estimatedHeight: metrics.estimatedHeight,
        takenBoxes,
        blockedBoxes: markerBoxes
      }) : null;

      labelLayer.appendChild(createCityMarker(point, daylight, city));
      if (placement) {
        renderedLabels += 1;
        labelLayer.appendChild(createCityLabel(city, time, daylight, placement));
      }
    });
  }

  function createCityLabel(city, timeText, daylight, placement) {
    const label = document.createElement("div");
    label.className = `city-label ${daylight ? "is-day" : "is-night"} place-${placement.placement}`;
    label.style.left = `${placement.x}px`;
    label.style.top = `${placement.y}px`;

    const cityName = document.createElement("div");
    cityName.className = "city-name";
    const name = document.createElement("span");
    name.textContent = core.getCityName(city, runtime.language);
    const icon = document.createElement("span");
    icon.className = "city-icon";
    icon.textContent = daylight ? "☀" : "☾";
    cityName.append(name, icon);

    const time = document.createElement("div");
    time.className = "city-time";
    time.textContent = timeText;

    label.append(cityName, time);
    return label;
  }

  function createCityMarker(point, daylight, city) {
    const marker = document.createElement("div");
    marker.className = `city-marker ${daylight ? "is-day" : "is-night"}${city.current ? " is-current" : ""}`;
    marker.style.left = `${point.x}px`;
    marker.style.top = `${point.y}px`;
    return marker;
  }

  function boot() {
    runtime.language = core.resolveRuntimeLanguage(settings.language);
    runtime.locale = core.localeForLanguage(runtime.language);
    document.documentElement.dataset.labelSize = settings.labelSize;
    rebuildCities();
    window.addEventListener("resize", scheduleRender, { passive: true });
    setInterval(scheduleRender, 1000);
    scheduleRender();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}());
