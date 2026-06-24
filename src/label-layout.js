(function attachWorldClockLabelLayout(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.WorldClockLabelLayout = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createWorldClockLabelLayout() {
  const DEFAULT_WEIGHTS = Object.freeze({
    overlap: 1800000,
    overlapBase: 24000,
    overlapLinear: 18000,
    marker: 1400000,
    markerNear: 180000,
    connectorThroughCard: 240000,
    coastDirection: 30000,
    coast: 3000,
    spacingNear: 30000,
    spacing: 18000,
    regionalSpacing: 6500,
    connectorCrossing: 2200,
    distance: 4.5,
    distanceFar: 24,
    land: 180,
    directionTier: 18,
    freeAngle: 900
  });
  const DEFAULT_MARGIN = 4;
  const DEFAULT_CONNECTOR_THRESHOLD_RATIO = 0.85;
  const MIN_CONNECTOR_THRESHOLD = 28;
  const MAX_CONNECTOR_THRESHOLD = 54;
  const POINT_EPSILON = 0.000001;
  const GEOMETRY_EPSILON = 0.001;
  const COST_EPSILON = 0.000001;
  const ANNEAL_INITIAL_TEMPERATURE = 24000;
  const ANNEAL_FINAL_RATIO = 0.001;
  const FREE_DIRECTIONS = Object.freeze([
    -20, 20, -35, 35, -55, 55, -70, 70,
    -110, 110, -125, 125, -145, 145, -160, 160
  ].map((degrees) => {
    const radians = degrees * Math.PI / 180;
    return Object.freeze({
      x: Math.cos(radians),
      y: Math.sin(radians)
    });
  }));

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function boxFromCenter(centerX, centerY, width, height) {
    return {
      left: centerX - width / 2,
      right: centerX + width / 2,
      top: centerY - height / 2,
      bottom: centerY + height / 2
    };
  }

  function boxArea(box) {
    return Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
  }

  function overlapArea(a, b) {
    return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  }

  function pointInsideBox(point, box, padding) {
    const safePadding = Number(padding) || 0;
    return point.x >= box.left - safePadding &&
      point.x <= box.right + safePadding &&
      point.y >= box.top - safePadding &&
      point.y <= box.bottom + safePadding;
  }

  function distancePointToBox(point, box) {
    const horizontal = Math.max(box.left - point.x, 0, point.x - box.right);
    const vertical = Math.max(box.top - point.y, 0, point.y - box.bottom);
    return Math.hypot(horizontal, vertical);
  }

  function nearestPointOnBox(point, box) {
    const x = clamp(point.x, box.left, box.right);
    const y = clamp(point.y, box.top, box.bottom);
    if (!pointInsideBox(point, box, 0)) {
      return { x, y };
    }

    const distances = [
      { distance: Math.abs(point.x - box.left), point: { x: box.left, y } },
      { distance: Math.abs(point.x - box.right), point: { x: box.right, y } },
      { distance: Math.abs(point.y - box.top), point: { x, y: box.top } },
      { distance: Math.abs(point.y - box.bottom), point: { x, y: box.bottom } }
    ];
    distances.sort((a, b) => a.distance - b.distance);
    return distances[0].point;
  }

  function pointsEqual(a, b) {
    return Math.abs(a.x - b.x) < POINT_EPSILON &&
      Math.abs(a.y - b.y) < POINT_EPSILON;
  }

  function orientation(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function segmentsIntersect(first, second) {
    if (!first || !second) {
      return false;
    }
    if (
      pointsEqual(first.from, second.from) ||
      pointsEqual(first.from, second.to) ||
      pointsEqual(first.to, second.from) ||
      pointsEqual(first.to, second.to)
    ) {
      return false;
    }

    const firstStart = orientation(first.from, first.to, second.from);
    const firstEnd = orientation(first.from, first.to, second.to);
    const secondStart = orientation(second.from, second.to, first.from);
    const secondEnd = orientation(second.from, second.to, first.to);
    return ((firstStart > 0 && firstEnd < 0) || (firstStart < 0 && firstEnd > 0)) &&
      ((secondStart > 0 && secondEnd < 0) || (secondStart < 0 && secondEnd > 0));
  }

  function unwrapProjectedRing(points, worldWidth) {
    const width = Math.max(1, Number(worldWidth) || 1);
    const source = Array.isArray(points) ? points : [];
    if (source.length === 0) {
      return [];
    }
    const result = [{ x: Number(source[0].x) || 0, y: Number(source[0].y) || 0 }];
    for (let index = 1; index < source.length; index += 1) {
      const previous = result[index - 1];
      let x = Number(source[index].x) || 0;
      while (x - previous.x > width / 2) {
        x -= width;
      }
      while (x - previous.x < -width / 2) {
        x += width;
      }
      result.push({ x, y: Number(source[index].y) || 0 });
    }
    return result;
  }

  function lineIntersectsBox(line, box) {
    if (!line) {
      return false;
    }
    if (pointInsideBox(line.from, box, 0) || pointInsideBox(line.to, box, 0)) {
      return true;
    }
    const edges = [
      { from: { x: box.left, y: box.top }, to: { x: box.right, y: box.top } },
      { from: { x: box.right, y: box.top }, to: { x: box.right, y: box.bottom } },
      { from: { x: box.right, y: box.bottom }, to: { x: box.left, y: box.bottom } },
      { from: { x: box.left, y: box.bottom }, to: { x: box.left, y: box.top } }
    ];
    return edges.some((edge) => segmentsIntersect(line, edge));
  }

  function buildIntegral(mask, columns, rows) {
    const stride = columns + 1;
    const integral = new Float64Array((columns + 1) * (rows + 1));
    for (let row = 0; row < rows; row += 1) {
      let rowSum = 0;
      for (let column = 0; column < columns; column += 1) {
        const value = Number(mask[row * columns + column]) || 0;
        rowSum += value > 1 ? value / 255 : value;
        integral[(row + 1) * stride + column + 1] =
          integral[row * stride + column + 1] + rowSum;
      }
    }
    return integral;
  }

  function integralSum(integral, columns, left, top, right, bottom) {
    const stride = columns + 1;
    return integral[bottom * stride + right] -
      integral[top * stride + right] -
      integral[bottom * stride + left] +
      integral[top * stride + left];
  }

  // 地形マスクを積分画像と局所海岸プロファイルに変換します。
  function createAvoidanceField(options) {
    const source = options || {};
    const width = Math.max(1, finiteNumber(source.width, 1));
    const height = Math.max(1, finiteNumber(source.height, 1));
    const cellSize = Math.max(1, Math.floor(finiteNumber(source.cellSize, 4)));
    const columns = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    const expectedLength = columns * rows;
    const landMask = source.landMask && source.landMask.length === expectedLength
      ? source.landMask
      : new Uint8Array(expectedLength);
    const coastMask = source.coastMask && source.coastMask.length === expectedLength
      ? source.coastMask
      : new Uint8Array(expectedLength);
    const coastGeometryMask = source.coastGeometryMask &&
      source.coastGeometryMask.length === expectedLength
      ? source.coastGeometryMask
      : coastMask;
    const mapWorldWidth = Math.max(cellSize, finiteNumber(source.mapWorldWidth, width));
    const coastGeometryRadius = Math.max(0, finiteNumber(source.coastGeometryRadius, 0));
    const landIntegral = buildIntegral(landMask, columns, rows);
    const coastIntegral = buildIntegral(coastMask, columns, rows);

    return {
      width,
      height,
      cellSize,
      columns,
      rows,
      mapWorldWidth,
      coastGeometryRadius,
      query(box) {
        const left = clamp(Math.floor((Number(box.left) || 0) / cellSize), 0, columns);
        const top = clamp(Math.floor((Number(box.top) || 0) / cellSize), 0, rows);
        const right = clamp(Math.ceil((Number(box.right) || 0) / cellSize), left, columns);
        const bottom = clamp(Math.ceil((Number(box.bottom) || 0) / cellSize), top, rows);
        const cells = Math.max(1, (right - left) * (bottom - top));
        return {
          land: integralSum(landIntegral, columns, left, top, right, bottom) / cells,
          coast: integralSum(coastIntegral, columns, left, top, right, bottom) / cells
        };
      },
      coastDistance(point, maximumDistance) {
        const x = Number(point && point.x) || 0;
        const y = Number(point && point.y) || 0;
        const limit = Math.max(0, Number(maximumDistance) || 0);
        const centerColumn = clamp(Math.floor(x / cellSize), 0, columns - 1);
        const centerRow = clamp(Math.floor(y / cellSize), 0, rows - 1);
        const radius = Math.ceil(limit / cellSize) + 1;
        const left = Math.max(0, centerColumn - radius);
        const right = Math.min(columns - 1, centerColumn + radius);
        const top = Math.max(0, centerRow - radius);
        const bottom = Math.min(rows - 1, centerRow + radius);
        let nearest = Infinity;
        for (let row = top; row <= bottom; row += 1) {
          for (let column = left; column <= right; column += 1) {
            const value = Number(coastGeometryMask[row * columns + column]) || 0;
            if (value <= 0) {
              continue;
            }
            const cellLeft = column * cellSize;
            const cellRight = Math.min(width, cellLeft + cellSize);
            const cellTop = row * cellSize;
            const cellBottom = Math.min(height, cellTop + cellSize);
            const horizontal = Math.max(cellLeft - x, 0, x - cellRight);
            const vertical = Math.max(cellTop - y, 0, y - cellBottom);
            nearest = Math.min(nearest, Math.hypot(horizontal, vertical));
          }
        }
        return nearest <= limit ? nearest : Infinity;
      },
      coastCenterlineDistance(point, maximumDistance) {
        const distance = this.coastDistance(point, maximumDistance);
        if (!Number.isFinite(distance) || distance <= 0) {
          return distance;
        }
        return distance + coastGeometryRadius + cellSize / 2;
      },
      localCoastProfile(point, maximumDistance) {
        const x = Number(point && point.x) || 0;
        const y = Number(point && point.y) || 0;
        const limit = Math.max(cellSize, Number(maximumDistance) || 0);
        const centerColumn = clamp(Math.floor(x / cellSize), 0, columns - 1);
        const centerRow = clamp(Math.floor(y / cellSize), 0, rows - 1);
        const radius = Math.ceil(limit / cellSize) + 1;
        const left = Math.max(0, centerColumn - radius);
        const right = Math.min(columns - 1, centerColumn + radius);
        const top = Math.max(0, centerRow - radius);
        const bottom = Math.min(rows - 1, centerRow + radius);
        const samples = [];
        let totalWeight = 0;

        for (let row = top; row <= bottom; row += 1) {
          for (let column = left; column <= right; column += 1) {
            const value = Number(coastGeometryMask[row * columns + column]) || 0;
            if (value <= 0) {
              continue;
            }
            const sampleX = Math.min(width, (column + 0.5) * cellSize);
            const sampleY = Math.min(height, (row + 0.5) * cellSize);
            const dx = sampleX - x;
            const dy = sampleY - y;
            const distance = Math.hypot(dx, dy);
            if (distance > limit || distance < cellSize * 0.5) {
              continue;
            }
            const maskWeight = value > 1 ? value / 255 : value;
            const radialWeight = Math.pow(clamp(distance / limit, 0, 1), 1.5);
            const weight = maskWeight * radialWeight;
            samples.push({
              x: dx / distance,
              y: dy / distance,
              weight
            });
            totalWeight += weight;
          }
        }

        if (samples.length < 4 || totalWeight <= 0) {
          return null;
        }

        return {
          score(direction) {
            let score = 0;
            samples.forEach((sample) => {
              const alignment = sample.x * direction.x + sample.y * direction.y;
              score += alignment * alignment * sample.weight;
            });
            return score / totalWeight;
          }
        };
      }
    };
  }

  function emptyAvoidanceField() {
    return {
      query() {
        return { land: 0, coast: 0 };
      },
      coastDistance() {
        return Infinity;
      },
      coastCenterlineDistance() {
        return Infinity;
      },
      localCoastProfile() {
        return null;
      }
    };
  }

  function hashSeed(value) {
    const text = String(value || "world-clock-label-layout");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createRandom(seed) {
    let state = seed >>> 0;
    return function random() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffledIndices(length, random) {
    const result = Array.from({ length }, (_, index) => index);
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      const temporary = result[index];
      result[index] = result[target];
      result[target] = temporary;
    }
    return result;
  }

  function candidateBounds(candidate, padding) {
    const amount = Number(padding) || 0;
    let left = candidate.box.left;
    let right = candidate.box.right;
    let top = candidate.box.top;
    let bottom = candidate.box.bottom;
    if (candidate.connector) {
      left = Math.min(left, candidate.connector.from.x, candidate.connector.to.x);
      right = Math.max(right, candidate.connector.from.x, candidate.connector.to.x);
      top = Math.min(top, candidate.connector.from.y, candidate.connector.to.y);
      bottom = Math.max(bottom, candidate.connector.from.y, candidate.connector.to.y);
    }
    return {
      left: left - amount,
      right: right + amount,
      top: top - amount,
      bottom: bottom + amount
    };
  }

  function createSpatialIndex(cellSize) {
    const size = Math.max(32, Number(cellSize) || 160);
    const buckets = new Map();
    const keysByIndex = new Map();

    function keysForBounds(bounds) {
      const keys = [];
      const left = Math.floor(bounds.left / size);
      const right = Math.floor(bounds.right / size);
      const top = Math.floor(bounds.top / size);
      const bottom = Math.floor(bounds.bottom / size);
      for (let row = top; row <= bottom; row += 1) {
        for (let column = left; column <= right; column += 1) {
          keys.push(`${column}:${row}`);
        }
      }
      return keys;
    }

    return {
      add(index, candidate, padding) {
        const keys = keysForBounds(candidateBounds(candidate, padding));
        keysByIndex.set(index, keys);
        keys.forEach((key) => {
          if (!buckets.has(key)) {
            buckets.set(key, new Set());
          }
          buckets.get(key).add(index);
        });
      },
      remove(index) {
        const keys = keysByIndex.get(index) || [];
        keys.forEach((key) => {
          const bucket = buckets.get(key);
          if (!bucket) {
            return;
          }
          bucket.delete(index);
          if (bucket.size === 0) {
            buckets.delete(key);
          }
        });
        keysByIndex.delete(index);
      },
      query(candidate, padding) {
        const result = new Set();
        keysForBounds(candidateBounds(candidate, padding)).forEach((key) => {
          const bucket = buckets.get(key);
          if (bucket) {
            bucket.forEach((index) => result.add(index));
          }
        });
        return result;
      }
    };
  }

  function normalizedViewport(viewport) {
    const source = viewport || {};
    return {
      x: finiteNumber(source.x, 0),
      y: finiteNumber(source.y, 0),
      width: Math.max(1, finiteNumber(source.width, 1)),
      height: Math.max(1, finiteNumber(source.height, 1))
    };
  }

  function compareIds(first, second) {
    return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
  }

  function normalizeInputs(options, margin) {
    const viewport = normalizedViewport(options && options.viewport);
    const markers = Array.isArray(options && options.markers) ? options.markers : [];
    const markerById = new Map(markers.map((marker) => [
      String(marker.id),
      {
        id: String(marker.id),
        x: finiteNumber(marker.x, 0),
        y: finiteNumber(marker.y, 0)
      }
    ]));
    const availableWidth = Math.max(1, viewport.width - margin * 2);
    const availableHeight = Math.max(1, viewport.height - margin * 2);
    const labels = (Array.isArray(options && options.labels) ? options.labels : [])
      .map((label) => {
        const id = String(label.id);
        const marker = markerById.get(String(label.markerId || id));
        if (!marker) {
          return null;
        }
        return {
          id,
          marker,
          width: Math.min(availableWidth, Math.max(1, finiteNumber(label.width, 1))),
          height: Math.min(availableHeight, Math.max(1, finiteNumber(label.height, 1))),
          priority: Math.max(0, finiteNumber(label.priority, 0))
        };
      })
      .filter(Boolean)
      .sort(compareIds);
    return {
      labels,
      markers: Array.from(markerById.values()).sort(compareIds),
      viewport
    };
  }

  function uniqueNumbers(values) {
    return Array.from(new Set(values.map((value) => Math.round(value * 1000) / 1000)));
  }

  function compareCandidates(a, b) {
    return a.unaryCost - b.unaryCost || a.rank - b.rank;
  }

  function createConnector(marker, box, threshold) {
    const distance = distancePointToBox(marker, box);
    if (distance <= threshold) {
      return null;
    }
    return {
      from: { x: marker.x, y: marker.y },
      to: nearestPointOnBox(marker, box)
    };
  }

  function connectorThresholdForLabel(label, settings) {
    if (settings.connectorThreshold !== null) {
      return settings.connectorThreshold;
    }
    return clamp(
      label.height * settings.connectorThresholdRatio,
      MIN_CONNECTOR_THRESHOLD,
      MAX_CONNECTOR_THRESHOLD
    );
  }

  function coastlineIdentityWeight(distance, options) {
    const source = options || {};
    const start = Math.max(0, finiteNumber(source.start, 3));
    const end = Math.max(start + 1, finiteNumber(source.end, 12));
    const numericDistance = Number(distance);
    const normalized = Math.max(0, Number.isNaN(numericDistance) ? 0 : numericDistance);
    if (normalized <= start) {
      return 1;
    }
    if (normalized >= end) {
      return 0;
    }
    const progress = (normalized - start) / (end - start);
    const eased = progress * progress * (3 - 2 * progress);
    return 1 - eased;
  }

  // 各ラベルの候補位置と単体コストを確定します。
  function markerPenalty(label, box, markers, settings, weights) {
    let cost = 0;
    markers.forEach((marker) => {
      if (marker.id === label.marker.id) {
        return;
      }
      if (pointInsideBox(marker, box, 0)) {
        cost += weights.marker * (1 + label.priority * 0.25);
        return;
      }
      const distance = distancePointToBox(marker, box);
      if (distance < settings.markerClearance) {
        const shortage = 1 - distance / settings.markerClearance;
        cost += weights.markerNear * shortage * shortage;
      }
    });
    return cost;
  }

  function standardCandidateOffsets(label, gap) {
    const halfWidth = label.width / 2;
    const halfHeight = label.height / 2;
    const horizontal = halfWidth + gap;
    const vertical = halfHeight + gap;
    const cornerGap = gap / Math.sqrt(2);
    const cornerHorizontal = halfWidth + cornerGap;
    const cornerVertical = halfHeight + cornerGap;
    return [
      { dx: horizontal, dy: 0, directionTier: 0 },
      { dx: -horizontal, dy: 0, directionTier: 0 },
      { dx: 0, dy: -vertical, directionTier: 3 },
      { dx: 0, dy: vertical, directionTier: 2 },
      { dx: cornerHorizontal, dy: -cornerVertical, directionTier: 1 },
      { dx: cornerHorizontal, dy: cornerVertical, directionTier: 1 },
      { dx: -cornerHorizontal, dy: -cornerVertical, directionTier: 1 },
      { dx: -cornerHorizontal, dy: cornerVertical, directionTier: 1 }
    ].map((offset) => {
      const length = Math.hypot(offset.dx, offset.dy);
      return {
        ...offset,
        direction: {
          x: offset.dx / length,
          y: offset.dy / length
        },
        standard: true
      };
    });
  }

  function centerDistanceForEdgeGap(label, direction, gap) {
    const halfWidth = label.width / 2;
    const halfHeight = label.height / 2;
    const horizontal = Math.abs(direction.x);
    const vertical = Math.abs(direction.y);
    const horizontalEntry = halfWidth / horizontal;
    const verticalEntry = halfHeight / vertical;

    if (horizontalEntry < verticalEntry) {
      const horizontalOnly = (halfWidth + gap) / horizontal;
      if (horizontalOnly <= verticalEntry) {
        return horizontalOnly;
      }
    } else {
      const verticalOnly = (halfHeight + gap) / vertical;
      if (verticalOnly <= horizontalEntry) {
        return verticalOnly;
      }
    }

    const projection = horizontal * halfWidth + vertical * halfHeight;
    const discriminant = Math.max(
      0,
      projection * projection -
        (halfWidth * halfWidth + halfHeight * halfHeight - gap * gap)
    );
    return projection + Math.sqrt(discriminant);
  }

  function freeCandidateOffsets(label, gap) {
    return FREE_DIRECTIONS.map((direction) => {
      const distanceToCenter = centerDistanceForEdgeGap(label, direction, gap);
      return {
        dx: direction.x * distanceToCenter,
        dy: direction.y * distanceToCenter,
        direction,
        standard: false
      };
    });
  }

  function maximumCandidateDistance(label) {
    const legacyMaximum = clamp(label.height * 1.6, 72, 140);
    const scaledMaximum = clamp(
      label.height * 1.55 + Math.min(label.width, label.height * 2.2) * 0.12,
      48,
      140
    );
    return Math.min(legacyMaximum, scaledMaximum);
  }

  function labelSpacingRadii(firstBox, secondBox, baseGap, options) {
    const source = options || {};
    const horizontalRatio = clamp(
      finiteNumber(source.horizontalSpacingRatio, 1.5),
      1,
      2.5
    );
    const referenceSize = Math.max(1, finiteNumber(source.referenceLabelSize, 90));
    const minimumScale = clamp(
      finiteNumber(source.minimumLabelInfluenceScale, 0.72),
      0.4,
      1
    );
    const maximumScale = Math.max(
      minimumScale,
      finiteNumber(source.maximumLabelInfluenceScale, 1.8)
    );
    const averageSize = (
      Math.sqrt(Math.max(1, boxArea(firstBox))) +
      Math.sqrt(Math.max(1, boxArea(secondBox)))
    ) / 2;
    const scale = clamp(averageSize / referenceSize, minimumScale, maximumScale);
    const vertical = Math.max(GEOMETRY_EPSILON, finiteNumber(baseGap, GEOMETRY_EPSILON)) * scale;
    return {
      horizontal: vertical * horizontalRatio,
      vertical,
      scale
    };
  }

  function axisGaps(firstBox, secondBox) {
    return {
      horizontal: Math.max(
        0,
        Math.max(firstBox.left - secondBox.right, secondBox.left - firstBox.right)
      ),
      vertical: Math.max(
        0,
        Math.max(firstBox.top - secondBox.bottom, secondBox.top - firstBox.bottom)
      )
    };
  }

  function spacingDistance(firstBox, secondBox, settings) {
    const gaps = axisGaps(firstBox, secondBox);
    const radii = labelSpacingRadii(firstBox, secondBox, 1, settings);
    return Math.hypot(
      gaps.horizontal / radii.horizontal,
      gaps.vertical / radii.vertical
    );
  }

  function spacingShortage(distance, baseGap) {
    return Math.max(0, 1 - distance / Math.max(GEOMETRY_EPSILON, baseGap));
  }

  function generateCandidates(label, context) {
    const { viewport, markers, avoidanceField, settings, weights } = context;
    const margin = settings.margin;
    const minimumX = viewport.x + margin + label.width / 2;
    const maximumX = viewport.x + viewport.width - margin - label.width / 2;
    const minimumY = viewport.y + margin + label.height / 2;
    const maximumY = viewport.y + viewport.height - margin - label.height / 2;
    const maximumDistance = maximumCandidateDistance(label);
    const requestedGaps = Array.isArray(settings.candidateGaps)
      ? settings.candidateGaps
      : [12, 18, 26, 36, 48, 60, 72, maximumDistance];
    const gaps = uniqueNumbers(requestedGaps
      .map((gap) => clamp(finiteNumber(gap, 0), 6, maximumDistance))
      .concat(maximumDistance));
    const mapWorldWidth = Math.max(
      1,
      finiteNumber(avoidanceField.mapWorldWidth, viewport.width)
    );
    const coastIdentityStart = mapWorldWidth * settings.coastIdentityStartRatio;
    const coastIdentityEnd = mapWorldWidth * settings.coastIdentityEndRatio;
    const coastSearchDistance = coastIdentityEnd +
      finiteNumber(avoidanceField.coastGeometryRadius, 0) +
      finiteNumber(avoidanceField.cellSize, 0);
    const coastDistance = typeof avoidanceField.coastCenterlineDistance === "function"
      ? avoidanceField.coastCenterlineDistance(label.marker, coastSearchDistance)
      : Infinity;
    const coastIdentity = coastlineIdentityWeight(coastDistance, {
      start: coastIdentityStart,
      end: coastIdentityEnd
    });
    const coastDirectionRadius = Math.max(
      finiteNumber(avoidanceField.cellSize, 1) * 3,
      mapWorldWidth * settings.coastDirectionRadiusRatio
    );
    const localCoastProfile = typeof avoidanceField.localCoastProfile === "function"
      ? avoidanceField.localCoastProfile(label.marker, coastDirectionRadius)
      : null;
    const offsetGroups = gaps.map((gap) => standardCandidateOffsets(label, gap).concat(
      freeCandidateOffsets(label, gap)
    ));
    let minimumCoastInterference = Infinity;
    if (localCoastProfile && coastIdentity > 0) {
      const scores = new Map();
      offsetGroups.forEach((offsets) => {
        offsets.forEach((offset) => {
          const key = `${offset.direction.x.toFixed(6)}:${offset.direction.y.toFixed(6)}`;
          if (!scores.has(key)) {
            scores.set(key, localCoastProfile.score(offset.direction));
          }
          offset.coastInterference = scores.get(key);
          minimumCoastInterference = Math.min(
            minimumCoastInterference,
            offset.coastInterference
          );
        });
      });
    }
    const candidates = [];
    const seen = new Set();
    const connectorThreshold = connectorThresholdForLabel(label, settings);

    gaps.forEach((gap, gapIndex) => {
      const offsets = offsetGroups[gapIndex];
      offsets.forEach((offset, offsetIndex) => {
        const rawX = label.marker.x + offset.dx;
        const rawY = label.marker.y + offset.dy;
        const centerX = clamp(rawX, minimumX, maximumX);
        const centerY = clamp(rawY, minimumY, maximumY);
        const box = boxFromCenter(centerX, centerY, label.width, label.height);
        const edgeDistance = distancePointToBox(label.marker, box);
        if (edgeDistance + GEOMETRY_EPSILON < gap) {
          return;
        }
        if (edgeDistance > maximumDistance + GEOMETRY_EPSILON) {
          return;
        }
        const key = `${Math.round(centerX * 4)}:${Math.round(centerY * 4)}`;
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        const coverage = avoidanceField.query(box);
        const connector = createConnector(label.marker, box, connectorThreshold);
        const farDistance = Math.max(0, edgeDistance - settings.closeDistance);
        const distanceCost = (
          edgeDistance * edgeDistance * weights.distance +
          farDistance * farDistance * weights.distanceFar
        ) * (1 + label.priority * 0.12);
        const coastInterference = Number.isFinite(minimumCoastInterference)
          ? Math.max(
            0,
            offset.coastInterference -
              minimumCoastInterference -
              settings.coastDirectionTolerance
          )
          : 0;
        const terrainCost =
          weights.coastDirection *
            coastIdentity *
            coastInterference *
            coastInterference +
          coverage.coast * weights.coast * coastIdentity +
          coverage.land * weights.land;
        const directionTierCost = offset.standard
          ? offset.directionTier * weights.directionTier
          : weights.freeAngle;
        const unaryCost =
          markerPenalty(label, box, markers, settings, weights) +
          distanceCost +
          directionTierCost +
          terrainCost;
        candidates.push({
          centerX,
          centerY,
          box,
          connector,
          edgeDistance,
          unaryCost,
          rank: gapIndex * offsets.length + offsetIndex
        });
      });
    });

    if (candidates.length === 0) {
      const centerX = clamp(label.marker.x, minimumX, maximumX);
      const centerY = clamp(label.marker.y, minimumY, maximumY);
      const box = boxFromCenter(centerX, centerY, label.width, label.height);
      candidates.push({
        centerX,
        centerY,
        box,
        connector: createConnector(label.marker, box, connectorThreshold),
        edgeDistance: distancePointToBox(label.marker, box),
        unaryCost: markerPenalty(label, box, markers, settings, weights),
        rank: 0
      });
    }

    candidates.sort(compareCandidates);
    return candidates;
  }

  // 候補同士の干渉を評価し、決定的な多開始探索で全体配置を解きます。
  function pairCost(first, second, settings, weights) {
    let cost = 0;
    const intersection = overlapArea(first.box, second.box);
    if (intersection > 0) {
      const ratio = intersection / Math.max(1, Math.min(boxArea(first.box), boxArea(second.box)));
      cost += weights.overlapBase +
        weights.overlap * ratio * ratio +
        weights.overlapLinear * ratio;
    } else {
      const distance = spacingDistance(first.box, second.box, settings);
      const nearShortage = spacingShortage(distance, settings.nearGap);
      if (nearShortage > 0) {
        const shortage = nearShortage;
        cost += weights.spacingNear * shortage * shortage;
      }
      const comfortableShortage = spacingShortage(distance, settings.comfortableGap);
      if (comfortableShortage > 0) {
        const shortage = comfortableShortage;
        cost += weights.spacing * shortage * shortage;
      }
      const regionalShortage = spacingShortage(distance, settings.regionalGap);
      if (regionalShortage > 0) {
        const shortage = regionalShortage;
        cost += weights.regionalSpacing * shortage * shortage;
      }
    }
    if (first.connector && lineIntersectsBox(first.connector, second.box)) {
      cost += weights.connectorThroughCard;
    }
    if (second.connector && lineIntersectsBox(second.connector, first.box)) {
      cost += weights.connectorThroughCard;
    }
    if (segmentsIntersect(first.connector, second.connector)) {
      cost += weights.connectorCrossing;
    }
    return cost;
  }

  function localCost(labelIndex, candidate, placements, spatialIndex, settings, weights) {
    let cost = candidate.unaryCost;
    spatialIndex.query(candidate, settings.spatialPadding).forEach((otherIndex) => {
      if (otherIndex !== labelIndex && placements[otherIndex]) {
        cost += pairCost(candidate, placements[otherIndex], settings, weights);
      }
    });
    return cost;
  }

  function totalCost(placements, settings, weights) {
    let cost = 0;
    for (let index = 0; index < placements.length; index += 1) {
      cost += placements[index].unaryCost;
      for (let otherIndex = index + 1; otherIndex < placements.length; otherIndex += 1) {
        cost += pairCost(placements[index], placements[otherIndex], settings, weights);
      }
    }
    return cost;
  }

  function buildIndex(placements, settings) {
    const index = createSpatialIndex(settings.spatialCellSize);
    placements.forEach((candidate, labelIndex) => {
      if (candidate) {
        index.add(labelIndex, candidate, settings.spatialPadding);
      }
    });
    return index;
  }

  function greedyPlacement(candidateSets, order, settings, weights) {
    const placements = new Array(candidateSets.length);
    const spatialIndex = createSpatialIndex(settings.spatialCellSize);
    order.forEach((labelIndex) => {
      let best = null;
      let bestCost = Number.POSITIVE_INFINITY;
      candidateSets[labelIndex].forEach((candidate) => {
        const cost = localCost(labelIndex, candidate, placements, spatialIndex, settings, weights);
        if (cost < bestCost - COST_EPSILON || (
          Math.abs(cost - bestCost) < COST_EPSILON &&
          candidate.rank < best.rank
        )) {
          best = candidate;
          bestCost = cost;
        }
      });
      placements[labelIndex] = best;
      spatialIndex.add(labelIndex, best, settings.spatialPadding);
    });
    return placements;
  }

  function coordinateDescent(placements, candidateSets, random, passes, settings, weights) {
    const spatialIndex = buildIndex(placements, settings);
    for (let pass = 0; pass < passes; pass += 1) {
      let changed = false;
      const order = shuffledIndices(placements.length, random);
      order.forEach((labelIndex) => {
        const current = placements[labelIndex];
        spatialIndex.remove(labelIndex);
        let best = current;
        let bestCost = localCost(labelIndex, current, placements, spatialIndex, settings, weights);
        candidateSets[labelIndex].forEach((candidate) => {
          const cost = localCost(labelIndex, candidate, placements, spatialIndex, settings, weights);
          if (cost < bestCost - COST_EPSILON || (
            Math.abs(cost - bestCost) < COST_EPSILON &&
            candidate.rank < best.rank
          )) {
            best = candidate;
            bestCost = cost;
          }
        });
        placements[labelIndex] = best;
        spatialIndex.add(labelIndex, best, settings.spatialPadding);
        changed = changed || best !== current;
      });
      if (!changed) {
        break;
      }
    }
    return placements;
  }

  function annealTemperature(step, steps) {
    const progress = step / Math.max(1, steps - 1);
    return ANNEAL_INITIAL_TEMPERATURE * Math.pow(ANNEAL_FINAL_RATIO, progress);
  }

  function acceptsAnnealMove(currentCost, proposalCost, temperature, random) {
    return proposalCost < currentCost ||
      random() < Math.exp((currentCost - proposalCost) / temperature);
  }

  function chooseAnnealGroup(rootIndex, placements, spatialIndex, random, settings) {
    if (settings.annealGroupSize <= 1) {
      return [rootIndex];
    }
    const nearby = Array.from(spatialIndex.query(
      placements[rootIndex],
      settings.spatialPadding
    ))
      .filter((labelIndex) => labelIndex !== rootIndex)
      .sort((a, b) => a - b);
    const group = [rootIndex];
    while (group.length < settings.annealGroupSize && nearby.length > 0) {
      const nearbyIndex = Math.floor(random() * nearby.length);
      group.push(nearby.splice(nearbyIndex, 1)[0]);
    }
    return group.sort((a, b) => a - b);
  }

  function groupCost(labelIndices, candidates, placements, spatialIndex, settings, weights) {
    let cost = 0;
    for (let indexInGroup = 0; indexInGroup < labelIndices.length; indexInGroup += 1) {
      const labelIndex = labelIndices[indexInGroup];
      const candidate = candidates[indexInGroup];
      cost += candidate.unaryCost;
      spatialIndex.query(candidate, settings.spatialPadding).forEach((otherIndex) => {
        if (otherIndex !== labelIndex && placements[otherIndex]) {
          cost += pairCost(candidate, placements[otherIndex], settings, weights);
        }
      });
      for (let otherInGroup = indexInGroup + 1; otherInGroup < labelIndices.length; otherInGroup += 1) {
        cost += pairCost(candidate, candidates[otherInGroup], settings, weights);
      }
    }
    return cost;
  }

  function randomCandidate(labelIndex, candidateSets, random) {
    const candidates = candidateSets[labelIndex];
    return candidates[Math.floor(random() * candidates.length)];
  }

  function sameCandidateList(first, second) {
    return first.every((candidate, index) => candidate === second[index]);
  }

  function restoreCandidateGroup(labelIndices, candidates, placements, spatialIndex, settings) {
    labelIndices.forEach((labelIndex, indexInGroup) => {
      const candidate = candidates[indexInGroup];
      placements[labelIndex] = candidate;
      spatialIndex.add(labelIndex, candidate, settings.spatialPadding);
    });
  }

  function annealCandidateGroup(
    labelIndices,
    placements,
    candidateSets,
    random,
    temperature,
    spatialIndex,
    settings,
    weights
  ) {
    const currentCandidates = labelIndices.map((labelIndex) => placements[labelIndex]);
    const proposalCandidates = labelIndices.map((labelIndex) =>
      randomCandidate(labelIndex, candidateSets, random)
    );
    if (sameCandidateList(proposalCandidates, currentCandidates)) {
      return;
    }
    labelIndices.forEach((labelIndex) => {
      spatialIndex.remove(labelIndex);
    });
    const currentCost = groupCost(
      labelIndices,
      currentCandidates,
      placements,
      spatialIndex,
      settings,
      weights
    );
    const proposalCost = groupCost(
      labelIndices,
      proposalCandidates,
      placements,
      spatialIndex,
      settings,
      weights
    );
    const candidates = acceptsAnnealMove(
      currentCost,
      proposalCost,
      temperature,
      random
    )
      ? proposalCandidates
      : currentCandidates;
    restoreCandidateGroup(labelIndices, candidates, placements, spatialIndex, settings);
  }

  function annealSingleStep(placements, candidateSets, random, temperature, spatialIndex, settings, weights) {
    const labelIndex = Math.floor(random() * placements.length);
    annealCandidateGroup(
      [labelIndex],
      placements,
      candidateSets,
      random,
      temperature,
      spatialIndex,
      settings,
      weights
    );
  }

  function annealGroupStep(placements, candidateSets, random, temperature, spatialIndex, settings, weights) {
    const rootIndex = Math.floor(random() * placements.length);
    const labelIndices = chooseAnnealGroup(rootIndex, placements, spatialIndex, random, settings);
    annealCandidateGroup(
      labelIndices,
      placements,
      candidateSets,
      random,
      temperature,
      spatialIndex,
      settings,
      weights
    );
  }

  function anneal(placements, candidateSets, random, steps, settings, weights) {
    if (placements.length < 2 || steps <= 0) {
      return placements;
    }
    const spatialIndex = buildIndex(placements, settings);
    for (let step = 0; step < steps; step += 1) {
      const temperature = annealTemperature(step, steps);
      if (random() < settings.annealGroupProbability) {
        annealGroupStep(placements, candidateSets, random, temperature, spatialIndex, settings, weights);
      } else {
        annealSingleStep(placements, candidateSets, random, temperature, spatialIndex, settings, weights);
      }
    }
    return placements;
  }

  function solveCandidateSets(candidateSets, baseSeed, settings, weights) {
    let bestPlacements = null;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let start = 0; start < settings.starts; start += 1) {
      const random = createRandom(baseSeed + Math.imul(start + 1, 2654435761));
      const order = shuffledIndices(candidateSets.length, random);
      let placements = greedyPlacement(candidateSets, order, settings, weights);
      placements = coordinateDescent(
        placements,
        candidateSets,
        random,
        settings.descentPasses,
        settings,
        weights
      );
      placements = anneal(
        placements,
        candidateSets,
        random,
        settings.annealSteps,
        settings,
        weights
      );
      placements = coordinateDescent(
        placements,
        candidateSets,
        random,
        settings.finalPasses,
        settings,
        weights
      );
      const cost = totalCost(placements, settings, weights);
      if (cost < bestCost) {
        bestCost = cost;
        bestPlacements = placements.slice();
      }
    }
    return bestPlacements;
  }

  function defaultStartCount(labelCount) {
    if (labelCount <= 1) {
      return 1;
    }
    if (labelCount > 100) {
      return 3;
    }
    return labelCount > 12 ? 5 : 4;
  }

  function defaultAnnealSteps(labelCount) {
    if (labelCount <= 1) {
      return 0;
    }
    if (labelCount <= 5) {
      return labelCount * 220;
    }
    if (labelCount <= 24) {
      return Math.max(3600, labelCount * 360);
    }
    if (labelCount <= 100) {
      return Math.min(12000, labelCount * 220);
    }
    return Math.min(10000, labelCount * 80);
  }

  function plannerSettings(options, labelCount) {
    const source = options || {};
    const option = (name, fallback) => finiteNumber(source[name], fallback);
    const bounded = (name, fallback, minimum, maximum) =>
      clamp(option(name, fallback), minimum, maximum);
    const integer = (name, fallback, minimum) =>
      Math.max(minimum, Math.floor(option(name, fallback)));
    const explicitConnectorThreshold = Number.isFinite(Number(source.connectorThreshold))
      ? Math.max(0, Number(source.connectorThreshold))
      : null;
    const regionalGap = bounded("regionalGap", 88, 54, 128);
    const horizontalSpacingRatio = bounded("horizontalSpacingRatio", 1.5, 1, 2.5);
    const maximumLabelInfluenceScale = bounded(
      "maximumLabelInfluenceScale",
      1.8,
      1,
      2.5
    );
    return {
      margin: Math.max(0, option("margin", DEFAULT_MARGIN)),
      nearGap: bounded("nearGap", 12, 8, 18),
      comfortableGap: bounded("comfortableGap", 32, 20, 44),
      regionalGap,
      horizontalSpacingRatio,
      referenceLabelSize: Math.max(40, option("referenceLabelSize", 90)),
      minimumLabelInfluenceScale: bounded("minimumLabelInfluenceScale", 0.72, 0.4, 1),
      maximumLabelInfluenceScale,
      spatialPadding: regionalGap * horizontalSpacingRatio * maximumLabelInfluenceScale,
      coastIdentityStartRatio: bounded("coastIdentityStartRatio", 0.0035, 0.001, 0.008),
      coastIdentityEndRatio: bounded("coastIdentityEndRatio", 0.01, 0.006, 0.018),
      coastDirectionRadiusRatio: bounded("coastDirectionRadiusRatio", 0.018, 0.01, 0.035),
      coastDirectionTolerance: bounded("coastDirectionTolerance", 0.16, 0.05, 0.35),
      closeDistance: bounded("closeDistance", 20, 12, 32),
      markerClearance: bounded("markerClearance", 24, 12, 40),
      connectorThreshold: explicitConnectorThreshold,
      connectorThresholdRatio: bounded(
        "connectorThresholdRatio",
        DEFAULT_CONNECTOR_THRESHOLD_RATIO,
        0.45,
        1.2
      ),
      spatialCellSize: Math.max(80, option("spatialCellSize", 180)),
      candidateGaps: Array.isArray(source.candidateGaps) ? source.candidateGaps : null,
      starts: integer("starts", defaultStartCount(labelCount), 1),
      descentPasses: integer("descentPasses", 7, 0),
      finalPasses: integer("finalPasses", 4, 0),
      annealSteps: integer("annealSteps", defaultAnnealSteps(labelCount), 0),
      annealGroupProbability: bounded("annealGroupProbability", labelCount > 8 ? 0.32 : 0.18, 0, 1),
      annealGroupSize: integer("annealGroupSize", labelCount > 160 ? 4 : 3, 1)
    };
  }

  function planLabelLayout(options) {
    const source = options || {};
    const labelCount = Array.isArray(source.labels) ? source.labels.length : 0;
    const settings = plannerSettings(source.options, labelCount);
    const normalized = normalizeInputs(source, settings.margin);
    const { labels, markers, viewport } = normalized;
    if (labels.length === 0) {
      return [];
    }
    const weights = {
      ...DEFAULT_WEIGHTS,
      ...((source.options && source.options.weights) || {})
    };
    const context = {
      viewport,
      markers,
      avoidanceField: source.avoidanceField &&
        typeof source.avoidanceField.query === "function"
        ? source.avoidanceField
        : emptyAvoidanceField(),
      settings,
      weights
    };
    const candidateSets = labels.map((label) => generateCandidates(label, context));
    const baseSeed = hashSeed(source.seed);
    const bestPlacements = solveCandidateSets(candidateSets, baseSeed, settings, weights);

    return labels.map((label, index) => {
      const candidate = bestPlacements[index];
      return {
        id: label.id,
        centerX: candidate.centerX,
        centerY: candidate.centerY,
        box: { ...candidate.box },
        connector: candidate.connector
          ? {
            from: { ...candidate.connector.from },
            to: { ...candidate.connector.to }
          }
          : null
      };
    });
  }

  return {
    coastlineIdentityWeight,
    createAvoidanceField,
    distancePointToBox,
    labelSpacingRadii,
    planLabelLayout,
    segmentsIntersect,
    unwrapProjectedRing
  };
}));
