(function initWorldClockWallpaper() {
  const core = window.WorldClockCore;
  const mapData = window.WorldMapData;

  const canvas = document.getElementById("mapCanvas");
  const labelLayer = document.getElementById("labelLayer");
  const ctx = canvas.getContext("2d", { alpha: true });
  const staticCanvas = document.createElement("canvas");
  const staticCtx = staticCanvas.getContext("2d", { alpha: true });
  const terminatorCanvas = document.createElement("canvas");
  const terminatorCtx = terminatorCanvas.getContext("2d", { alpha: true });

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
    cityViews: [],
    language: "en",
    locale: "en-US",
    dpr: 1,
    width: 0,
    height: 0,
    mapRect: { x: 0, y: 0, width: 0, height: 0 },
    lastCustomWarning: "",
    lastCurrentWarning: "",
    terminatorGridKey: "",
    terminatorGrid: null,
    animationFrame: 0,
    clockTimer: 0,
    terminatorTimer: 0,
    staticLayerDirty: true,
    terminatorLayerDirty: true,
    cityLayerDirty: true,
    sceneDirty: true
  };

  window.wallpaperPropertyListener = {
    applyUserProperties(properties) {
      applyWallpaperProperties(properties || {});
      rebuildCities();
      invalidateAllLayers();
      scheduleClock();
      scheduleTerminator();
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
    const localTimeZone = core.detectLocalTimeZone();
    const parsed = core.parseCustomCities(settings.customCities);
    const current = core.resolveCurrentCity({
      name: settings.currentCityName,
      coords: settings.currentCityCoords,
      timeZone: settings.currentCityTimeZone,
      localTimeZone
    });
    runtime.cities = core.resolveSelectedCities({
      currentCity: current.city,
      slots: settings.slots,
      customCities: parsed.cities,
      localTimeZone
    });
    runtime.cityLayerDirty = true;

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
    } else {
      runtime.lastCustomWarning = "";
    }
  }

  function invalidateAllLayers() {
    runtime.staticLayerDirty = true;
    runtime.terminatorLayerDirty = true;
    runtime.cityLayerDirty = true;
    runtime.sceneDirty = true;
  }

  function configureCanvas(targetCanvas, targetContext, pixelWidth, pixelHeight, scaleX, scaleY) {
    targetCanvas.width = pixelWidth;
    targetCanvas.height = pixelHeight;
    targetContext.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  }

  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const width = Math.max(1, Math.floor(document.documentElement.clientWidth));
    const height = Math.max(1, Math.floor(document.documentElement.clientHeight));
    if (runtime.width === width && runtime.height === height && runtime.dpr === dpr) {
      return false;
    }

    const backingWidth = core.canvasBackingSize(width, dpr);
    const backingHeight = core.canvasBackingSize(height, dpr);
    const scaleX = backingWidth.pixels / width;
    const scaleY = backingHeight.pixels / height;
    runtime.width = width;
    runtime.height = height;
    runtime.dpr = dpr;
    runtime.mapRect = core.coverMercatorRect(width, height);

    configureCanvas(canvas, ctx, backingWidth.pixels, backingHeight.pixels, scaleX, scaleY);
    configureCanvas(staticCanvas, staticCtx, backingWidth.pixels, backingHeight.pixels, scaleX, scaleY);
    configureCanvas(terminatorCanvas, terminatorCtx, backingWidth.pixels, backingHeight.pixels, scaleX, scaleY);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    invalidateAllLayers();
    return true;
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

  function scheduleClock() {
    if (runtime.clockTimer) {
      clearTimeout(runtime.clockTimer);
      runtime.clockTimer = 0;
    }
    if (document.hidden) {
      return;
    }

    const delay = core.nextClockDelay(Date.now(), settings.showSeconds);
    runtime.clockTimer = setTimeout(() => {
      runtime.clockTimer = 0;
      scheduleRender();
      scheduleClock();
    }, delay);
  }

  function scheduleTerminator() {
    if (runtime.terminatorTimer) {
      clearTimeout(runtime.terminatorTimer);
      runtime.terminatorTimer = 0;
    }
    if (document.hidden || !settings.showTerminator) {
      return;
    }

    const delay = core.nextTerminatorDelay(Date.now());
    runtime.terminatorTimer = setTimeout(() => {
      runtime.terminatorTimer = 0;
      runtime.terminatorLayerDirty = true;
      scheduleRender();
      scheduleTerminator();
    }, delay);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      if (runtime.clockTimer) {
        clearTimeout(runtime.clockTimer);
        runtime.clockTimer = 0;
      }
      if (runtime.terminatorTimer) {
        clearTimeout(runtime.terminatorTimer);
        runtime.terminatorTimer = 0;
      }
      return;
    }

    runtime.terminatorLayerDirty = true;
    scheduleRender();
    scheduleClock();
    scheduleTerminator();
  }

  function render() {
    resizeCanvas();
    const now = new Date();
    const sun = core.solarPosition(now);

    if (runtime.staticLayerDirty) {
      drawStaticLayer();
      runtime.staticLayerDirty = false;
      runtime.sceneDirty = true;
    }
    if (runtime.terminatorLayerDirty) {
      drawTerminatorLayer(sun);
      runtime.terminatorLayerDirty = false;
      runtime.sceneDirty = true;
    }
    if (runtime.sceneDirty) {
      composeScene();
      runtime.sceneDirty = false;
    }

    if (runtime.cityLayerDirty) {
      rebuildCityLayer(now, sun);
      runtime.cityLayerDirty = false;
    } else {
      updateCityLayer(now, sun);
    }
  }

  function drawStaticLayer() {
    staticCtx.clearRect(0, 0, runtime.width, runtime.height);
    drawBackdrop(staticCtx);
    drawMapFrame(staticCtx);
    drawLand(staticCtx);
  }

  function drawBackdrop(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, runtime.height);
    gradient.addColorStop(0, "#05080d");
    gradient.addColorStop(0.56, "#07111c");
    gradient.addColorStop(1, "#03050a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, runtime.width, runtime.height);
  }

  function drawMapFrame(ctx) {
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

  function drawLand(ctx) {
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

  function getTerminatorGrid(cellSize) {
    const key = [
      runtime.width,
      runtime.height,
      runtime.mapRect.x,
      runtime.mapRect.y,
      runtime.mapRect.width,
      runtime.mapRect.height,
      settings.layout,
      cellSize
    ].join(":");
    if (runtime.terminatorGridKey !== key) {
      runtime.terminatorGridKey = key;
      runtime.terminatorGrid = core.terminatorGridCoordinates({
        width: runtime.width,
        height: runtime.height,
        rect: runtime.mapRect,
        layout: settings.layout,
        cellSize
      });
    }
    return runtime.terminatorGrid;
  }

  function drawTerminatorLayer(sun) {
    terminatorCtx.clearRect(0, 0, runtime.width, runtime.height);
    if (!settings.showTerminator) {
      return;
    }

    const cellSize = core.terminatorCellSize(runtime.width, runtime.height);
    const grid = getTerminatorGrid(cellSize);

    terminatorCtx.save();
    terminatorCtx.imageSmoothingEnabled = false;
    for (const row of grid.rows) {
      for (const column of grid.columns) {
        const cosine = core.solarCosineFromPosition(row.lat, column.lon, sun);
        if (cosine >= 0.1) {
          continue;
        }

        if (cosine < 0) {
          const alpha = cosine < -0.16 ? 0.44 : core.clamp(0.2 + Math.abs(cosine) / 0.16 * 0.24, 0.2, 0.44);
          terminatorCtx.fillStyle = `rgba(0, 3, 10, ${alpha})`;
        } else {
          const alpha = core.clamp((0.1 - cosine) / 0.1 * 0.11, 0.02, 0.11);
          terminatorCtx.fillStyle = `rgba(251, 191, 102, ${alpha})`;
        }
        terminatorCtx.fillRect(column.x, row.y, cellSize, cellSize);
      }
    }
    terminatorCtx.restore();
  }

  function composeScene() {
    ctx.clearRect(0, 0, runtime.width, runtime.height);
    ctx.drawImage(
      staticCanvas,
      0,
      0,
      staticCanvas.width,
      staticCanvas.height,
      0,
      0,
      runtime.width,
      runtime.height
    );
    if (settings.showTerminator) {
      ctx.drawImage(
        terminatorCanvas,
        0,
        0,
        terminatorCanvas.width,
        terminatorCanvas.height,
        0,
        0,
        runtime.width,
        runtime.height
      );
    }
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

  function rebuildCityLayer(date, sun) {
    const fragment = document.createDocumentFragment();
    const takenBoxes = [];
    const visibleCities = [];
    const metrics = core.labelMetrics(settings.labelSize, runtime.width, runtime.height);
    let renderedLabels = 0;
    runtime.cityViews = [];

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
      const placement = renderedLabels < 80 ? core.chooseLabelPlacement({
        screenX: point.x,
        screenY: point.y,
        viewport: { x: 0, y: 0, width: runtime.width, height: runtime.height },
        estimatedWidth: metrics.estimatedWidth,
        estimatedHeight: metrics.estimatedHeight,
        takenBoxes,
        blockedBoxes: markerBoxes
      }) : null;
      const marker = createCityMarker(point);
      const view = {
        city,
        marker,
        label: null,
        icon: null,
        time: null
      };

      fragment.appendChild(marker);
      if (placement) {
        const labelView = createCityLabel(city, placement);
        view.label = labelView.label;
        view.icon = labelView.icon;
        view.time = labelView.time;
        fragment.appendChild(labelView.label);
        renderedLabels += 1;
      }
      updateCityView(view, date, sun);
      runtime.cityViews.push(view);
    });

    labelLayer.replaceChildren(fragment);
  }

  function updateCityLayer(date, sun) {
    runtime.cityViews.forEach((view) => updateCityView(view, date, sun));
  }

  function updateCityView(view, date, sun) {
    const daylight = core.solarCosineFromPosition(view.city.lat, view.city.lon, sun) > 0;
    view.marker.className = `city-marker ${daylight ? "is-day" : "is-night"}${view.city.current ? " is-current" : ""}`;

    if (!view.label) {
      return;
    }
    view.label.className = `city-label ${daylight ? "is-day" : "is-night"} ${view.label.dataset.placement}`;
    view.icon.textContent = daylight ? "☀" : "☾";
    view.time.textContent = core.formatZonedTime(
      date,
      view.city.timeZone,
      settings.hourFormat === "24",
      settings.showSeconds,
      runtime.locale
    );
  }

  function createCityLabel(city, placement) {
    const label = document.createElement("div");
    label.dataset.placement = `place-${placement.placement}`;
    label.style.left = `${placement.x}px`;
    label.style.top = `${placement.y}px`;

    const cityName = document.createElement("div");
    cityName.className = "city-name";
    const name = document.createElement("span");
    name.textContent = core.getCityName(city, runtime.language);
    const icon = document.createElement("span");
    icon.className = "city-icon";
    cityName.append(name, icon);

    const time = document.createElement("div");
    time.className = "city-time";

    label.append(cityName, time);
    return { label, icon, time };
  }

  function createCityMarker(point) {
    const marker = document.createElement("div");
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
    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleClock();
    scheduleTerminator();
    scheduleRender();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}());
